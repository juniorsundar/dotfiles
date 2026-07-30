# Grep sources spawn ripgrep via @vscode/ripgrep

The live-grep picker's `searchWorkspace` primitive spawns the `rg` binary bundled through `@vscode/ripgrep` and streams `rg --json` matches, rather than going through a VS Code search API. VS Code exposes no public streaming *match* API — `vscode.workspace.findFiles` finds files, not match content — so spawning `rg` is the only way to get true streaming line-level results. `@vscode/ripgrep` is the same package VS Code itself bundles to locate a prebuilt `rg`, so the binary path is stable across platforms and the engine matches built-in search.

This supersedes the last bullet of ADR-0003, which guessed that live-grep "may reuse VS Code's search APIs (`vscode.workspace` search)." It cannot: the API doesn't stream matches.

## Considered Options

- **Spawn `@vscode/ripgrep` `rg --json` (chosen).** True streaming, line/column/content directly from `rg`, same engine as VS Code search. Commits us to the `rg --json` output contract.

- **Hunt `rg` on PATH or in the VS Code installation layout.** No new dependency, but fragile across VS Code versions and platforms, and reinvents what `@vscode/ripgrep` already solves.

- **`vscode.workspace.findFiles` + in-JS search.** Rejected: no streaming, reinvents ripgrep in JS, slow on large workspaces, and the API cannot yield match content.

## Consequences

- `searchWorkspace` is source-injected at activation (mirroring the file picker's `findFiles`/`readFile` injection), not added to `PickerContext`. Sourcing is a source concern; `PickerContext` stays scoped to accept/preview.
- The spawn wrapper debounces re-runs itself; the host's query-driven contract is "abort the in-flight source and re-run immediately," and the debounce belongs to the ripgrep-spawning implementation because it is a backend concern (an in-JS source would not need it).
- Committing to `rg --json` is hard to reverse: the grep source parses that contract. Changing backends later means rewriting the parser, not just swapping a primitive.