import * as vscode from "vscode";
import { spawn as nodeSpawn } from "node:child_process";
import { join } from "node:path";

import { createRegistry } from "./picker/registry.js";
import { createFilePicker } from "./filePicker/index.js";
import { createGrepPicker } from "./grepPicker/index.js";
import { createPickPicker } from "./pickPicker/index.js";
import { createSearchWorkspace, type RipgrepSpawner, type ChildProcessLike } from "./grepSourcing.js";
import { PickerHost, vscodeHostEnv } from "./host/host.js";

const viewId = "vsconsult-filePicker";
const findFileCommandId = "vsconsult.findFile";
const liveGrepCommandId = "vsconsult.liveGrep";
const pickPickerCommandId = "vsconsult.pickPicker";

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

  // ── Register grep picker ───────────────────────────────────────────
  const workspaceRoot = (vscodeFolders[0]?.uri.fsPath) ?? process.cwd();
  const spawner: RipgrepSpawner = {
    rgPath: join(__dirname, "bin", "rg"),
    spawn: (path, args, opts) => nodeSpawn(path, args, opts) as ChildProcessLike,
  };
  const searchWorkspace = createSearchWorkspace(
    spawner,
    workspaceRoot,
    host.fileExcludes,
  );
  createGrepPicker(searchWorkspace, registry);

  // ── Register picker chooser ────────────────────────────────────────
  // Registered last: the chooser lists the other pickers via the
  // registry, so it must be assembled after they are registered.
  createPickPicker(registry);

  context.subscriptions.push(
    host,
    vscode.window.registerWebviewViewProvider(viewId, host, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand(findFileCommandId, () => host.start("file")),
    vscode.commands.registerCommand(liveGrepCommandId, () => host.start("grep")),
    vscode.commands.registerCommand(pickPickerCommandId, () => host.start("pick")),
  );
}

export function deactivate(): void {
  // Nothing to tear down — disposables handle it.
}
