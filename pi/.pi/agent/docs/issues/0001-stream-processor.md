# Stream Processor — typed NDJSON event pipeline

### Parent

PRD: `docs/prd/0002-remove-tmux-complete-node-spawn.md`

### What to build

Build `stream-processor.ts`, a TypeScript module that replaces `stream-filter.sh`. It consumes an `AsyncIterable<string>` of NDJSON lines from `pi --mode json` stdout and yields typed events plus final output text. The module is a pure transform — it takes lines in and yields events out, with no file I/O. The spawner (later slice) will pipe child stdout through it and persist the resulting events to `progress.jsonl` and `output.md`.

The stream processor must handle all event types currently managed by `stream-filter.sh`:

- **`agent_start`**: emits a `lifecycle` event with status `started` on the first occurrence.
- **`message_update`** with sub-types extracted from `assistantMessageEvent.type`:
  - `text_delta`: accumulates deltas into a buffer and flushes completed sentences (terminated by `.`, `!`, `?`) as `assistant_text` events.
  - `thinking_delta`, `thinking_start`, `thinking_end`: suppressed (no events emitted), matching current behavior.
- **`message_end`**: extracts final assistant text from `message.content` blocks (filtering to `type: "text"`). If `message.usage` is present, emits a `usage` event with `input`, `output`, `cacheRead`, `cacheWrite` fields.
- **`tool_execution_start`**: emits a `tool` event with status `started` and a compact summary (`[toolName] args...` truncated to 120 chars).
- **`tool_execution_end`**: emits a `tool` event with status `succeeded` or `failed` based on `result.isError`.
- **`agent_end`**: if no final text was captured from `message_end`, extracts it from the `messages` array. Sums total usage across all messages and emits a `usage` event. Yields the final output text and an `agent_end` signal to the consumer.
- **Malformed JSON**: silently skipped (logged to run.log by the persistence layer).
- **Stream truncation** (pipe close without `agent_end`): yields an error signal with any partial text accumulated.

Edge cases covered: empty lines, multi-byte characters (UTF-8), partial lines split across chunk boundaries, and consecutive events without interleaving.

### Acceptance criteria

- [x] NDJSON lines are validated as JSON; malformed lines are silently skipped (warning logged by caller)
- [x] `agent_start` emits a single `lifecycle` event with status `started` (only on first occurrence)
- [x] `text_delta` content is accumulated and flushed as `assistant_text` events on sentence boundaries (`.`, `!`, `?` followed by whitespace or end-of-string)
- [x] `thinking_delta`, `thinking_start`, `thinking_end` are consumed but produce no output events
- [x] `message_end` extracts final text from assistant message content blocks; emits `usage` event when `message.usage` is present
- [x] `tool_execution_start` emits a `tool` event with status `started` and truncated summary
- [x] `tool_execution_end` emits a `tool` event with status `succeeded` or `failed` based on `result.isError`
- [x] `agent_end` yields final output text; sums total usage from all messages; emits `usage` and `lifecycle completed` events
- [x] Stream truncation (no `agent_end`) yields an error signal with partial text
- [x] Multi-byte characters and partial lines across chunk boundaries are handled correctly
- [x] All event shapes match the `ProgressEvent` type from `tail-progress.ts`
- [x] `stream-processor.test.ts` passes with comprehensive coverage of all event types and edge cases

### Blocked by

None — can start immediately.
