# Spawner refactor — direct pi spawn + stream processor + process registry

### Parent

PRD: `docs/prd/0002-remove-tmux-complete-node-spawn.md`

### What to build

Modify `spawner.ts` to replace the shell wrapper spawn with a direct `child_process.spawn("pi", args, ...)` call, wire the new TypeScript stream processor and process registry, and add a persistence layer that writes `progress.jsonl` and `output.md` from stream processor events.

**Direct pi spawn.** Instead of `spawn("bash", [wrapperPath, taskDir, manifestPath])`, construct the `pi` command from the manifest (already built by `command-builder.ts`), set environment variables directly on `spawn()`'s `env` option, and spawn `pi` with `stdio: ["ignore", "pipe", "pipe"]`. Remove the base64-encoding/decoding workaround that was needed for shell boundary crossing.

**Stream processor integration.** Pipe `child.stdout` through the stream processor. Iterate the resulting `AsyncIterable<ProgressEvent>`, write each event to `progress.jsonl` (replacing what `stream-filter.sh` used to write), and accumulate events for the live progress callback. On `agent_end`, write the final text to `output.md`. On stream truncation, write an error to `output.md`.

**Process registry integration.** On spawn, call `registry.register(agentId, child, taskDir)`. On exit, call `registry.deregister(agentId)`. At the top of `spawnSubagent`, before creating the task directory, call `registry.reapOrphans()`.

**Progress callback preservation.** The `onProgress` callback and `startProgressTailing` mechanism continue to work. `tail-progress.ts` continues to read `progress.jsonl` from disk — the persistence layer writes that file, the tailer reads it. No changes to `tail-progress.ts`, `activity-feed-formatter.ts`, or `index.ts`.

**Public API stability.** `SpawnSubagentOptions`, `SpawnSubagentResult`, and `spawnSubagent()`'s return shape must not change. The `wrapperPath` option is removed; a new `piPath` option replaces it for test override. The `generateId`, `onProgress`, `signal`, `workDir`, `overrides` options continue to work as before.

**Manifest and task directory.** `manifest.json`, `task.md`, `output.md`, `events.jsonl`, `progress.jsonl`, and `run.log` continue to be written with the same structure. The new `process.json` is additive.

### Acceptance criteria

- [x] `spawnSubagent` spawns `pi` directly via `child_process.spawn` instead of `bash subagent-wrapper.sh`
- [x] Environment variables from the agent definition and overrides are passed via `spawn()`'s `env` option, not base64-encoded through a shell script
- [x] `pi` stdout is piped through the stream processor; `progress.jsonl` is written with all lifecycle, tool, assistant_text, and usage events matching current behavior
- [x] `output.md` is written with final assistant text on `agent_end`, or an error message on stream truncation
- [x] `events.jsonl` and `run.log` are written by the persistence layer (or the stream processor) with the same content as today
- [x] Process registry registers on spawn and deregisters on exit; orphan reaping runs at the start of every `spawnSubagent` call
- [x] Timeout kills the child process via `SIGTERM` and writes a timeout error to `output.md` (same behavior as today)
- [x] `AbortSignal` cancellation kills the child process and stops progress tailing
- [x] `onProgress` callback receives `ActivityFeedOutput` snapshots at the same cadence as today
- [x] `SpawnSubagentResult` includes `output`, `agentId`, `agentType`, `duration`, `model`, and `usage` — unchanged
- [x] `wrapperPath` option is removed; `piPath` option replaces it for test overrides
- [x] Existing tests in `spawner.test.ts` are updated to work with the new code path; no regressions in timeout, cancellation, unknown agent error, or output extraction
- [x] Subagent spawns work without tmux installed anywhere on the system
- [x] Subagent spawns work in a headless environment (no `$TERM`, no pty)

### Blocked by

- `docs/issues/0001-stream-processor.md`
- `docs/issues/0002-process-registry.md`
