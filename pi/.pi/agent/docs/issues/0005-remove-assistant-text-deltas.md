# Issue: Stream Processor — Remove assistant_text from Streamed Deltas

## Parent

PRD: docs/prd/0003-subagent-activity-feed-reset.md

## What to build

The Stream Processor currently emits `assistant_text` progress events for every sentence-like boundary flushed from streamed text deltas. This produces fragmented, duplicated, and nonsensical output when the subagent's answer contains markdown, file names, code spans, numbered lists, or short fragments.

Remove the `text_delta` → `assistant_text` event path from the stream processor. The Stream Processor should continue to:
- Parse NDJSON stdout and emit semantic progress events (lifecycle, tool starts/updates/completions, thinking text, terminal events, usage).
- Extract final assistant text from `message_end` and `agent_end` events as the authoritative subagent output.
- Return `StreamResult` with `finalText` at completion.

The Activity Feed Formatter should degrade gracefully: if no `assistant_text` events exist in a Progress File, the feed simply shows tool/lifecycle/thinking/usage events without "say" lines. This preserves backward compatibility with older Progress Files that may already contain `assistant_text` events.

## Acceptance criteria

- [x] Stream processor does not emit `assistant_text` events from `text_delta` sub-events of `message_update`.
- [x] Stream processor still returns correct `finalText` at completion from `message_end` and `agent_end` events.
- [x] Tool events, thinking events, lifecycle events, and usage events continue to be emitted unchanged.
- [x] Activity Feed Formatter renders feeds without `assistant_text` events correctly (no errors, no missing lines).
- [x] Activity Feed Formatter still renders legacy Progress Files that contain `assistant_text` events.
- [x] All existing tests pass or are updated to reflect the new behavior (no `assistant_text` events in new streams).
- [x] `npm test` passes with all tests green.

## Blocked by

None — can start immediately.
