# VS Code preview without Quick Open history

## Status and scope

This note preserves partial evidence from two research runs that both timed out. It is not a completed compatibility study, and no VS Code/VSCodium integration reproduction was captured. In particular, this note does **not** establish that this extension's use of `showTextDocument` causes the observed `Ctrl+P` history behavior.

The sources separate into four evidence levels below: documented public API, internal implementation, inference, and explicit unknowns.

## Short answer

Current upstream source strongly suggests that VS Code's own history-free previews rely on an **internal transient-editor state**, not merely the public `preview: true` option. The public extension API documents preview-tab and focus controls but no option to request a transient editor or suppress recently-opened history. An extension therefore cannot currently rely on a documented, per-open “show this editor without history” capability.

## Documented public extension API

`window.showTextDocument` accepts `TextDocumentShowOptions`. The documented options include `viewColumn`, `preserveFocus`, `selection`, and `preview`; `preview` controls whether the document is shown as a preview editor. Neither the current API reference nor the declaration captured for VS Code 1.85.1 exposes a `transient`, `skipHistory`, or equivalent option:

- [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api#showTextDocument)
- [Current `vscode.d.ts`](https://raw.githubusercontent.com/microsoft/vscode/main/src/vscode-dts/vscode.d.ts)
- [VS Code 1.85.1 `vscode.d.ts`](https://raw.githubusercontent.com/microsoft/vscode/1.85.1/src/vscode-dts/vscode.d.ts)

Issue #126748 is useful supporting context from the upstream tracker: it distinguishes the `preview` option's tab/pinning semantics and records that its documentation was considered confusing. It is not evidence that `preview` suppresses history:

- [microsoft/vscode#126748](https://github.com/microsoft/vscode/issues/126748)

`workspace.openTextDocument` and `window.showTextDocument` are distinct operations in the public API. An extension can load a document without displaying it, but once it needs a native text editor surface it must use a display operation whose documented options do not include history suppression.

## Internal implementation evidence

Upstream's internal `IHistoryService` owns recently-opened editor history and declares operations including `addToRecentlyOpened`, `removeRecentlyOpened`, and `getRecentlyOpened`:

- [`IHistoryService` source](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/services/history/common/history.ts)

The current internal history implementation listens to editor activation and checks whether the active editor is transient before adding it to recently opened. It also contains a private `removeFromRecentlyOpened(...)` path that ultimately asks the workspaces service to remove the resource:

- [`HistoryService` implementation](https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/services/history/browser/historyService.ts)

Upstream issue #211769 supplies the clearest behavioral evidence. Its reproduction starts by clearing editor history, previews a file through Quick Open, and observes that the transient editor is not in recently opened. The issue/fix concerns adding the editor once it ceases to be transient:

- [microsoft/vscode#211769 (GitHub API record)](https://api.github.com/repos/microsoft/vscode/issues/211769)

### Inference

The best-supported interpretation is:

1. VS Code can mark editors as **transient** internally.
2. Internal history code excludes such editors while they remain transient.
3. Quick Open uses that state for at least some temporary previews.
4. This transient state—not the public preview-tab flag by itself—appears to be the mechanism that avoids recently-opened history.

This is an inference from upstream source and issue behavior, not a public API contract. “Preview editor” and “transient editor” must not be treated as synonyms.

## Can an extension request a transient editor?

**Documented answer: no exposed option was found.** The public `TextDocumentShowOptions` declarations above do not expose transient state, while transient checks occur in internal workbench services. The artifacts did not find a stable or proposed extension API for setting that state.

Calling undocumented internal services or commands would couple the extension to workbench internals and is not recommended, especially for a VS Code `^1.85` extension and VSCodium.

## Removing history after opening

The evidence shows three different capabilities that should not be conflated:

- **Internal per-resource removal:** `HistoryService.removeFromRecentlyOpened(...)` exists, but it is private workbench implementation, not extension API.
- **User-facing bulk clearing:** upstream's issue reproduction refers to the **Clear Editor History** command. By definition, bulk clearing is not scoped to one preview and is therefore unsuitable as automatic per-preview cleanup. See [microsoft/vscode#211769 (GitHub API record)](https://api.github.com/repos/microsoft/vscode/issues/211769).
- **Public per-entry removal:** no documented extension API was found. The upstream request to remove individual Quick Open entries is tracked in [microsoft/vscode#87963](https://github.com/microsoft/vscode/issues/87963); that issue is context, not proof of a current extension API.

Even if an undocumented command could trigger bulk clearing, invoking it would not provide safe, scoped cleanup. Cleanup after every preview could also remove a legitimate prior entry for the same resource; the artifacts do not establish enough history semantics to make such cleanup correct.

## Practical alternatives

1. **Keep preview content outside a native editor.** Render a read-only excerpt in the extension's webview/view. This avoids opening a text editor at all, so it is the most reliable design if preserving editor history is mandatory. Trade-offs include reimplementing presentation, selection, scrolling, syntax highlighting, accessibility, and editor commands.
2. **Load but do not show the document.** `workspace.openTextDocument` can support metadata/excerpt generation without displaying an editor. It does not satisfy a requirement for a native editor preview. See the [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api).
3. **Use a virtual read-only document or custom editor only after testing.** The API supports `TextDocumentContentProvider`, custom editors, and webviews, but the artifacts do not establish that showing a virtual document/custom editor is excluded from Ctrl+P history. These are alternative surfaces, not proven history workarounds. See the [VS Code API reference](https://code.visualstudio.com/api/references/vscode-api).
4. **Accept history entries and document the behavior.** This is the least complex option if native editor fidelity matters more than pristine Quick Open history.

## VS Code 1.85 and VSCodium caveats

- The extension's `^1.85` compatibility floor matters: current `main` source is evidence about upstream's present implementation, not proof of behavior in 1.85.x.
- The captured 1.85.1 public declaration still provides no history-suppression/transient option, but the research did not capture the corresponding 1.85 internal history implementation.
- Issue #211769 postdates the 1.85 line, so the lifecycle behavior it records must not be projected backward without testing. See the [issue record](https://api.github.com/repos/microsoft/vscode/issues/211769).
- No VSCodium source or version mapping was captured. Consequently, this research cannot establish that the target VSCodium build matches either VS Code 1.85 or current upstream internals.

## Explicit unknowns

- Whether this extension's exact `showTextDocument({ preview: true, preserveFocus: ... })` sequence adds every cycled file to the empty-query `Ctrl+P` list on the target VSCodium build.
- Whether `preview: false`, `preserveFocus`, view column, an already-open editor, or repeatedly replacing one preview tab changes history insertion.
- Whether the target VSCodium build implements transient-editor history exactly like the upstream source cited here.
- Whether `Ctrl+P` combines recently-opened history with other ranking inputs in a way that explains the complete observed ordering.
- Whether virtual documents, custom editors, diff editors, or peek-style surfaces avoid the relevant history on VS Code/VSCodium 1.85.
- Whether any proposed API existed briefly but was absent from the stable declarations captured by the timed-out runs.

## Recommended experiment

Run a minimal integration reproduction against the **actual VSCodium version in use**, then repeat against the newest supported VS Code:

1. Use a disposable workspace with several uniquely named files and run **Clear Editor History**.
2. Record the empty-query `Ctrl+P` list.
3. From a minimal extension command, show files A, B, and C sequentially using the same `showTextDocument` options as this extension.
4. Record the resulting tabs and empty-query `Ctrl+P` list after each selection and after cancel/accept.
5. Repeat with one variable changed at a time: `preview` true/false, `preserveFocus` true/false, same/different view column, and an already-open file.
6. As a control, preview A/B/C through native Quick Open without accepting them and compare the resulting history.
7. If feasible, inspect the target build's tagged `historyService.ts` to confirm whether its history insertion is gated by transient state.

This experiment is the next required evidence before attributing the observed Ctrl+P pollution specifically to `showTextDocument` or choosing an implementation workaround.

## Evidence limitations

Both research agents timed out before producing complete briefs. Some fetched pages were truncated, searches were noisy, and no target-version runtime test was performed. The strongest evidence is the public declaration/API reference, current upstream history source, and upstream issue #211769. All recommendations above remain conditional on the proposed integration reproduction.
