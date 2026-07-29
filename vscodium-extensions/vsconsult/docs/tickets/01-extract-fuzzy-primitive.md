# 01 — Extract the fuzzy primitive from the matcher

**What to build:** The pure subsequence-scoring core of the existing matcher becomes a general fuzzy primitive — a `FuzzyScorer` that scores arbitrary text against a query with no path or field bias, plus a `rank` helper built on it. The current path-biased `scorePath`/`rankCandidates` continues to work as a thin wrapper on top of the primitive, so the file picker narrows identically to today. This is a prefactor: it makes the file picker's Narrowing a drop-in when the Picker abstraction lands, by separating the reusable fuzzy algorithm (layer 1) from the file-picker-specific path bias (layer 3).

**Blocked by:** None — can start immediately.

**Status:** complete

- [x] A general fuzzy primitive exists that scores arbitrary text against a query and exposes a `rank(query, items, textOf)` helper, with no path, filename, or field bias.
- [x] The existing path-biased scoring (boundary characters, filename-end weighting, length penalty) is expressed as a thin wrapper over the primitive, not as a standalone scorer.
- [x] The file picker's narrowing behavior is unchanged (existing matcher tests still pass against the wrapper).
- [x] New tests cover the general primitive over non-path text, distinct from the path-biased wrapper tests.
- [x] No vscode coupling is introduced; the primitive and wrapper remain pure functions (prior art: existing `matcher.test.ts` style).