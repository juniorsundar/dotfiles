# Subagents Extension

Delegates bounded work from the main pi agent to disposable child agents (scout, worker, planner, etc.). Each subagent is a fresh `pi` process with its own system prompt, tool set, model, and timeout.

## Language

**Subagent**:
A disposable child `pi` process spawned to perform a bounded task, then collected for its output.
_Avoid_: Worker, child process, delegate process (those are agent types, not the generic concept)

**Agent Type**:
A named role (e.g. scout, worker, reviewer) defined by a `.md` file in the agents directory with YAML frontmatter specifying tools, model, system prompt, timeout, and inheritance flags.
_Avoid_: Agent class, agent profile

**Agent Definition**:
The `.md` file that declares an agent type's configuration via YAML frontmatter. The body is the system prompt.
_Avoid_: Agent config, agent spec

**Task Directory**:
A per-execution directory at `.pi/subagents/<agent-id>/` containing task.md, manifest.json, output.md, events.jsonl, progress.jsonl, run.log, and process.json.
_Avoid_: Run directory, working directory

**Manifest**:
`manifest.json` in the task directory — records the full `pi` command, environment variables, and agent-id for a specific execution. Written before spawn, read by the wrapper for lifecycle orchestration.
_Avoid_: Task config, run manifest

**Stream Processor**:
A TypeScript module that consumes `pi --mode json` NDJSON stdout, routes events, writes files (events.jsonl, progress.jsonl, output.md, run.log), and delivers progress events to the spawner via callback.
_Avoid_: Event filter, output filter

**Process Registry**:
An in-memory `Map<string, ChildProcess>` tracking live subagents for cancellation, plus per-task-directory `process.json` files (PID, agent-type, start time) for crash recovery.
_Avoid_: Process table, PID map

**Output File**:
`output.md` in the task directory — the authoritative final text from the subagent. Written by the stream processor on `agent_end` (or with an error if the stream truncates).
_Avoid_: Result file, response file

**Progress File**:
`progress.jsonl` in the task directory — NDJSON of lifecycle, tool, assistant_text, terminal, and usage events emitted during execution. Used for live progress UI and post-hoc usage extraction.
_Avoid_: Event log, activity feed

**Agent ID**:
A unique identifier per execution, formatted as `<agent-type>-<8-char-uuid>` (e.g. `scout-a3f1b2c3`). Used for the task directory name and in the process registry.
_Avoid_: Run ID, execution ID

**Orphan Process**:
A `pi` child process whose parent spawner crashed without cleaning up. Detected on startup by scanning task directories for process.json files whose PIDs are still alive. Reaped by the first spawnSubagent call in a new session.
_Avoid_: Zombie, leaked process, stale subagent

## Flagged ambiguities

None currently.

## Example dialogue

> **Dev**: I want to spawn a scout subagent — what happens step by step?
>
> **Domain Expert**: spawner.ts generates an agent-id like `scout-a1b2c3d4`, creates a task directory at `.pi/subagents/scout-a1b2c3d4/`, writes task.md and manifest.json, then writes process.json with the PID. It spawns `pi --mode json --no-session ... -p <task>` directly via Node's `spawn`. Stdout is piped through the stream processor which writes events.jsonl, progress.jsonl, and output.md, and calls back with progress events for the live UI. On `agent_end`, output.md gets the final text and the spawner reads it back. On timeout or cancellation, spawner kills the child and the stream processor writes an error to output.md.
>
> **Dev**: What if the main process crashes mid-execution?
>
> **Domain Expert**: The `pi` child's pipes break when the parent dies, so it exits naturally. On next launch, the first `spawnSubagent` call scans existing task directories, checks which PIDs are alive, and kills any still running — those become orphan processes. It writes a termination error to their output.md so the user sees what happened.
