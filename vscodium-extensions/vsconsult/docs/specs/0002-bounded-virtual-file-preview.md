# Bounded virtual file preview

## Problem Statement

When a user cycles through file-picker candidates, vsconsult currently previews each candidate by opening its real file resource in a native preview editor. Those preview-only files can subsequently appear in VS Code/VSCodium's built-in Ctrl+P file switcher even though the user never accepted them and no persistent tab remains. Candidate exploration therefore changes editor history and makes Ctrl+P less representative of files the user intentionally opened.

VS Code's supported public Extension API does not expose the transient-editor state used by built-in history-neutral previews, nor does it offer selective removal of only the history entries created during one picker session. Clearing all recent files would destroy unrelated user history and is unacceptable.

The file picker must retain a readable preview in the native editor area without opening every candidate under its real URI. It must also bound memory, I/O, decoding, and language-processing costs when candidates are very large, binary, unreadable, or selected faster than preview reads complete.

## Solution

Display file-picker previews through one session-owned, read-only virtual preview document with a stable extension URI. Cycling candidates updates this single native text editor with a bounded content preview rather than showing each candidate's real `file:` URI. The actual file is opened under its real URI only when the user accepts it.

Files up to and including 1 MiB receive a full textual preview. Larger text files receive at most the first 512 KiB and a visible truncation notice. Binary-looking or unreadable candidates receive an informative metadata or error representation instead of unsafe or corrupted content. Preview updates suppress stale asynchronous results so that a slower earlier read cannot overwrite the latest selection.

The virtual preview is temporary picker-session state. It is always closed on accept or cancel, without closing or modifying unrelated editors. Cancellation restores the origin editor and selection. Acceptance closes the virtual preview and opens the accepted real file. Existing dirty editors remain open and untouched.

The design uses only supported public VS Code APIs. A single synthetic vsconsult resource may appear in Ctrl+P; this is acceptable provided cycling does not add the real paths of preview-only candidates.

## User Stories

1. As a file-picker user, I want to preview candidates in the native editor area, so that I can identify files without leaving the keyboard-first picker workflow.
2. As a file-picker user, I want files that I only preview to stay out of Ctrl+P, so that editor history reflects files I intentionally opened.
3. As a file-picker user, I want the file I accept to open normally under its real path, so that it has full editor and language functionality.
4. As a file-picker user, I accept at most one synthetic vsconsult preview entry in Ctrl+P, so that the extension can contain history pollution without relying on unsupported APIs.
5. As a file-picker user, I want repeated candidate changes to reuse one preview resource, so that cycling through many files cannot produce many synthetic history entries.
6. As a file-picker user, I want ordinary text files to display completely when they are no larger than 1 MiB, so that typical source files remain fully readable.
7. As a file-picker user, I want large text files to show a useful beginning excerpt, so that I can identify them without loading the complete file.
8. As a file-picker user, I want a clear truncation notice for large previews, so that I do not mistake an excerpt for the complete file.
9. As a file-picker user, I want preview work to remain bounded for very large files, so that cycling candidates does not freeze or exhaust the extension host.
10. As a file-picker user, I want binary-looking files to show an explanatory representation rather than corrupted text, so that preview behavior is understandable.
11. As a file-picker user, I want unreadable files to produce a non-fatal preview error, so that one failed candidate does not end the picker session.
12. As a file-picker user, I want rapid navigation to display only the latest selected candidate, so that a slow earlier read cannot replace the current preview.
13. As a file-picker user, I want preview activity to remain debounced, so that rapid key repeats do not start unnecessary I/O.
14. As a file-picker user, I want the virtual preview to be read-only, so that editing it cannot imply that the real candidate will be changed.
15. As a file-picker user, I want cancel to close the temporary preview and restore my original editor and selection, so that exploration is reversible.
16. As a file-picker user, I want accept to close the temporary preview before opening the selected real file, so that no session-owned editor remains afterward.
17. As a user with unsaved changes, I want my dirty origin editor to remain open and unmodified, so that previewing cannot discard or overwrite work.
18. As a user with other editor groups or preview editors, I want vsconsult to close only its own virtual preview, so that unrelated editor state is preserved.
19. As a user, I want picker exit to tear down preview state after either accept or cancel, so that a stale virtual preview cannot outlive its session.
20. As a VSCodium user, I want the implementation to rely on supported public APIs, so that it is not tied to unstable VS Code internals.
21. As a maintainer, I want content limits expressed in bytes and enforced before complete-file allocation, so that tests can prove preview resource bounds.
22. As a maintainer, I want UTF-8 excerpts decoded safely at the byte boundary, so that a truncated multibyte character does not corrupt the preview.
23. As a maintainer, I want binary detection to be explicitly best-effort, so that uncertain content has a safe fallback rather than an unsupported promise.
24. As a maintainer, I want host-level behavioral tests to cover content policy and lifecycle, so that implementation details can evolve behind a stable contract.
25. As a maintainer, I want a real-workbench regression test for Ctrl+P behavior, so that mocked API-call tests do not create false confidence about editor history.
26. As a maintainer, I want the workbench test to record whether the synthetic resource appears, so that VSCodium compatibility is an observed fact rather than an assumption.

