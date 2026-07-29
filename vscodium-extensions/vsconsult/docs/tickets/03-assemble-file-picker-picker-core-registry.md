# 03 — Assemble the file picker from parts; introduce Picker core types and registry

**What to build:** The Picker abstraction lands: the five-axis Picker interface, the Candidate contract (`id` + `label` plus a picker type's own typed fields), RowParts, PickerContext, the Source / SourceSession types (snapshot shape only — streaming is a later ticket), and a registry for registering pickers at activation. The file picker is then assembled from the prefactored parts: a file Source implementing the Source interface (built on the injectable file-sourcing module), a path-biased Narrowing on the fuzzy primitive, a Render projecting a FileCandidate to RowParts, and Accept + Preview actions that act through a PickerContext. The file picker is registered with the registry. This ticket is verified at the picker seam with a fake workspace and a fake PickerContext — it is not yet wired to a view, so it is test-verifiable, not user-demoable.

**Blocked by:** 01 — Extract the fuzzy primitive from the matcher; 02 — Extract file sourcing with an injectable workspace.

**Status:** ready-for-agent

- [ ] The Picker interface exists as a bundle naming five parts: Source, Candidate shape, Narrowing, Render, Accept.
- [ ] The Candidate contract is `id` + `label` (shared) plus per-type typed fields; a `FileCandidate` extends it with its file-specific fields.
- [ ] RowParts is defined as `{ primary, secondary?, icon?, tooltip? }` and is the sole output of a picker's Render.
- [ ] PickerContext is defined with host-backed helpers (open text document, reveal position, execute command, read origin) that Accept and Preview act through.
- [ ] Source / SourceSession types exist for the snapshot shape (an initial batch of candidates, no updates channel).
- [ ] A registry accepts picker registrations by id.
- [ ] The file picker is assembled from the prefactored parts (file Source, path-biased Narrowing on the fuzzy primitive, FileCandidate→RowParts Render, Accept and Preview via PickerContext) and registered.
- [ ] A test drives the file picker end-to-end at the picker seam: a fake workspace yields candidates, a query narrows them via the picker's Narrowing, the Render produces RowParts, and Accept against a fake PickerContext performs the open-document effect without performing lifecycle (lifecycle is delegated to the host, not the picker).
- [ ] No vscode coupling lives in the Picker core types or the file picker parts; vscode stays in the (future) host and the production PickerContext wiring.