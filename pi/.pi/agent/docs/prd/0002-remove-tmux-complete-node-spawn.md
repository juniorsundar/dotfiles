# PRD: Remove tmux Session Manager — Complete Node.js Spawn Refactor

### Problem Statement

The subagent runtime uses tmux as a session manager — one Unix socket per workspace, one tmux pane per subagent — orchestrated through three bash shell scripts (`subagent-wrapper.sh`, `tmux-manager.sh`, `stream-filter.sh`). This adds a heavy external dependency (tmux), forces complex shell-script lifecycle orchestration, and requires a 250-line bash JSON parser with dual `jq`/`python3` fallback paths.

An ADR was written and agreed (ADR 0001) documenting the decision to replace tmux with Node.js `child_process.spawn`, but the implementation was never completed. The TypeScript stream processor, PID-based process registry, and orphan process recovery described in the ADR and CONTEXT.md do not exist in code — the shell scripts remain the active execution path.

### Solution

Complete the refactor described in ADR 0001: remove all tmux dependencies, replace the three shell scripts with a TypeScript stream processor, spawn `pi` directly from Node.js, and add a process registry for cancellation and crash recovery.

### User Stories

> As a developer setting up pi, I want subagents to work without installing tmux, so that I have fewer system dependencies to manage.

> As a pi user, I want subagent spawns to be faster, so that agent delegation doesn't add unnecessary latency from shell script orchestration and tmux pane management.

> As a pi maintainer, I want stream processing logic (JSON parsing, sentence buffering, event routing) in TypeScript instead of bash, so that it is simpler, more testable, and does not require dual jq/python3 fallback paths.

> As a pi maintainer, I want a typed stream processor module with unit tests, so that I can confidently change event routing logic without breaking subagent output collection.

> As a pi user, I want subagent crashes to be recovered gracefully on the next pi session launch, so that orphan processes from a prior crash don't leak or block new subagent spawns.

> As a pi user, I want to cancel a running subagent and have it cleanly killed, so that I can stop a misbehaving agent without restarting pi.

> As a pi user, I want progress events (lifecycle, tool, assistant text, usage) delivered during subagent execution exactly as they are today, so that the live progress UI continues to work without visible changes.

> As a pi user, I want the final output from a subagent collected into `output.md` exactly as it is today, so that callers of `spawnSubagent()` receive the same result shape.

> As a pi developer, I want `spawnSubagent()` to return enriched results (duration, model, usage) as it already does, so that no caller of the spawner needs to change.

> As a pi user running in a headless environment, I want subagents to work without a terminal or pseudo-terminal, so that subagents function in CI, Docker, and SSH sessions where tmux cannot allocate a pty.

### Implementation Decisions

**Remove tmux entirely.** The three shell scripts (`subagent-wrapper.sh`, `tmux-manager.sh`, `stream-filter.sh`) are deleted. The `tmux` binary is no longer required as a system dependency. The ADR already documented this decision — the implementation now catches up.

**Spawn `pi` directly from `spawner.ts`.** Instead of spawning `bash subagent-wrapper.sh`, `spawner.ts` constructs the `pi` command from the manifest (already built by `command-builder.ts`), sets environment variables, and calls `child_process.spawn("pi", args, { env, stdio: ["ignore", "pipe", "pipe"] })`. Stdout is piped through the new TypeScript stream processor. Stderr is captured for diagnostics.

**New module: `stream-processor.ts`.** A TypeScript implementation of `stream-filter.sh` that:
- Reads NDJSON lines from the child process stdout (`pi --mode json` output)
- Validates each line as JSON, writes raw events to `events.jsonl`
- Extracts event types: `agent_start`, `message_update` (with sub-types `text_delta`, `thinking_delta`, `thinking_start`, `thinking_end`), `message_end`, `tool_execution_start`/`tool_call`, `tool_execution_end`/`tool_result`, `agent_end`
- Buffers `text_delta` content and flushes completed sentences (terminated by `.`, `!`, `?`) to progress.jsonl as `assistant_text` events — matching the current sentence-splitting behavior
- Writes lifecycle events (`lifecycle started` on first `agent_start`, `lifecycle completed` on `agent_end`)
- Writes tool events (`tool started`/`succeeded`/`failed`) with truncated summaries
- Extracts usage from `message_end` and `agent_end` messages, writes `usage` progress events
- On `agent_end`, writes the final assistant text to `output.md` and signals completion
- On stream truncation (pipe close without `agent_end`), writes an error to `output.md` and signals failure
- Exposes the stream as an `AsyncIterable<ProgressEvent>` so the spawner can observe progress events without polling a file