## Implementation Decisions

- Implement ADR 0004: one extension-owned virtual preview document with a stable URI represents every selected file candidate. Candidate filenames must not be encoded as distinct virtual resource URIs because changing resource identity could recreate one history entry per candidate.
- Preview remains in the native editor area. It will not be rendered in the shared view or another picker-owned webview.
- Use supported public VS Code APIs only. Do not call internal transient-editor services or undocumented commands.
- Do not invoke the coarse clear-recent-files command. The extension must never erase unrelated user history as cleanup for its own previews.
- Introduce a host-owned virtual preview capability rather than having the file picker's Preview open the candidate's real URI. The host owns virtual-document registration, stable identity, publication, display, and teardown because these are editor lifecycle concerns shared around picker actions.
- Keep the Picker and Picker context boundaries picker-agnostic. The file picker's Preview requests a bounded content preview for its candidate; Accept continues to request a normal real-document open.
- Preview content is a best-effort identification view, not a full document open. File-aware behavior dependent on the real URI—including diagnostics, import resolution, Git decorations, CodeLens, breadcrumbs, semantic analysis, Reveal in Explorer, and extensions restricted to the `file:` scheme—is not guaranteed.
- For candidates no larger than 1 MiB, read and display the complete file.
- For candidates larger than 1 MiB, read no more than the first 512 KiB and append a visible truncation notice containing enough information to communicate that the preview is incomplete.
- Size must be inspected before selecting the read strategy. Large files must be read through a bounded range operation; loading a complete file and slicing the result does not satisfy the resource contract.
- Decode bounded text safely when the byte sample ends within a multibyte UTF-8 sequence.
- Inspect the bounded sample for binary-looking content. A binary-looking candidate displays metadata and an unavailable-as-text explanation. Detection is heuristic and must fail safely.
- Read, stat, decoding, and publication failures are non-fatal. The virtual document displays or retains an understandable preview error while the picker remains usable.
- Preserve the existing preview debounce. Add generation-based or equivalent stale-result suppression because debouncing alone cannot prevent an already-started slow read from publishing after a newer selection.
- The current selection is authoritative. Only a preview result associated with the latest selection and active picker session may update the virtual document.
- The virtual preview is read-only. The design must not offer write-through behavior or imply that synthetic-buffer edits affect the candidate.
- Use an appropriate language mode for normal full previews where publicly supported and reliable. Truncated, binary, unknown, or unusually expensive content may use plain text. Language mode must not require changing the stable virtual URI.
- Display the selected candidate's filename and path without assigning a unique URI per candidate. The implementation may use supported editor metadata and/or a header inside the virtual content.
- Open the virtual preview in the origin editor's group where possible, with focus preserved in the picker. Opening it must not close or destructively replace a dirty origin editor.
- Treat the virtual preview as session-owned. On cancel, close only that resource and restore the captured origin editor and selection. On accept, close only that resource and open the accepted real file normally.
- Picker exit is responsible for cleanup regardless of whether exit follows accept, cancel, replacement, disposal, or an error path. Teardown must be idempotent.
- Do not close editor groups, close unrelated preview editors, save documents, or discard dirty changes while managing the virtual preview.
- Reuse one stable virtual resource across sessions unless real-workbench validation shows that a session-scoped identity is required for correct teardown. Any alternative must retain the invariant that candidate cycling does not create one resource per candidate.
- Verify behavior against the actual supported VSCodium environment. Current mocked tests cannot establish editor-history behavior.

## Testing Decisions

