# 07 — Prove Ctrl+P history containment

**What to build:** Add an agent-runnable real-workbench regression scenario that exercises the virtual preview in the target VSCodium environment and proves the user-visible reason for the architecture: cycling candidates does not add their real paths to Ctrl+P history. The scenario also records the permitted synthetic preview entry and verifies that accepting a candidate adds the accepted real file normally.

**Blocked by:** 06 — Display small files through one virtual preview.

**Status:** ready-for-agent

- [ ] The scenario starts from controlled editor history, invokes the file picker, and cycles through known candidate files in a real Extension Host/workbench.
- [ ] After preview-only cycling and exit, none of the cycled real paths appears in Ctrl+P results.
- [ ] At most one stable synthetic vsconsult preview entry appears after cycling.
- [ ] After acceptance, the accepted real path appears in Ctrl+P while other preview-only paths remain absent.
- [ ] The scenario is deterministic, agent-runnable, and documents the target VSCodium version and invocation command.
- [ ] If the environment cannot expose Ctrl+P results to automation, the ticket records the missing seam and supplies the narrowest reproducible harness rather than substituting mocked API assertions.
