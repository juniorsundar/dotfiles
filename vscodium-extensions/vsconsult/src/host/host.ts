import * as vscode from "vscode";

import type { Registry } from "../picker/registry.js";
import type { Picker } from "../picker/registry.js";
import type { Candidate } from "../picker/types.js";
import type { PickerContext } from "../picker/context.js";
import type { InboundMessage, OutboundMessage, PickerConfig, RowMessage } from "./protocol.js";
import { buildPickerConfig, shapeCandidateRows } from "./protocol.js";
import { createPreviewDebounce } from "./debounce.js";
import type { HostEnv, Origin } from "./lifecycle.js";
import { runCancel, runExit } from "./lifecycle.js";

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
}

// ---------------------------------------------------------------------------
// PickerHost — picker-agnostic webview view provider
// ---------------------------------------------------------------------------

const previewDelayMs = 125;

export class PickerHost implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private session: HostSession | undefined;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly debounce: ReturnType<typeof createPreviewDebounce>;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly registry: Registry,
    private readonly env: HostEnv,
    private readonly viewId: string,
  ) {
    // Preview debounce — when the timer fires, look up the candidate in
    // the active session and call the active picker's preview action.
    this.debounce = createPreviewDebounce(async (id: string) => {
      const session = this.session;
      if (!session) return;
      const candidate = session.candidates.find((c) => c.id === id);
      if (!candidate) return;
      await session.picker.preview(candidate, this.buildPickerContext());
    }, previewDelayMs);
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
      }),
    );
  }

  // -----------------------------------------------------------------------
  // Picker invocation
  // -----------------------------------------------------------------------

  async start(pickerId: string): Promise<void> {
    const picker = this.registry.get(pickerId);
    if (!picker) {
      throw new Error(`Picker "${pickerId}" is not registered`);
    }

    this.debounce.cancel();

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
    const panelWasVisible = this.view?.visible ?? false;

    // Focus the shared view so the input field receives keyboard focus
    await vscode.commands.executeCommand(`${this.viewId}.focus`);

    // Initialise session
    const sourceController = new AbortController();
    this.session = { picker, origin, panelWasVisible, candidates: [], query: "", sourceController };

    // Send the picker's configuration once — the view holds this until
    // the next start() call.
    this.post({ type: "configure", config: buildPickerConfig(picker) });
    this.post({ type: "reset" });
    this.post({ type: "status", message: "Loading…" });

    // Run the source (snapshot — fires once; streaming will come later)
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
        this.debounce.schedule(message.id);
        break;

      case "accept":
        await this.handleAccept(message.id);
        break;

      case "cancel":
        await this.handleCancel();
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
      await session.picker.accept(candidate, this.buildPickerContext());
    } catch (error) {
      this.post({
        type: "status",
        message: `Could not accept: ${error instanceof Error ? error.message : String(error)}`,
        error: true,
      });
      return;
    }

    await this.exit();
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

    // Abort any in-flight source run so the streaming loop stops.
    session.sourceController.abort();

    this.session = undefined;
    this.post({ type: "idle" });
    await runExit(this.env, session.panelWasVisible);
  }

  // -----------------------------------------------------------------------
  // Results
  // -----------------------------------------------------------------------

  private sendResults(): void {
    const session = this.session;
    if (!session) return;

    const { picker, candidates, query } = session;
    const narrowed = picker.narrow(query, candidates);
    const rows = shapeCandidateRows(picker, narrowed);

    this.post({
      type: "results",
      rows,
      status: `${narrowed.length.toLocaleString()} candidate${narrowed.length === 1 ? "" : "s"}`,
    });
  }

  // -----------------------------------------------------------------------
  // PickerContext factory
  // -----------------------------------------------------------------------

  private buildPickerContext(): PickerContext {
    const session = this.session;
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
