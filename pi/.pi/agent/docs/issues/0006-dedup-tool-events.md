# Issue: Stream Processor — Deduplicate Tool Events and Reduce Thinking Noise

## Parent

PRD: docs/prd/0003-subagent-activity-feed-reset.md

## What to build

The Stream Processor currently emits separate "tool started" events for `tool_call` and `tool_execution_start` even when they refer to the same semantic tool invocation (same `toolCallId`). This makes the Progress File and activity feed show a tool starting twice when it only started once.

Additionally, `Thinking started` and `Thinking complete` lifecycle markers add noise to the activity feed, especially in collapsed views where they consume valuable space without conveying useful information.

Implement two changes in the stream processor:

1. **Tool event deduplication**: Track which `toolCallId`s have already emitted a "tool started" event. When a `tool_call` or `tool_execution_start` event arrives for a `toolCallId` that already has a start event, skip the duplicate. Track completions similarly to avoid double-ending.

2. **Thinking noise reduction**: Do not emit `Thinking started` or `Thinking complete` marker events. Keep emitting actual thinking content (the `thinking_delta` text) as `thinking` events. The "thinking started" / "thinking complete" lifecycle markers are visible in expanded views if needed, but should not appear in the Progress File or activity feed by default.

Both changes are internal to the stream processor. The Activity Feed Formatter, Spawner, and Entry Point do not need modification.

## Acceptance criteria

- [x] A stream with both `tool_call` and `tool_execution_start` for the same `toolCallId` produces exactly one "tool started" event.
- [x] A stream with only `tool_execution_start` produces one "tool started" event (no regression).
- [x] A stream with only `tool_call` produces one "tool started" event (no regression).
- [x] `tool_execution_update` and `tool_execution_end` events still fire for deduplicated tools.
- [x] Thinking delta content is still emitted as `thinking` events.
- [x] `Thinking started` and `Thinking complete` markers are not emitted as events.
- [x] Tests cover deduplication with mixed event ordering.
- [x] Tests cover thinking noise reduction with start/delta/end sequences.
- [x] `npm test` passes with all tests green.

## Blocked by

None — can start immediately. Parallel with #0005.
