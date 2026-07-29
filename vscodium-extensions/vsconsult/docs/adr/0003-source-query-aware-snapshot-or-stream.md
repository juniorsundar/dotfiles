# Sources are query-aware and return snapshot-or-stream

A picker's Source receives the query and returns a source session: an initial batch of candidates plus an optional updates channel for streamed batches. Snapshot sources (file picker) ignore the query, deliver all candidates at once, and never emit updates. Stream sources (live grep, LSP workspace-symbol) run the query as the search pattern and emit match batches as they arrive. Query-driven sources — where the query generates candidates rather than narrows a pre-existing set — use an identity (or light post-filter) Narrowing, because results arrive already matched.

## Considered Options

- **Query-aware source, snapshot-or-stream (chosen).** One interface covers snapshot file picking, streaming live-grep, and query-driven LSP symbol search. The host appends streamed batches and re-narrows (or, for query-driven pickers, just re-renders). Cost: the host must handle incremental candidate arrival and query changes that re-trigger sourcing.

- **One-shot sources only.** Source returns a collection; narrowing always ranks it. Rejected: live grep has no pre-existing collection to narrow — the query must reach `rg`, and results stream in. Forcing live-grep through "source all lines, then narrow" is impossible (you cannot return all lines) and would gut the consult interaction model, which is the project's reason to exist.

- **Defer live/streaming pickers to VS Code's built-in Search (Ctrl+Shift+F).** Rejected as a false dichotomy: built-in Search is a different UX (split view + results tree), not consult's transient narrowing list with preview-and-accept. Live-grep can reuse VS Code's ripgrep-backed search *engine* as its source backend while keeping consult's UI — the engine is reusable, the UX is not. Deferring would discard the interaction we are building.

## Consequences

- The five-axis Picker model still holds: every picker has Source, Candidate, Narrowing, Render, Accept. For query-driven pickers, Narrowing is identity — the part is present but trivial, not absent.
- The host owns re-sourcing on query change for query-driven pickers: cancel an in-flight source, start a new one with the new query, replace candidates. For pre-materialized pickers, the host narrows the existing collection on query change without re-sourcing.
- Candidates may arrive incrementally; the host must support append-then-renarrow (pre-materialized) and replace-then-render (query-driven).
- Live-grep and similar pickers may reuse VS Code's search APIs (`vscode.workspace` search) as the source backend; this is a source-implementation detail, not a host concern.