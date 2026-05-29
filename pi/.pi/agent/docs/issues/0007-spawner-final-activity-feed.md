# Issue: Spawner — Return Final Activity Feed in SpawnSubagentResult

## Parent

PRD: docs/prd/0003-subagent-activity-feed-reset.md

## What to build

The Spawner currently accumulates progress events into the Progress File during subagent execution and optionally delivers formatted Activity Feed snapshots via `onProgress` callback. However, the final `SpawnSubagentResult` does not include the activity feed, so `renderResult` has no feed data to show when the subagent completes — Ctrl-O expansion on final results has nothing extra to display.

Add a final activity feed snapshot to `SpawnSubagentResult`:

1. **Accumulate events**: The spawner already collects progress events during execution (via the stream consumer loop and progress tailing). Keep this behavior.

2. **Generate final feed**: After the stream consumer finishes and progress tailing stops, format the accumulated events through the Activity Feed Formatter to produce a final `ActivityFeedOutput`.

3. **Extend SpawnSubagentResult**: Add an `activityFeed: ActivityFeedOutput` field to the result type. This is the final snapshot at the moment the subagent finishes (or times out/crashes).

4. **Preserve backward compatibility**: Existing callers that only read `output`, `agentId`, `agentType`, `model`, `duration`, and `usage` should not break. The new field is additive.

5. **Handle error paths**: On timeout, crash, or cancellation, return whatever activity feed has been accumulated up to that point (even if partial). Do not throw if formatting fails.

## Acceptance criteria

- [x] `SpawnSubagentResult` type includes an `activityFeed` field.
- [x] After successful completion, `activityFeed` contains all accumulated events formatted through the Activity Feed Formatter.
- [x] After timeout, `activityFeed` contains events accumulated before timeout.
- [x] After crash, `activityFeed` contains events accumulated before crash.
- [x] After cancellation, `activityFeed` contains events accumulated before cancellation.
- [x] The activity feed is available even when no `onProgress` callback was provided (events are still persisted and can be read from Progress File or accumulated in-memory).
- [x] Usage extraction continues working correctly via both progress events and Progress File fallback.
- [x] Existing tests continue to pass; new tests verify activity feed presence in final result.
- [x] `npm test` passes with all tests green.

## Blocked by

None — can start immediately. Parallel with #0005 and #0006.
