# Ctrl+P history-containment workbench scenario

This is the real-workbench regression scenario for ticket 07. It verifies the user-visible **empty-query Ctrl+P / Quick Open result list**; it does not use mocked `vscode` APIs or inspect VS Code's internal history implementation.

## Target

The scenario was developed against the locally installed target:

- VSCodium `1.126.04524`
- commit `4c0b0c6cc561d2d3636d1ec250935431876ce4dc`
- Linux desktop session with Electron's Chrome DevTools Protocol available
- Node.js `21.2+` (the runner uses `import.meta.dirname` and the built-in `WebSocket`)

The extension continues to declare the compatible API floor in `package.json` (`^1.85.0`). Re-run this scenario on each VSCodium version that is to receive this history-containment guarantee.

## Invocation

Build the extension first, then run:

```sh
npm run build
npm run test:workbench:ctrl-p-history
```

Set `VSCODIUM_BIN` if the executable is not named `codium`:

```sh
VSCODIUM_BIN=/path/to/codium npm run test:workbench:ctrl-p-history
```

## Controlled setup and observations

The runner creates and removes a temporary workspace, `--user-data-dir`, and `--extensions-dir`, then starts VSCodium with the local extension through `--extensionDevelopmentPath`. Thus it cannot read or alter the developer's normal editor history.

Its fixture workspace contains only these known candidate files:

- `history-containment-alpha.txt`
- `history-containment-bravo.txt`

Through Electron CDP, it drives the actual workbench:

1. Invokes **vsconsult: Find File**, cycles both candidates in the WebView, exits, and reads the rendered empty-query Ctrl+P result labels.
2. Asserts neither preview-only real filename appears and that no more than one `vsconsult-preview` synthetic entry appears.
3. Starts a fresh picker session, narrows to and accepts `history-containment-alpha.txt`, opens Ctrl+P again, and asserts that alpha now appears while preview-only bravo remains absent.

The assertions operate on rendered `.quick-input-widget` text, the public user-visible seam chosen for this ticket. They do not substitute extension-host mock assertions.

## Environment limitation

The scenario requires a graphical VSCodium workbench capable of opening a local CDP port. In an environment where the port cannot be reached or the workbench cannot render (for example a headless CI executor without a supported graphical setup), it fails rather than claiming proof. The narrowest reproduction harness is the command above: run it in a graphical target VSCodium session and inspect the resulting Ctrl+P assertions. No mocked fallback is valid evidence for this ticket.
