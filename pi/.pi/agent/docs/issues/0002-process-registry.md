# Process Registry — cancellation and orphan recovery

### Parent

PRD: `docs/prd/0002-remove-tmux-complete-node-spawn.md`

### What to build

Build `process-registry.ts`, a module that tracks live subagents for cancellation and recovers from crashes. It maintains an in-memory `Map<string, ChildProcess>` keyed by agent ID and writes per-task-directory `process.json` files for crash recovery.

**Registration and deregistration:**
- `register(agentId: string, child: ChildProcess, taskDir: string): void` — adds the child to the in-memory map and writes `process.json` to the task directory with the PID, agent type, and ISO 8601 start time.
- `deregister(agentId: string): void` — removes the child from the map. The `process.json` file is intentionally left in place — it is harmless and provides a record of completed executions. It is cleaned up naturally when the task directory is removed.

**Orphan process reaping:**
- `reapOrphans(subagentsDir: string, workDir: string): void` — called at the start of every `spawnSubagent` call. Scans all task directories under `.pi/subagents/`, reads each `process.json`, checks if the PID is still alive (via `process.kill(pid, 0)` for portability), and if so: sends `SIGKILL` to the orphan, writes a termination error to its `output.md`, and emits a `terminal` event with status `failed`. Already-completed task directories (where the PID is dead) are left untouched.

**Cancellation:**
- `get(agentId: string): ChildProcess | undefined` — looks up a live child process from the map so the spawner can kill it on timeout or `AbortSignal`.

### Acceptance criteria

- [x] `register()` adds child to the map and writes `process.json` with `{ pid, agentType, startedAt }`
- [x] `deregister()` removes the child from the map; `process.json` file remains
- [x] `reapOrphans()` scans task directories, identifies PIDs still alive via `process.kill(pid, 0)`, kills them with `SIGKILL`, writes `[ERROR]` to their `output.md`
- [x] `reapOrphans()` does not touch task directories where the PID is no longer alive
- [x] `get()` returns the `ChildProcess` for a given agent ID or `undefined` if not registered
- [x] Concurrent registration/deregistration (same agent ID, rapid spawn/cancel) does not leak or corrupt the map
- [x] `process-registry.test.ts` passes with coverage of registration, deregistration, orphan detection, and edge cases (missing `process.json`, malformed JSON, PID reuse)
- [x] Module uses `process.kill(pid, 0)` for cross-platform PID liveness check (works on Linux and macOS)

### Blocked by

None — can start immediately.
