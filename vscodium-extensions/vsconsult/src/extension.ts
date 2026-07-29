import * as vscode from "vscode";

import { rankCandidates } from "./matcher.js";
import { sourceWorkspaceFiles } from "./fileSourcing.js";

const viewId = "vsconsult-filePicker";
const commandId = "vsconsult.findFile";
const previewDelayMs = 125;

type WebviewMessage =
  | { type: "ready" }
  | { type: "query"; query: string }
  | { type: "select"; id: string }
  | { type: "accept"; id: string }
  | { type: "cancel" };

interface Origin {
  uri: vscode.Uri;
  selection: vscode.Selection;
  viewColumn: vscode.ViewColumn | undefined;
}

interface PickerSession {
  origin: Origin | undefined;
  candidates: import("./matcher.js").Candidate[];
  uris: Map<string, vscode.Uri>;
  query: string;
  panelWasVsconsultVisible: boolean;
  previewTimer: ReturnType<typeof setTimeout> | undefined;
}

class PickerViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  private view: vscode.WebviewView | undefined;
  private session: PickerSession | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    webviewView.webview.html = pickerHtml(webviewView.webview);

    this.disposables.push(
      webviewView.webview.onDidReceiveMessage((message: WebviewMessage) =>
        this.handleMessage(message),
      ),
      webviewView.onDidDispose(() => {
        this.view = undefined;
        this.clearPreviewTimer();
      }),
    );
  }

  async start(): Promise<void> {
    this.clearPreviewTimer();

    const editor = vscode.window.activeTextEditor;
    const origin: Origin | undefined = editor
      ? {
          uri: editor.document.uri,
          selection: editor.selection,
          viewColumn: editor.viewColumn,
        }
      : undefined;

    this.session = {
      origin,
      candidates: [],
      uris: new Map(),
      query: "",
      panelWasVsconsultVisible: this.view?.visible ?? false,
      previewTimer: undefined,
    };

    await vscode.commands.executeCommand(`${viewId}.focus`);
    this.post({ type: "reset" });
    this.post({ type: "status", message: "Loading workspace files…" });

    const vscodeFolders = vscode.workspace.workspaceFolders ?? [];
    const results = await sourceWorkspaceFiles({
      folders: vscodeFolders.map((f) => ({ uriPath: f.uri.fsPath })),
      findFiles: async (include, exclude) => {
        const uris = await vscode.workspace.findFiles(include, exclude);
        return uris.map((u) => u.fsPath);
      },
      readFile: async (absPath) => {
        const { readFile } = await import("node:fs/promises");
        return readFile(absPath, "utf8");
      },
    });

    if (!this.session) {
      return;
    }

    for (const { candidate, absPath } of results) {
      this.session.candidates.push(candidate);
      this.session.uris.set(candidate.id, vscode.Uri.file(absPath));
    }

    this.sendResults();
  }

  dispose(): void {
    this.clearPreviewTimer();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }

    switch (message.type) {
      case "ready":
        this.post({ type: "idle" });
        break;
      case "query":
        session.query = message.query;
        this.clearPreviewTimer();
        this.sendResults();
        break;
      case "select":
        this.schedulePreview(message.id);
        break;
      case "accept":
        await this.accept(message.id);
        break;
      case "cancel":
        await this.cancel();
        break;
    }
  }

  private sendResults(): void {
    const session = this.session;
    if (!session) {
      return;
    }

    const candidates = rankCandidates(session.query, session.candidates).map(
      ({ score: _score, ...candidate }) => candidate,
    );

    this.post({
      type: "results",
      candidates,
      status: `${candidates.length.toLocaleString()} candidate${candidates.length === 1 ? "" : "s"}`,
    });
  }

  private schedulePreview(id: string): void {
    this.clearPreviewTimer();
    const session = this.session;
    if (!session?.uris.has(id)) {
      return;
    }

    session.previewTimer = setTimeout(() => {
      void this.preview(id);
    }, previewDelayMs);
  }

  private async preview(id: string): Promise<void> {
    const session = this.session;
    const uri = session?.uris.get(id);
    if (!session || !uri) {
      return;
    }

    try {
      await vscode.window.showTextDocument(uri, {
        viewColumn: session.origin?.viewColumn ?? vscode.ViewColumn.Active,
        preserveFocus: true,
        preview: true,
      });
    } catch (error) {
      this.post({
        type: "status",
        message: `Could not preview file: ${error instanceof Error ? error.message : String(error)}`,
        error: true,
      });
    }
  }

  private async accept(id: string): Promise<void> {
    const session = this.session;
    const uri = session?.uris.get(id);
    if (!session || !uri) {
      return;
    }

    this.clearPreviewTimer();
    try {
      await vscode.window.showTextDocument(uri, {
        viewColumn: session.origin?.viewColumn ?? vscode.ViewColumn.Active,
        preserveFocus: false,
        preview: false,
      });
      await this.exit(session);
    } catch (error) {
      this.post({
        type: "status",
        message: `Could not open file: ${error instanceof Error ? error.message : String(error)}`,
        error: true,
      });
    }
  }

  private async cancel(): Promise<void> {
    const session = this.session;
    if (!session) {
      return;
    }

    this.clearPreviewTimer();
    if (session.origin) {
      const editor = await vscode.window.showTextDocument(session.origin.uri, {
        viewColumn: session.origin.viewColumn,
        preserveFocus: false,
        preview: false,
      });
      editor.selection = session.origin.selection;
      editor.revealRange(session.origin.selection, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    } else {
      await vscode.commands.executeCommand("workbench.action.focusActiveEditorGroup");
    }

    await this.exit(session);
  }

  private async exit(session: PickerSession): Promise<void> {
    this.session = undefined;
    this.post({ type: "idle" });

    // The public API does not expose the selected built-in Panel tab. We can
    // reliably restore a previously visible vsconsult view; otherwise this
    // best-effort close restores editor space after the transient picker.
    if (!session.panelWasVsconsultVisible) {
      await vscode.commands.executeCommand("workbench.action.closePanel");
    }
  }

  private clearPreviewTimer(): void {
    if (this.session?.previewTimer) {
      clearTimeout(this.session.previewTimer);
      this.session.previewTimer = undefined;
    }
  }

  private post(message: unknown): void {
    void this.view?.webview.postMessage(message);
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new PickerViewProvider(context.extensionUri);
  context.subscriptions.push(
    provider,
    vscode.window.registerWebviewViewProvider(viewId, provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(commandId, () => provider.start()),
  );
}

export function deactivate(): void {}

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
      width: 100%;
      height: 28px;
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
    .name, .directory { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .name { font-weight: 500; }
    .directory { color: var(--vscode-descriptionForeground); }
    .candidate.selected .directory { color: inherit; opacity: 0.8; }
    .empty { padding: 12px 10px; color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <main class="picker">
    <div class="query-wrap">
      <input id="query" type="text" aria-label="Narrow workspace files" autocomplete="off" spellcheck="false" placeholder="Narrow workspace files…">
    </div>
    <div id="status" aria-live="polite">Run “vsconsult: Find File” to begin.</div>
    <div id="results" role="listbox" aria-label="Workspace files"></div>
  </main>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const query = document.getElementById("query");
    const results = document.getElementById("results");
    const status = document.getElementById("status");
    let candidates = [];
    let selectedIndex = -1;

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
        empty.textContent = "No matching workspace files";
        results.append(empty);
        selectedIndex = -1;
        return;
      }

      for (const [index, candidate] of candidates.entries()) {
        const row = document.createElement("div");
        row.className = "candidate";
        row.setAttribute("role", "option");
        row.setAttribute("aria-selected", "false");
        row.title = candidate.relativePath;

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = candidate.name;
        const directory = document.createElement("span");
        directory.className = "directory";
        directory.textContent = candidate.directory;
        row.append(name, directory);

        row.addEventListener("mousedown", (event) => {
          event.preventDefault();
          select(index);
          query.focus();
        });
        row.addEventListener("dblclick", () => {
          vscode.postMessage({ type: "accept", id: candidate.id });
        });
        results.append(row);
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
      if (data.type === "reset") {
        candidates = [];
        selectedIndex = -1;
        query.value = "";
        results.replaceChildren();
        query.focus();
      } else if (data.type === "results") {
        candidates = data.candidates;
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
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    characters.charAt(Math.floor(Math.random() * characters.length)),
  ).join("");
}
