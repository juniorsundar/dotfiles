import * as vscode from "vscode";

import { createRegistry } from "./picker/registry.js";
import { createFilePicker } from "./filePicker/index.js";
import { PickerHost, vscodeHostEnv } from "./host/host.js";

const viewId = "vsconsult-filePicker";
const commandId = "vsconsult.findFile";

export function activate(context: vscode.ExtensionContext): void {
  // ── Registry ────────────────────────────────────────────────────────
  const registry = createRegistry();

  // ── Picker-agnostic host (single shared webview view) ───────────────
  // Created before the file picker so the picker's excludes provider can
  // read the host's live configuration.
  const host = new PickerHost(context.extensionUri, registry, vscodeHostEnv, viewId);

  // ── Register built-in pickers ───────────────────────────────────────
  const vscodeFolders = vscode.workspace.workspaceFolders ?? [];
  createFilePicker(
    {
      folders: vscodeFolders.map((f) => ({ uriPath: f.uri.fsPath })),
      findFiles: async (include, exclude) => {
        const uris = await vscode.workspace.findFiles(include, exclude);
        return uris.map((u) => u.fsPath);
      },
      readFile: async (absPath) => {
        const { readFile } = await import("node:fs/promises");
        return readFile(absPath, "utf8");
      },
      excludesProvider: () => host.fileExcludes,
    },
    registry,
  );

  context.subscriptions.push(
    host,
    vscode.window.registerWebviewViewProvider(viewId, host, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(commandId, () => host.start("file")),
  );
}

export function deactivate(): void {
  // Nothing to tear down — disposables handle it.
}
