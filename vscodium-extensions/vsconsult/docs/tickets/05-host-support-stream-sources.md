# 05 — Host support for stream sources

**What to build:** The SourceSession updates channel is exercised by the host so that streaming and query-driven pickers fit the architecture. Streamed candidate batches are appended to the visible set with re-narrowing for pre-materialized pickers and re-rendering for query-driven pickers (whose Narrowing is identity). An in-flight source is cancelled when the query changes for a query-driven picker, so stale results do not overwrite fresh ones. This ticket is verified with a fake streaming source, since no real streaming picker ships in this spec; it proves the architecture genuinely supports live-grep and workspace-symbol-style pickers without building one.

**Blocked by:** 04 — Build the host and wire the file picker through the shared view.

**Status:** ready-for-agent

- [ ] The SourceSession type carries an optional updates channel for streamed candidate batches, in addition to the initial batch.
- [ ] The host appends streamed batches to the visible set and re-narrows for pre-materialized pickers, or re-renders for query-driven pickers (identity Narrowing).
- [ ] The host cancels an in-flight source when the query changes for a query-driven picker, so stale streamed results do not overwrite fresh ones.
- [ ] The host signals source completion (no further batches) and tears down the source session on picker exit.
- [ ] A test drives the host with a fake streaming source that emits batches over time, asserting incremental candidate arrival, re-narrow/re-render, and cancellation on query change — without a real streaming picker.