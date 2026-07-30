# 10 — Apply candidate language mode to the stable virtual preview

**What to build:** When the file picker previews a candidate through its one stable `vsconsult-preview:` virtual document, apply the candidate file's language mode to that already-open virtual document. The editor must receive normal syntax highlighting for recognisable source files even though the virtual URI intentionally has no candidate filename extension. Changing candidates may change the language mode, but must not create a new URI, preview-open the candidate's real file, or weaken Ctrl+P history containment.

**Blocked by:** 09 — Make preview updates race-safe and teardown-safe.

**Status:** ready-for-agent

- [x] A previewed recognisable source file uses the same language identifier VSCodium would select for its real candidate URI; for example, a `.ts` candidate receives TypeScript highlighting rather than Plain Text.
- [x] Moving from a candidate of one language to another updates the language mode of the existing stable virtual document without opening a new virtual URI or the candidate's real `file:` URI.
- [x] Files for which VSCodium has no language association retain a safe fallback language mode and do not break previewing.
- [x] Language-mode updates respect the latest selected candidate; a late update from an older selection cannot overwrite the current preview's language mode.
- [x] The virtual preview remains read-only, session-owned, and history-contained: Ctrl+P behavior proven by ticket 07 remains unchanged.
- [x] Host-level behavioral tests cover known-language application, language changes across candidates, unknown-language fallback, stable URI identity, and stale asynchronous selection protection.
