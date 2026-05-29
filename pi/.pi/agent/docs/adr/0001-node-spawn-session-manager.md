# Replace tmux session manager with Node.js child_process.spawn

The subagent runtime used tmux as a session manager (one socket per workspace, one pane per subagent) with shell scripts (`tmux-manager.sh`, `subagent-wrapper.sh`, `stream-filter.sh`) for lifecycle orchestration and stdout processing. This was replaced with Node's built-in `child_process.spawn`, a TypeScript stream processor, and per-subagent PID files for crash recovery.

## Rejected alternatives

**Keep tmux.** tmux provided process grouping (all subagents visible in one session) and live attach (`tmux -S .pi/subagents.sock attach`). These were not used in practice — subagents run in background, output is collected programmatically, and there's no interactive debugging workflow that needs tmux attach.

**Use a dedicated process manager (pm2, supervisor).** Would add a heavy dependency for what is essentially "spawn a child, wait for it, collect output." Node's `spawn` is sufficient.

**Hybrid: Node spawn but keep shell scripts for stream filtering.** The bash stream filter was 250 lines of JSON parsing (with jq/python3 dual-path fallback), sentence buffering, and event routing — logic that is simpler, more testable, and fewer lines in TypeScript.
