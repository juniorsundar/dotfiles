# 12 — Ripgrep spawn wrapper producing GrepCandidate streams

**What to build:** A `searchWorkspace(query, signal)` primitive that resolves the ripgrep binary via `@vscode/ripgrep` (the same package VS Code bundles), spawns `rg --json` with the query as the pattern and the workspace file-excludes as globs, parses the JSON match objects into `GrepCandidate` batches, and streams them through an async iterable as a query-driven stream source. It debounces re-spawns, propagates abort to the child process, surfaces a status message if the binary cannot be resolved, and returns an empty snapshot for an empty query (no spawn). This ticket also introduces the `GrepCandidate` shape (`id`, `label`, `relativePath`, `absolutePath`, `lineNumber` 1-based, `column` 1-based) since the wrapper is its first producer. Verifiable on its own via fake-child-process tests that feed canned `rg --json` lines and assert the streamed candidates, abort propagation, debounce, and empty-query no-spawn. Records/fulfils ADR-0005.

**Blocked by:** None — can start immediately.

**Status:** ready-for-agent

- [x] The `GrepCandidate` type extends the shared `Candidate` contract with `relativePath`, `absolutePath`, `lineNumber` (1-based), and `column` (1-based match start); `label` is the full matched line text, `id` is `${relativePath}:${lineNumber}:${column}`.
- [x] `searchWorkspace(query, signal)` resolves the `rg` binary path via `@vscode/ripgrep` and spawns `rg --json` with the query as the pattern, the workspace root as cwd, and the workspace file-excludes as globs.
- [x] `rg --json` match objects are parsed into `GrepCandidate` batches and streamed through an async iterable (the `SourceSession.updates` channel).
- [x] An empty query returns an empty candidate snapshot and never spawns ripgrep.
- [x] Abort propagation: when the host aborts the signal, the in-flight child process is killed and no further batches are emitted.
- [x] The wrapper debounces re-spawns itself so rapid query changes do not spawn a process per keystroke.
- [x] If `@vscode/ripgrep` cannot provide a binary, the source errors and surfaces a status message rather than crashing; no in-JS search fallback (ADR-0005).
- [x] Fake-child-process tests cover: streaming parsed candidates from canned `rg --json` lines, abort kills the child and stops batches, debounce coalesces rapid re-runs, empty query does not spawn.