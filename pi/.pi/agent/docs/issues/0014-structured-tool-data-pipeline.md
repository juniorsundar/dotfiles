# Issue 0014: Structured tool data through the pipeline

### Parent

PRD: `docs/prd/subagent-visualization-redesign.md`

### What to build

Enrich the `ProgressEvent` interface with three optional fields — `toolName`, `toolArgs`, and `toolResultPreview` — and wire them through the entire data pipeline from stream processor to activity feed formatter. The stream processor already receives structured tool data from the NDJSON stream but currently flattens it into a single `text` summary string. After this change, tool events carry the raw structured data alongside the existing summary text, while non-tool events and the existing `text` field remain unchanged. No visual changes — this is purely data plumbing, verified by tests proving structured data flows correctly and old-format ProgressEvents (without the new fields) are still accepted.

### Acceptance criteria

- [x] `ProgressEvent` interface has optional `toolName` (string), `toolArgs` (`Record<string, unknown>`), and `toolResultPreview` (string) fields
- [x] Stream processor emits `toolName` and `toolArgs` on tool start events (`tool_execution_start`, `tool_call`)
- [x] Stream processor emits `toolName` and `toolResultPreview` on tool completion events (`tool_execution_end`, `tool_result`)
- [x] Stream processor emits `toolName` on tool update events (`tool_execution_update`)
- [x] Existing `text` field on tool events continues to be populated with the same summary string
- [x] Non-tool events (thinking, usage, lifecycle, assistant_text, terminal) are unchanged in shape and content
- [x] `ActivityFeedLine` carries the same three optional fields from `ProgressEvent`
- [x] Activity feed formatter passes the new fields through without altering them
- [x] Tail-progress parses and yields ProgressEvents with the new fields when present
- [x] Tail-progress still accepts events without the new fields (backward compatibility)
- [x] Tail-progress still rejects events missing required fields (`type`, `text`, `timestamp`)
- [x] All existing tests continue to pass without modification

### Blocked by

None — can start immediately.
