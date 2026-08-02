import * as vscode from "vscode";

import type { Registry } from "../picker/registry.js";
import type { Picker } from "../picker/registry.js";
import type { Candidate } from "../picker/types.js";
import type { PickerContext } from "../picker/context.js";
import type { InboundMessage, OutboundMessage, PickerConfig, RowMessage } from "./protocol.js";
import { buildPickerConfig, shapeCandidateRows } from "./protocol.js";
import { createPreviewDebounce } from "./debounce.js";
import { createVirtualPreview } from "./virtualPreview.js";
import type { VirtualPreviewProvider } from "./virtualPreview.js";
import { readPreviewContent as readPreviewContentPolicy } from "./previewContent.js";
import type { PreviewFilePrimitives, PreviewContent } from "./previewContent.js";
import type { HostEnv, Origin } from "./lifecycle.js";
import { runCancel, runExit } from "./lifecycle.js";
import {
  readVsconsultConfig,
  type VsconsultConfig,
  type VsconsultConfigurationAccessor,
} from "./config.js";

// ---------------------------------------------------------------------------
// Session state — alive while a picker is active
// ---------------------------------------------------------------------------

interface HostSession {
  picker: Picker;
  origin: Origin | undefined;
  panelWasVisible: boolean;
  candidates: Candidate[];
  query: string;
  /** AbortController for the current source run. Aborted on exit / query re-run. */
  sourceController: AbortController;
  /** Session-owned virtual preview provider. */
  virtualPreview: VirtualPreviewProvider;
  /** Monotonically bumped on every `select` — stale results are dropped. */
  previewGeneration: number;
  /** Set to true once the session has been torn down. */
  tornDown: boolean;
}

// ---------------------------------------------------------------------------
// Targeted virtual-preview tab teardown
// ---------------------------------------------------------------------------

/**
 * Closes only the tab whose input URI matches the virtual preview URI.
 * Never touches unrelated editors, groups, or dirty documents.
 */
