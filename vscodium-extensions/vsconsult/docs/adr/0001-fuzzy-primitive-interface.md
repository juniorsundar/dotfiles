# Fuzzy primitive as a swappable interface, JS shipped first

The shared fuzzy primitive (layer 1 of narrowing) is modeled as an interface — `score(query, text) → number | undefined` plus a `rank` helper — with a pure-JS implementation shipped today, so a native backend can slot in later without touching per-picker narrow functions. We do not adopt `fff` (@ff-labs/fff-node): it is a Rust file-search SDK with path/frecency/git bias baked in and no exposed raw-text scorer, so it cannot serve as a general fuzzy primitive, and its native FFI is unbundlable and webview-incompatible. If native speed is ever needed, the candidate is a minimal `score(query, text)` FFI, not a file-search engine.

## Considered Options

- **Swappable interface, JS now (chosen).** One interface around the existing subsequence scorer; per-picker narrow functions call it; native substitution is a future drop-in. Cost: one interface. Benefit: clean seam, no native dep today, perf escape hatch open.
- **Bare JS function, no interface.** Defer the seam until a perf wall appears. Rejected because wrapping one function in an interface now is nearly free, while retrofitting the seam across every caller later is not.
- **Adopt `fff` as native backend.** Rejected: `fff` exposes `fileSearch`/`directorySearch`/`grep`/`glob`, not a general text scorer; bias is in Rust and not strippable; ships platform-specific native binaries with no pure-JS fallback; not webview-compatible. Wrong shape for layer 1.

## Consequences

- The file picker's path-aware bias (boundary chars, filename-end weighting) lives in the file picker's `narrow` function, *not* in the primitive. The primitive scores general text.
- Narrowing runs in the extension host (Node), not the webview; a native backend would be a host-side FFI, which is fine because the host owns candidate data.
- JS is adequate at current scale. The former 2,000-candidate cap has been removed from the code (the source calls `findFiles` with no `maxResults`); the cap was a prototype-scope limit, not a permanent constraint. If candidate volumes grow into the range where JS scoring is a real bottleneck, the interface lets us swap in a native scorer without touching pickers.