- Use two complementary test seams: host-level behavioral tests for deterministic policy and lifecycle coverage, plus one real Extension Host/workbench seam for the exact Ctrl+P history outcome.
- Host-level tests are the primary fast seam. Drive the PickerHost through inbound picker messages, fake file capabilities, captured outbound/editor effects, and existing preview debouncing rather than testing private virtual-document helpers directly.
- Extend existing fake HostEnv/PickerContext and mocked VS Code patterns rather than exposing private host state solely for tests. Assert observable document content, editor operations, origin restoration, accepted real-file opening, and picker continuity.
- Test that multiple candidate selections publish through the same stable virtual resource and never request a preview open for any candidate's real URI.
- Test a file below 1 MiB and exactly 1 MiB as complete previews.
- Test a file above 1 MiB as a 512 KiB maximum read with a truncation notice. Assert the underlying fake reader was never asked for the complete file.
- Test very large declared sizes to prove memory/I/O bounds are independent of total file size.
- Test a UTF-8 multibyte character crossing the 512 KiB boundary and assert valid decoded output without replacement caused solely by unsafe truncation.
- Test binary-looking content and assert an explanatory metadata preview rather than raw binary decoding.
- Test stat, bounded-read, and decode failures as non-fatal preview states; the picker must continue to navigate and accept/cancel.
- Use controlled deferred promises to test out-of-order completion: an older candidate's read completes after the latest candidate and must not update the virtual document.
- Test that debounce reduces unnecessary preview starts while stale-result suppression still protects already-started work.
- Test read-only behavior through the public document/provider contract available at the host seam; do not assert private flags without observing editor behavior.
- Test cancel: the virtual preview is closed, no real candidate is opened, origin editor and selection are restored, dirty origin state is untouched, and no session-owned preview remains.
- Test accept: the virtual preview is closed, exactly the accepted candidate's real URI is opened, and preview-only candidate URIs are never opened as real editors.
- Test idempotent cleanup and replacement/error paths so teardown targets only the extension-owned virtual resource and never unrelated editors or groups.
- Use prior art from the existing PickerHost tests, fake HostEnv, fake webview message seam, debounce tests, and file-picker Accept/Preview PickerContext spies.
- Add a real-workbench test or minimal Extension Host harness that starts with controlled editor history, invokes the file picker, cycles through known candidate files, exits, and observes Ctrl+P. It must assert that preview-only real paths are absent and that the accepted real path is present after acceptance.
- The real-workbench test must separately record whether the one stable synthetic preview resource appears in Ctrl+P. Its presence is permitted; multiple synthetic entries or candidate-specific real entries are failures.
- Run the workbench scenario against the target VSCodium build. Where practical, also run against the newest VS Code version allowed by the extension engine range to detect implementation differences.
- Tests should assert externally meaningful behavior and independent limits. They must not duplicate the implementation's binary heuristic or calculate expected excerpts by calling production helpers.

## Out of Scope

- Accessing or emulating VS Code's private transient-editor service.
- Removing individual entries from internal editor history through unsupported APIs.
- Clearing all recent files or restoring the user's entire previous history snapshot.
- Rendering preview content inside the shared picker webview or a second custom preview pane.
- Full fidelity with an editor opened on the candidate's real URI, including all language-server, SCM, breadcrumb, CodeLens, semantic, custom-editor, and file-scheme extension behavior.
- Editing the virtual preview or writing changes through to the real candidate file.
- Full binary, image, notebook, archive, or custom-editor previews.
- Loading complete large files for preview.
- User-configurable size limits in the first implementation. The initial policy is fixed at 1 MiB for complete previews and 512 KiB for larger-file excerpts.
- Guaranteeing that no synthetic vsconsult entry appears in Ctrl+P. The accepted contract permits one stable synthetic entry.
- Changing candidate sourcing, narrowing, rendering, stream-source behavior, or acceptance semantics unrelated to preview identity and lifecycle.

## Further Notes

- ADR 0004 is the controlling architectural decision. The supporting research note documents the public-API limitation and the upstream internal transient-editor behavior, but both research runs were partial and timed out.
- The exact reported symptom cannot be locked down by mocked Vitest alone. The real-workbench seam is part of the feature, not optional validation, because Ctrl+P history is internal workbench state.
- The key success criterion is history containment: preview-only real candidate paths do not enter Ctrl+P. One stable extension-owned preview resource is an accepted compromise.
- The terms Preview editor, Transient editor, Virtual preview document, and Bounded content preview should be added to and used consistently in the project glossary when implementation begins.
- Resource limits are byte limits: 1 MiB is 1,048,576 bytes and 512 KiB is 524,288 bytes.
