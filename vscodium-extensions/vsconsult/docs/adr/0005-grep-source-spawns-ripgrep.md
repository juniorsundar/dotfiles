# Grep sources spawn ripgrep via @vscode/ripgrep

The live-grep picker's `searchWorkspace` primitive spawns the `rg` binary bundled through `@vscode/ripgrep` and streams `rg --json` matches, rather than going through a VS Code search API. VS Code exposes no public streaming *match* API — `vscode.workspace.findFiles` finds files, not match content — so spawning `rg` is the only way to get true streaming line-level results. `@vscode/ripgrep` is the same package VS Code itself bundles to locate a prebuilt `rg`, so the binary path is stable across platforms and the engine matches built-in search.

This supersedes the last bullet of ADR-0003, which guessed that live-grep "may reuse VS Code's search APIs (`vscode.workspace` search)." It cannot: the API doesn't stream matches.

## Considered Options

- **Spawn `@vscode/ripgrep` `rg --json` (chosen).** True streaming, line/column/content directly from `rg`, same engine as VS Code search. Commits us to the `rg --json` output contract.

- **Hunt `rg` on PATH or in the VS Code installation layout.** No new dependency, but fragile across VS Code versions and platforms, and reinvents what `@vscode/ripgrep` already solves.

- **`vscode.workspace.findFiles` + in-JS search.** Rejected: no streaming, reinvents ripgrep in JS, slow on large workspaces, and the API cannot yield match content.

## Consequences

- `searchWorkspace` is source-injected at activation (mirroring the file picker's `findFiles`/`readFile` injection), not added to `PickerContext`. Sourcing is a source concern; `PickerContext` stays scoped to accept/preview.
- The spawn wrapper does **not** debounce re-runs; the host's query-driven contract is "abort the in-flight source and re-run immediately on every keystroke," and preemption is owned by the host (it aborts the previous run's `AbortSignal`, killing its child process, before calling the source for the new query). An earlier version debounced inside the wrapper, but that left the list on stale results for the debounce window on each keystroke; the host's abort already coalesces by killing superseded runs, so a separate debounce only added latency. The host additionally throttles cumulative `results` posts to the webview (leading+trailing, ~16ms) so a broad query matching thousands of lines does not flood the webview IPC with a full-candidate-list message per streamed batch.
- Committing to `rg --json` is hard to reverse: the grep source parses that contract. Changing backends later means rewriting the parser, not just swapping a primitive.

## Status

**Fulfilled** — ticket 12 shipped `createSearchWorkspace` in `src/grepSourcing.ts`. The wrapper resolves `rg` via the injected `RipgrepSpawner` (backed by `@vscode/ripgrep`'s `rgPath` in production), spawns `rg --json`, parses match objects into `GrepCandidate` batches streamed through `SourceSession.updates`, debounces re-spawns (150 ms default), propagates abort to the child process, returns an empty snapshot for an empty query, and throws a descriptive error when the binary is unavailable — no in-JS fallback. Verified via fake-child-process tests in `src/grepSourcing.test.ts`.