async function closeVirtualPreviewDocument(uri: vscode.Uri): Promise<void> {
  const target = uri.toString();
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = (tab as any).input;
      if (input && typeof input === "object" && "uri" in input) {
        const tabUri = (input as { uri: vscode.Uri }).uri;
        if (tabUri?.toString() === target) {
          await vscode.window.tabGroups.close(tab);
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PickerHost — picker-agnostic webview view provider
// ---------------------------------------------------------------------------

/**
 * Minimum gap between consecutive cumulative `results` posts during
 * streaming (leading+trailing throttle window). Bounds the IPC rate so
 * a broad liveGrep query matching thousands of lines does not flood the
 * webview with dozens of multi-thousand-row messages per second.
 */
const RESULTS_THROTTLE_MS = 16;

export class PickerHost implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private session: HostSession | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounce: ReturnType<typeof createPreviewDebounce>;
  /** Throttle timer for `sendResults` (leading+trailing). */
  private resultsTimer: ReturnType<typeof setTimeout> | undefined;
  /** True when a throttled results post is pending (trailing edge). */
  private resultsDirty = false;
  /**
   * True while a default-picker auto-start (resolve / visibility / focus /
   * teardown trigger) is in flight. Guards against a second trigger firing
   * before the first start has created its session — real VS Code resolves
   * the view and can fire `onDidChangeVisibility(true)` back-to-back.
   */
  private defaultStarting = false;
  /**
   * Current vsconsult settings. Re-read live on configuration change so
   * the debounce delay and preview byte limits update without restarting
   * the picker. `fileExcludes` is consumed at picker start (see
   * `createFilePicker`), so it applies to the next picker invocation.
   */
  private config: VsconsultConfig;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly registry: Registry,
    private readonly env: HostEnv,
    private readonly viewId: string,
    /**
     * Picker started when the panel is visible but idle (the chooser as the
     * panel's home screen). The host never names a picker of its own — this
     * is purely an injected id, wired to `"pick"` at activation.
     */
    private readonly defaultPickerId?: string,
  ) {
    this.config = readVsconsultConfig(vscode.workspace.getConfiguration("vsconsult") as unknown as VsconsultConfigurationAccessor);

    // Preview debounce — when the timer fires, look up the candidate in
    // the active session and call the active picker's preview action.
    // The delay is read live from `this.config` so a settings change is
    // picked up on the next schedule without rebuilding the debouncer.
    this.debounce = createPreviewDebounce(async (id: string) => {
      const session = this.session;
      if (!session) return;
      if (session.tornDown) return;
      const candidate = session.candidates.find((c) => c.id === id);
      if (!candidate) return;
      const gen = session.previewGeneration;
      await session.picker.preview(candidate, this.buildPickerContext(session, gen));
    }, () => this.config.previewDebounceDelayMs);

    // Live reload: re-read settings when the user edits them in the UI.
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("vsconsult")) {
          this.config = readVsconsultConfig(
            vscode.workspace.getConfiguration("vsconsult") as unknown as VsconsultConfigurationAccessor,
          );
        }
      }),
    );
  }

  /** Current configured file-exclude patterns. Read live by the file
   * source at each picker start, so settings changes apply to the next
   * invocation without restarting the picker. */
  get fileExcludes(): string[] {
    return this.config.fileExcludes;
  }

  // -----------------------------------------------------------------------
  // WebviewViewProvider
  // -----------------------------------------------------------------------

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = pickerHtml(webviewView.webview);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: InboundMessage) =>
        this.handleMessage(message),
      ),
      webviewView.onDidDispose(() => {
        this.view = undefined;
        this.debounce.cancel();
        const session = this.session;
        if (session) {
          this.session = undefined;
          void this.teardownSession(session).catch(() => {
            // Teardown is best-effort on dispose — the extension host
            // may already be shutting down.
          });
        }
      }),
      webviewView.onDidChangeVisibility(() => {
        // The panel became visible (panel opened, tab switched back). If no
        // picker is running, show the default picker — with panel input
        // focus, exactly as a normal start would. (The 1.85 typings deliver
        // no payload, so read the view's current visibility.)
        if (this.view?.visible) {
          this.maybeStartDefault(true);
        }
      }),
    );

    // The panel was just opened — auto-start the default picker so the
    // chooser greets the user as the panel's home screen.
    this.maybeStartDefault(true, true);
  }

  // -----------------------------------------------------------------------
  // Picker invocation
  // -----------------------------------------------------------------------

  async start(pickerId: string): Promise<void> {
    await this.beginSession(pickerId, { focus: true });
  }

  /**
   * Start the default picker if the panel is idle: a default is configured,
   * no session is running, and no auto-start is already in flight.
   *
   * `focus` mirrors a normal start's panel-input focus; the teardown trigger
   * passes false so a cancelled picker's editor focus is not yanked back.
   * `panelWasVisible` overrides the visibility capture used by `beginSession`
   * — the resolve trigger passes true because the panel was just opened even
   * if the view is not yet marked visible.
   */
  private maybeStartDefault(focus: boolean, panelWasVisible?: boolean): void {
    if (!this.defaultPickerId) return;
    if (this.defaultStarting) return;
    if (this.session) return;
    this.defaultStarting = true;
    void this.beginSession(this.defaultPickerId, { focus, panelWasVisible }).finally(
      () => {
        this.defaultStarting = false;
      },
    );
  }

  /**
   * Begin a picker session: capture the origin, focus the panel input unless
   * opted out, then configure the shared view and run the source.
   */
  private async beginSession(
    pickerId: string,
    opts: { focus: boolean; panelWasVisible?: boolean },
  ): Promise<void> {
    const picker = this.registry.get(pickerId);
    if (!picker) {
      throw new Error(`Picker "${pickerId}" is not registered`);
    }

    this.debounce.cancel();

    // Tear down any previously active session before replacing it.
    const previous = this.session;
    if (previous) {
      this.session = undefined;
      await this.teardownSession(previous);
    }

    // Capture the origin editor state
    const editor = vscode.window.activeTextEditor;
    const origin: Origin | undefined = editor
      ? {
          uri: editor.document.uri.fsPath,
          selection: {
            line: editor.selection.active.line,
            character: editor.selection.active.character,
          },
          viewColumn: editor.viewColumn,
        }
      : undefined;

    // Check whether the vsconsult panel is already visible so we can
    // restore that state on exit.
    const panelWasVisible = opts.panelWasVisible ?? (this.view?.visible ?? false);

    // Focus the shared view so the input field receives keyboard focus.
    // The teardown-triggered re-arm opts out so a cancelled picker's editor
    // focus is preserved.
    if (opts.focus) {
      await vscode.commands.executeCommand(`${this.viewId}.focus`);
    }

    // Initialise session
    const sourceController = new AbortController();
    const virtualPreview = createVirtualPreview();
    this.session = { picker, origin, panelWasVisible, candidates: [], query: "", sourceController, virtualPreview, previewGeneration: 0, tornDown: false };

    // Send the picker's configuration once — the view holds this until
    // the next start() call.
    this.post({ type: "configure", config: buildPickerConfig(picker) });
    this.post({ type: "reset" });
    this.post({ type: "status", message: "Loading…" });

    // Run the source. Snapshot sources deliver all candidates at once;
    // stream sources also provide an `updates` channel consumed below.
    const sourceSession = picker.source("", sourceController.signal);
    const allCandidates = await sourceSession.candidates;

    // Guard: the user may have cancelled or started another picker while
    // the source was resolving.
    if (!this.session || this.session.picker !== picker) return;

    this.session.candidates = allCandidates;
    this.sendResults();

    // Stream — consume incremental batches if the source provides them.
    // Snapshot sources omit `updates`, so the for-await is a no-op.
    if (sourceSession.updates) {
      let aborted = false;
      try {
        for await (const batch of sourceSession.updates) {
          // Guard: session may have been replaced (cancelled / new picker)
          // or the source may have been aborted.
          if (this.session === undefined || sourceController.signal.aborted) {
            aborted = true;
            break;
          }
          this.session.candidates.push(...batch);
          this.sendResults();
        }
      } catch (err) {
        // If the stream errors after abort, swallow — the host already
        // stopped or is about to stop.
        if (!sourceController.signal.aborted) {
          this.post({
            type: "status",
            message: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
            error: true,
          });
        }
        aborted = true;
      }

      // Signal source completion only if the stream ended naturally —
      // not because the source was aborted or the session was replaced.
      if (!aborted && this.session !== undefined) {
        this.post({ type: "complete" });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Disposable
  // -----------------------------------------------------------------------

  dispose(): void {
    this.debounce.cancel();
    this.cancelResultsTimer();
    for (const d of this.disposables) {
      d.dispose();
    }
  }

  // -----------------------------------------------------------------------
  // Message handling
  // -----------------------------------------------------------------------

  private async handleMessage(message: InboundMessage): Promise<void> {
    switch (message.type) {
      case "ready":
        // The view has (re-)loaded. If a session exists, re-send the full
        // state so the view can reconstruct itself.
        if (this.session) {
          this.post({ type: "configure", config: buildPickerConfig(this.session.picker) });
          // On the first invocation, start() may post reset before the newly
          // created webview script is ready to receive it. Re-send reset as
          // part of ready-state reconstruction so the input is focused.
          this.post({ type: "reset" });
          this.post({ type: "setQuery", query: this.session.query });
          this.sendResults();
        }
        break;

      case "query":
        if (!this.session) return;
        this.session.query = message.query;

        if (this.session.picker.queryDriven) {
          // Abort the old source run and re-run with the new query.
          this.session.sourceController.abort();
          await this.rerunSource(message.query);
        } else {
          // Pre-materialized: just re-narrow the existing candidates.
          this.sendResults();
        }
        break;

      case "select":
        if (!this.session) return;
        this.session.previewGeneration++;
        this.debounce.schedule(message.id);
        break;

      case "accept":
        await this.handleAccept(message.id);
        break;

      case "cancel":
        await this.handleCancel();
        break;

      case "focus":
        // The panel webview gained focus (e.g. the user clicked its tab). If
        // no picker is running, show the default picker. The webview already
        // has focus, so this re-arm does not invoke the panel-focus command
        // — and it can never steal focus from the editor.
        this.maybeStartDefault(false);
        break;
    }
  }

  // -----------------------------------------------------------------------
  // Re-run source (query-driven pickers)
  // -----------------------------------------------------------------------

  /**
   * Abort the current source run and re-run the source with a new query.
   * Used when a query-driven picker's query changes.
   */
  private async rerunSource(query: string): Promise<void> {
    const session = this.session;
    if (!session) return;

    const sourceController = new AbortController();
    session.sourceController = sourceController;

    // Clear existing candidates — the new source will provide fresh results.
    session.candidates = [];
    this.sendResults();

    const sourceSession = session.picker.source(query, sourceController.signal);
    const allCandidates = await sourceSession.candidates;

    // Guard: session may have been replaced while awaiting.
    if (this.session !== session) return;

    session.candidates = allCandidates;
    this.sendResults();

    // Stream — consume incremental batches if the source provides them.
    if (sourceSession.updates) {
      let aborted = false;
      try {
        for await (const batch of sourceSession.updates) {
          if (this.session !== session || sourceController.signal.aborted) {
            aborted = true;
            break;
          }
          session.candidates.push(...batch);
          this.sendResults();
        }
      } catch (err) {
        if (!sourceController.signal.aborted) {
          this.post({
            type: "status",
            message: `Stream error: ${err instanceof Error ? err.message : String(err)}`,
            error: true,
          });
        }
        aborted = true;
      }

      // Signal source completion only if the stream ended naturally.
      if (!aborted && this.session === session) {
        this.post({ type: "complete" });
      }
    }
  }

  // -----------------------------------------------------------------------
  // Accept
  // -----------------------------------------------------------------------

  private async handleAccept(id: string): Promise<void> {
    const session = this.session;
    if (!session) return;

    const candidate = session.candidates.find((c) => c.id === id);
    if (!candidate) return;

    this.debounce.cancel();

    try {
      await session.picker.accept(candidate, this.buildPickerContext(session));
    } catch (error) {
      this.post({
        type: "status",
        message: `Could not accept: ${error instanceof Error ? error.message : String(error)}`,
        error: true,
      });
      return;
    }

    // Accept may have started another picker via context.startPicker,
    // replacing this session. The host must not tear down the freshly
    // started one — exit only the session accept was invoked on.
    if (this.session === session) {
      await this.exit();
    }
  }

  // -----------------------------------------------------------------------
  // Cancel
  // -----------------------------------------------------------------------

  private async handleCancel(): Promise<void> {
    const session = this.session;
    if (!session) return;

    this.debounce.cancel();
    await runCancel(this.env, session.origin);
    await this.exit();
  }

  // -----------------------------------------------------------------------
  // Exit
  // -----------------------------------------------------------------------

  private async exit(): Promise<void> {
    const session = this.session;
    if (!session) return;

    // Idempotent guard — a session is torn down at most once.
    if (session.tornDown) return;

    this.session = undefined;
    await this.teardownSession(session);
    this.post({ type: "idle" });
    await runExit(this.env, session.panelWasVisible);

    // The session ended while the panel stayed visible (the pinned-exit gap
    // the visibility-only trigger misses — the panel never changed
    // visibility). Re-arm the default picker so the chooser becomes the
    // panel's idle state again. Deliberately no panel-input focus: runCancel
    // just restored the editor, and the re-arm must not yank focus back.
    if (this.view?.visible) {
      this.maybeStartDefault(false);
    }
  }

  /**
   * Tear down a single session's virtual preview and source.
   * Idempotent — safe to call multiple times on the same session.
   */
  private async teardownSession(session: HostSession): Promise<void> {
    if (session.tornDown) return;
    session.tornDown = true;
    session.sourceController.abort();
    const uri = session.virtualPreview.virtualUri("");
    await closeVirtualPreviewDocument(uri);
    session.virtualPreview.closeContent();
    session.virtualPreview.dispose();
  }

  // -----------------------------------------------------------------------
  // Results
  // -----------------------------------------------------------------------

  private sendResults(): void {
    // Throttle: post at most one cumulative results message per
    // RESULTS_THROTTLE_MS window. Stream sources (liveGrep) can emit
    // dozens of batches per second for a broad query, each otherwise
    // triggering a full-cumulative postMessage (thousands of rows). That
    // floods the webview IPC and makes query changes feel like they
    // "keep loading then jump to 0": the abort stops new batches but
    // already-posted large results messages keep draining in the view.
    // Leading+trailing throttle: fire immediately on the first call
    // after an idle window (so a query-change clear snaps to 0 at
    // once), then coalesce subsequent calls into one trailing post.
    if (this.resultsTimer !== undefined) {
      this.resultsDirty = true;
      return;
    }
    this.flushResultsNow();
    this.resultsTimer = setTimeout(() => {
      this.resultsTimer = undefined;
      if (this.resultsDirty) {
        this.resultsDirty = false;
        this.flushResultsNow();
      }
    }, RESULTS_THROTTLE_MS);
  }

  private flushResultsNow(): void {
    const session = this.session;
    if (!session) return;

    const { picker, candidates, query } = session;
    const narrowed = picker.narrow(query, candidates);
    const total = narrowed.length;

    // Cap the rows sent to the webview. The view renders one DOM node per
    // row; without a cap a broad liveGrep query (thousands of matches)
    // makes each render expensive and backlogs during rapid typing. The
    // status line always reports the true total and notes truncation.
    const cap = this.config.maxResultsRows;
    const capped = cap > 0 && total > cap ? narrowed.slice(0, cap) : narrowed;
    const rows = shapeCandidateRows(picker, capped);

    const count = `${total.toLocaleString()} candidate${total === 1 ? "" : "s"}`;
    const status = capped.length < total
      ? `${count} (showing first ${capped.length.toLocaleString()})`
      : count;

    this.post({ type: "results", rows, status });
  }

  /** Cancel any pending throttled results post. Used on teardown so no
   * late results message arrives after the session is gone. */
  private cancelResultsTimer(): void {
    if (this.resultsTimer !== undefined) {
      clearTimeout(this.resultsTimer);
      this.resultsTimer = undefined;
    }
    this.resultsDirty = false;
  }

  // -----------------------------------------------------------------------
  // PickerContext factory
  // -----------------------------------------------------------------------

  private buildPickerContext(session: HostSession, previewGen?: number): PickerContext {
    return {
      openTextDocument: async (
        uri: string,
        options?: { preview?: boolean },
      ): Promise<unknown> => {
        return vscode.window.showTextDocument(vscode.Uri.file(uri), {
          viewColumn: session?.origin?.viewColumn ?? vscode.ViewColumn.Active,
          preserveFocus: options?.preview ?? false,
          preview: options?.preview ?? false,
        });
      },
      readFile: async (uri: string): Promise<string> => {
        const { readFile } = await import("node:fs/promises");
        return readFile(uri, "utf8");
      },
      readPreviewContent: async (uri: string): Promise<PreviewContent> => {
        const fsPrimitives: PreviewFilePrimitives = {
          stat: async (p) => {
            const { stat } = await import("node:fs/promises");
            const s = await stat(p);
            return { size: s.size };
          },
          readBytes: async (p, maxBytes) => {
            // Bounded read: open the file and read at most maxBytes from the
            // start. Never allocates a full-file buffer just to truncate it.
            const { open } = await import("node:fs/promises");
            const handle = await open(p, "r");
            try {
              const buf = Buffer.alloc(maxBytes);
              const { bytesRead } = await handle.read(buf, 0, maxBytes, 0);
              return new Uint8Array(buf.buffer, buf.byteOffset, bytesRead);
            } finally {
              await handle.close();
            }
          },
        };
        return readPreviewContentPolicy(uri, fsPrimitives, {
          fullMaxBytes: this.config.previewFullMaxBytes,
          excerptMaxBytes: this.config.previewExcerptMaxBytes,
        });
      },
      revealPosition: (uri: string, position: { line: number; character: number }): void => {
        const editor = vscode.window.visibleTextEditors.find(
          (e) => e.document.uri.fsPath === uri,
        );
        if (editor) {
          const pos = new vscode.Position(position.line, position.character);
          editor.selection = new vscode.Selection(pos, pos);
          editor.revealRange(
            new vscode.Range(pos, pos),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
        }
      },
      executeCommand: async (
        command: string,
        ...args: unknown[]
      ): Promise<unknown> => {
        return vscode.commands.executeCommand(command, ...args);
      },
      readOrigin: () => {
        if (!session?.origin) return undefined;
        return { uri: session.origin.uri };
      },
      startPicker: (id: string): Promise<void> => this.start(id),
      resolveLanguageId: async (uri: string): Promise<string | undefined> => {
        try {
          const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(uri));
          return doc.languageId;
        } catch {
          // Non-fatal: file may not exist, be binary, or otherwise
          // fail to open.  Plain text is the safe fallback.
          return undefined;
        }
      },
      showPreview: async (p: {
        text: string;
        title: string;
        languageId?: string;
        reveal?: { line: number; character: number };
      }): Promise<void> => {
        // Drop stale: session replaced, torn down, or newer selection pending.
        if (this.session !== session || session.tornDown) return;
        if (previewGen !== undefined && session.previewGeneration !== previewGen) return;
        session.virtualPreview.updateContent(p.text, p.title, p.languageId);
        const uri = session.virtualPreview.virtualUri("");
        try {
          const editor = await vscode.window.showTextDocument(uri, {
            viewColumn: session?.origin?.viewColumn ?? vscode.ViewColumn.Active,
            preserveFocus: true,
            preview: false,
          });
          // Apply language mode to the virtual document so
          // recognisable source files get syntax highlighting.
          // When no language is associated (undefined), explicitly
          // reset to plaintext so a previous candidate's mode does
          // not leak onto the current preview.
          const targetLanguage = p.languageId ?? "plaintext";
          if (editor?.document) {
            // Guard stale: a newer selection may have fired while
            // we awaited showTextDocument.
            if (this.session !== session || session.tornDown) return;
            if (previewGen !== undefined && session.previewGeneration !== previewGen) return;
            // Reveal position — scroll the virtual preview to the target line
            // (behind the guard so a stale reveal cannot overwrite a newer
            // selection — ticket 11). Unlike revealPosition, this does NOT set
            // editor.selection — the virtual preview is read-only and moving
            // the cursor there would be misleading.
            if (p.reveal) {
              const pos = new vscode.Position(p.reveal.line, p.reveal.character);
              editor.revealRange(
                new vscode.Range(pos, pos),
                vscode.TextEditorRevealType.InCenterIfOutsideViewport,
              );
            }
            await vscode.languages.setTextDocumentLanguage(editor.document, targetLanguage);
          }
        } catch {
          // showTextDocument may fail if the provider was disposed
          // concurrently — the debounce swallows this silently.
        }
      },
      closePreview: async (): Promise<void> => {
        if (this.session !== session || session.tornDown) return;
        const uri = session.virtualPreview.virtualUri("");
        await closeVirtualPreviewDocument(uri);
        // Re-check — teardown may have disposed the provider during
        // the async close above.  closeContent is idempotent but fires
        // the change-emitter, so guard before doing so.
        if (this.session !== session || session.tornDown) return;
        session.virtualPreview.closeContent();
      },
    };
  }

  // -----------------------------------------------------------------------
  // postMessage helper
  // -----------------------------------------------------------------------

  private post(message: OutboundMessage): void {
    void this.view?.webview.postMessage(message);
  }
}

// ---------------------------------------------------------------------------
// HostEnv — production implementation wrapping vscode APIs
// ---------------------------------------------------------------------------

export const vscodeHostEnv: HostEnv = {
  async restoreOrigin(origin: Origin): Promise<void> {
    const editor = await vscode.window.showTextDocument(
      vscode.Uri.file(origin.uri),
      {
        viewColumn: origin.viewColumn,
        preserveFocus: false,
        preview: false,
      },
    );
    const pos = new vscode.Position(
      origin.selection.line,
      origin.selection.character,
    );
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(
      new vscode.Range(pos, pos),
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  },

  async focusActiveEditorGroup(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
  },

  async closePanel(): Promise<void> {
    await vscode.commands.executeCommand("workbench.action.closePanel");
  },
};

// ---------------------------------------------------------------------------
// Static webview HTML — host-owned, generated once at resolve
// ---------------------------------------------------------------------------

function pickerHtml(webview: vscode.Webview): string {
  const nonce = createNonce();
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>vsconsult</title>
  <style>
    :root { color-scheme: light dark; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--vscode-foreground);
      background: var(--vscode-panel-background, var(--vscode-editor-background));
      font: var(--vscode-font-size) var(--vscode-font-family);
      overflow: hidden;
    }
    .picker { display: grid; grid-template-rows: auto auto 1fr; height: 100vh; }
    .query-wrap { padding: 8px 10px 6px; }
    #query {
      display: block; width: 100%;
      padding: 3px 8px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      outline: none;
    }
    #query:focus { border-color: var(--vscode-focusBorder); }
    #status {
      min-height: 20px;
      padding: 0 10px 5px;
      color: var(--vscode-descriptionForeground);
      font-size: 0.9em;
    }
    #status.error { color: var(--vscode-errorForeground); }
    #results { overflow: auto; padding-bottom: 6px; outline: none; }
    .candidate {
      display: grid;
      grid-template-columns: minmax(10rem, 0.38fr) minmax(12rem, 1fr);
      gap: 12px;
      align-items: center;
      min-height: 24px;
      padding: 2px 10px;
      cursor: default;
    }
    .candidate:hover { background: var(--vscode-list-hoverBackground); }
    .candidate.selected {
      color: var(--vscode-list-activeSelectionForeground);
      background: var(--vscode-list-activeSelectionBackground);
    }
    .primary, .secondary { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .primary { font-weight: 500; }
    .secondary { color: var(--vscode-descriptionForeground); }
    .candidate.selected .secondary { color: inherit; opacity: 0.8; }
    .empty { padding: 12px 10px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <main class="picker">
    <div class="query-wrap">
      <input id="query" type="text" aria-label="Narrow candidates" autocomplete="off" spellcheck="false">
    </div>
    <div id="status" aria-live="polite"></div>
    <div id="results" role="listbox" aria-label="Candidates"></div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const query = document.getElementById("query");
    const results = document.getElementById("results");
    const status = document.getElementById("status");
    let candidates = [];
    let selectedIndex = -1;
    let emptyState = "";

    function selectedCandidate() {
      return selectedIndex >= 0 ? candidates[selectedIndex] : undefined;
    }

    function select(index, preview = true) {
      if (candidates.length === 0) {
        selectedIndex = -1;
        return;
      }
      selectedIndex = (index + candidates.length) % candidates.length;
      const rows = results.querySelectorAll(".candidate");
      rows.forEach((row, rowIndex) => {
        const selected = rowIndex === selectedIndex;
        row.classList.toggle("selected", selected);
        row.setAttribute("aria-selected", String(selected));
        if (selected) row.scrollIntoView({ block: "nearest" });
      });
      const candidate = selectedCandidate();
      if (preview && candidate) vscode.postMessage({ type: "select", id: candidate.id });
    }

    function render() {
      results.replaceChildren();
      if (candidates.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = emptyState;
        empty.id = "empty-msg";
        results.append(empty);
        selectedIndex = -1;
        return;
      }
      for (const [index, row] of candidates.entries()) {
        const el = document.createElement("div");
        el.className = "candidate";
        el.setAttribute("role", "option");
        el.setAttribute("aria-selected", "false");
        if (row.tooltip) el.title = row.tooltip;

        const primary = document.createElement("span");
        primary.className = "primary";
        primary.textContent = row.primary;

        const secondary = document.createElement("span");
        secondary.className = "secondary";
        secondary.textContent = row.secondary ?? "";

        el.append(primary, secondary);

        el.addEventListener("mousedown", (event) => {
          event.preventDefault();
          select(index);
          query.focus();
        });
        el.addEventListener("dblclick", () => {
          vscode.postMessage({ type: "accept", id: row.id });
        });
        results.append(el);
      }
      select(0);
    }

    query.addEventListener("input", () => {
      vscode.postMessage({ type: "query", query: query.value });
    });

    query.addEventListener("keydown", (event) => {
      const next = event.key === "ArrowDown" || (event.ctrlKey && event.key.toLowerCase() === "n");
      const previous = event.key === "ArrowUp" || (event.ctrlKey && event.key.toLowerCase() === "p");
      if (next || previous) {
        event.preventDefault();
        select(selectedIndex + (next ? 1 : -1));
      } else if (event.key === "Enter") {
        event.preventDefault();
        const candidate = selectedCandidate();
        if (candidate) vscode.postMessage({ type: "accept", id: candidate.id });
      } else if (event.key === "Escape") {
        event.preventDefault();
        vscode.postMessage({ type: "cancel" });
      }
    });

    window.addEventListener("message", ({ data }) => {
      if (data.type === "configure") {
        document.title = "vsconsult — " + data.config.label;
        query.placeholder = data.config.placeholder;
        emptyState = data.config.emptyState;
      } else if (data.type === "setQuery") {
        query.value = data.query;
      } else if (data.type === "reset") {
        candidates = [];
        selectedIndex = -1;
        query.value = "";
        results.replaceChildren();
        status.textContent = "";
        status.classList.remove("error");
        query.focus();
      } else if (data.type === "results") {
        candidates = data.rows;
        status.textContent = data.status;
        status.classList.remove("error");
        render();
      } else if (data.type === "status") {
        status.textContent = data.message;
        status.classList.toggle("error", Boolean(data.error));
      } else if (data.type === "idle") {
        candidates = [];
        selectedIndex = -1;
        query.value = "";
        results.replaceChildren();
        status.textContent = "Run “vsconsult: Find File” to begin.";
        status.classList.remove("error");
      }
    });

    // Focus/activation hook: clicking back into the panel does not always
    // fire onDidChangeVisibility (an already-visible pinned tab). Report
    // focus so the host can re-arm the default picker while idle.
    window.addEventListener("focus", () => {
      vscode.postMessage({ type: "focus" });
    });

    vscode.postMessage({ type: "ready" });
  </script>
</body>
</html>`;
}

function createNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length)),
  ).join("");
}
