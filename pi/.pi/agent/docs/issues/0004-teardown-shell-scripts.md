# Teardown — remove shell scripts and their tests

### Parent

PRD: `docs/prd/0002-remove-tmux-complete-node-spawn.md`

### What to build

Remove all tmux-dependent shell scripts and their test files now that the TypeScript spawn path is the active execution path.

**Delete shell scripts:**
- `extensions/subagents/subagent-wrapper.sh` — bash orchestrator that validates the manifest, ensures the tmux server, opens a pane, and runs `pi` through `stream-filter.sh`.
- `extensions/subagents/tmux-manager.sh` — tmux lifecycle functions: `ensure-server`, `open-pane`, `kill-pane`, `attach-hint`.
- `extensions/subagents/stream-filter.sh` — NDJSON stdout processor with dual `jq`/`python3` JSON parsing fallback.

**Delete test files:**
- `extensions/subagents/subagent-wrapper.test.ts` — integration tests for the wrapper (fixture setup/teardown for isolated tmux socket directories).
- `extensions/subagents/tmux-manager.test.ts` — tests for tmux pane lifecycle.
- `extensions/subagents/stream-filter.test.ts` — tests for the bash stream filter with fake `pi` subprocess.

**Verify no remaining references.** Search the codebase for any remaining imports, requires, or shell invocations of these scripts. Search for `tmux` references outside of documentation (the ADR itself documents the removed system). If `confirm-mutating-tools.ts` uses tmux for Neovim diff approval windows, that is out of scope — this slice only removes subagent-related tmux dependencies.

**Remove from any configuration or documentation** that references these scripts as active dependencies (e.g., README mentions of tmux as a requirement).

### Acceptance criteria

- [x] `subagent-wrapper.sh` is deleted
- [x] `tmux-manager.sh` is deleted
- [x] `stream-filter.sh` is deleted
- [x] `subagent-wrapper.test.ts` is deleted
- [x] `tmux-manager.test.ts` is deleted
- [x] `stream-filter.test.ts` is deleted
- [x] No remaining imports, requires, or shell invocations reference the deleted scripts
- [x] No remaining code references `tmux` for subagent functionality (documentation references are fine)
- [x] The full test suite (`spawner.test.ts`, `stream-processor.test.ts`, `process-registry.test.ts`, and any remaining tests) passes
- [x] Subagent spawns continue to work end-to-end without any shell script dependency

### Blocked by

- `docs/issues/0003-spawner-refactor.md`