The stream processor does NOT write `progress.jsonl` or `output.md` to disk itself. Instead, it yields structured events and the spawner persists them. This separation keeps the stream processor pure and testable — it transforms NDJSON into typed events without file I/O side effects. A thin persistence layer in `spawner.ts` (or a small helper) writes the files.

**New module: `process-registry.ts`.** An in-memory `Map<string, ChildProcess>` tracking live subagents by agent-id for cancellation. On each `spawnSubagent` call and on startup, the registry scans task directories for `process.json` files with PIDs that are still alive (orphan processes) and kills them, writing a termination error to their `output.md`. The registry also writes `process.json` (PID, agent-type, start time) to each task directory on spawn.

**`spawner.ts` changes.** Replaces the shell wrapper spawn with direct `pi` spawn. Integrates the stream processor and process registry. The public API (`spawnSubagent`, `SpawnSubagentOptions`, `SpawnSubagentResult`) does not change — callers are unaffected. The `wrapperPath` option (used by tests) is repurposed or replaced with a `piPath` override for testing.

**No changes to existing TypeScript modules.** `agent-definition-parser.ts`, `command-builder.ts`, `tail-progress.ts`, `activity-feed-formatter.ts`, and `index.ts` are not modified. `tail-progress.ts` continues to work by reading `progress.jsonl` from disk — the persistence layer writes that file from stream processor events.

**No schema changes.** Task directory structure (`task.md`, `manifest.json`, `output.md`, `events.jsonl`, `progress.jsonl`, `run.log`) is unchanged. The new `process.json` file is additive.

**Environment variables.** Environment variables from the agent definition and overrides are passed directly to the child process via the `env` option of `spawn()`, rather than being exported inside a shell wrapper script. This removes the base64-encoding/decoding workaround needed for shell boundary crossing.

### Testing Decisions

**What makes a good test:**
- Tests exercise external behavior only — given an input stream of NDJSON events, the stream processor yields the correct sequence of typed events; given a child process exit, the spawner reads the correct output.md and returns the expected result shape. No tests depend on internal implementation details like buffer management or poll intervals.
- Tests use real `spawn()` only when necessary (smoke tests); unit tests use mocked child processes via Node's `EventEmitter` pattern or synthetic NDJSON streams.
- Existing test patterns in `spawner.test.ts` (fake wrapper shell scripts, deterministic IDs, temp directories) are the prior art. New tests follow the same conventions adapted for the TypeScript stream processor.

**Modules tested:**
- `stream-processor.test.ts` — unit tests for NDJSON parsing, event type extraction, sentence buffering, agent_end output extraction, usage extraction, error handling (malformed JSON, stream truncation without agent_end), and edge cases (empty lines, multi-byte characters, partial lines across chunk boundaries).
- `spawner.test.ts` — updated integration tests: spawns real `pi` (or a mock echo script) through the new code path, verifies output.md contents, progress.jsonl events, process.json PID tracking, timeout/cancellation killing the child process, orphan process reaping on startup.
- `process-registry.test.ts` — unit tests for orphan detection (scanning task directories, checking alive PIDs, writing termination errors) and registration/deregistration on spawn/exit.

### Out of Scope

- Changes to the `pi` binary itself or its `--mode json` output format
- Changes to agent definition files or the agent definition parser
- Changes to `tail-progress.ts`, `activity-feed-formatter.ts`, or the progress UI rendering in `index.ts`
- Any new subagent types or changes to existing agent definitions
- Support for Windows `cmd.exe` or PowerShell — `child_process.spawn` works on all platforms Node supports, but this refactor only targets Unix (Linux/macOS) since pi itself is Unix-only
- Live tmux attach for interactive debugging — the ADR already determined this was not used in practice
- Process grouping (multiple subagents visible in one session) — not needed since subagents run in background and output is collected programmatically

### Further Notes

The existing test suite (`spawner.test.ts`, `subagent-wrapper.test.ts`, `tmux-manager.test.ts`, `stream-filter.test.ts`) provides strong regression coverage. After the refactor, `subagent-wrapper.test.ts`, `tmux-manager.test.ts`, and `stream-filter.test.ts` are removed along with their corresponding shell scripts. The behavior they tested is covered by the new TypeScript module tests.

The `tail-progress.ts` module continues to serve the progress UI by reading `progress.jsonl` from disk. The stream processor yields events to the spawner in real time, and the spawner persists them. This two-path approach (real-time callback for the progress UI + disk-persisted file for tailing) is already the pattern used today — the stream processor just replaces the bash pipeline that wrote those files.
