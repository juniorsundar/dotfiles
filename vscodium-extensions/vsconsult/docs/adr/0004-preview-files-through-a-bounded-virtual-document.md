# Preview files through one bounded virtual document

File-picker previews will appear in the native editor area through one extension-owned virtual text document with a stable URI. Cycling candidates updates that document with a bounded, read-only representation of the selected file; it does not open each candidate's real `file:` URI. Accept closes the virtual preview and opens the accepted real file. Cancel closes the virtual preview and restores the origin editor. The virtual preview is session-owned and is always closed on picker exit.

This decision addresses an observed interaction between the current preview implementation and VS Code/VSCodium editor history: files opened only while cycling vsconsult candidates later appear in the built-in Ctrl+P file switcher, despite leaving no persistent tabs. VS Code's public `showTextDocument` options distinguish a preview editor from a pinned editor, but do not expose the internal transient-editor state used to exclude native previews from editor history. Public APIs also provide no selective operation for removing only the history entries introduced by a picker session. See [the supporting research note](../research/vscode-preview-without-quick-open-history.md).

The canonical distinction is:

- A **preview editor** is an unpinned native editor opened with the public `preview` option. It may still affect editor history.
- A **transient editor** is VS Code's internal history-neutral editor state. Extensions cannot request it through the supported public API.
- A **virtual preview document** is the single extension-owned document displayed in the native editor area while its contents represent different candidates.
- A **bounded content preview** is a best-effort textual representation for identifying a candidate; it is not a lossless clone or a full document open.

## Content and resource policy

- Use one stable virtual URI across candidate changes so real candidate URIs are never displayed during preview and candidate cycling cannot create one history item per file.
- A single synthetic vsconsult preview entry may still appear in Ctrl+P. This is acceptable; whether the target VSCodium build records custom-scheme documents must be verified in an Extension Host experiment.
- Files up to and including **1 MiB** receive a full text preview.
- Files larger than **1 MiB** receive at most the first **512 KiB**, followed by a clear truncation notice. The implementation must perform a bounded read rather than load the complete file and truncate afterward.
- Binary-looking content receives a metadata message instead of decoded file contents. Binary detection is best-effort and based on the bounded sample.
- Truncated or unusually large content may use plain-text mode to avoid expensive language processing.
- Preview reads are asynchronous. Each selection receives a generation or equivalent identity so a stale read can never replace a newer candidate's preview. Debouncing reduces reads but does not replace stale-result suppression.
- The virtual document is read-only. Preview edits never write through to the candidate file.

## Lifecycle policy

- The preview uses the native editor area, not a picker-owned webview pane.
- Opening the virtual preview must not close, replace destructively, save, or discard an existing dirty editor.
- On cancel, close the virtual preview and restore the origin editor and selection.
- On accept, close the virtual preview and open the accepted candidate under its real URI. The accepted file may legitimately enter editor history.
- Closing the virtual preview must target only the extension-owned resource; it must not close or alter the user's other preview editor or editor groups.

## Considered options

- **One bounded virtual document in the native editor area (chosen).** Preserves native text rendering, scrolling, selection, line numbers, theming, and basic syntax highlighting while preventing each previewed candidate's real URI from entering editor history. Resource use is bounded and the implementation stays within supported public APIs. Costs: the document has synthetic identity, file-aware language features may be incomplete, and one synthetic history entry may remain.

- **Open every candidate's real URI with `showTextDocument({ preview: true })`.** This is the current approach. Rejected because a preview tab and a history-neutral transient editor are different concepts; cycling real resources can pollute Ctrl+P history.

- **Use VS Code's internal transient-editor mechanism.** This most closely matches built-in Quick Open behavior. Rejected because it is not exposed through the supported Extension API and would be brittle across VS Code and VSCodium versions.

- **Remove previewed files from history on picker exit.** Rejected because supported APIs do not selectively remove editor-history entries. The coarse clear-recent-files command could destroy unrelated user history and will not be invoked.

- **Render file content beside the candidate list in the shared webview.** Rejected because previews are required to appear in the native editor area.

- **Disable content preview for large files only.** Retained as a fallback for binary or unreadable content, but rejected as the general policy: bounded prefix reads provide useful identification without unbounded allocation.

## Consequences

- Preview becomes a host capability with explicit virtual-document ownership, update, and teardown rather than a picker simply opening a candidate URI in preview mode.
- The file picker supplies or requests candidate content; acceptance remains a real-file open. Preview and Accept therefore intentionally operate on different resource identities.
- File-specific behavior tied to the real URI may be absent or inaccurate during preview, including language-server diagnostics, import resolution, Git decorations, breadcrumbs, CodeLens, semantic features, Reveal in Explorer, and extensions restricted to the `file:` scheme.
- A stable URI makes history containment possible but prevents the resource identity from naturally carrying each filename. The preview must display the candidate filename and path through supported editor metadata or content without changing the URI per candidate.
- The implementation needs tests for bounded reads, UTF-8 boundaries, binary detection, stale-result suppression, dirty-origin preservation, selective preview closure, accept/cancel lifecycle, and read failures.
- A real Extension Host experiment remains necessary because mocked unit tests cannot observe Ctrl+P history. It must confirm that cycling does not add real candidate paths and determine whether the single synthetic URI appears in the target VSCodium build.
