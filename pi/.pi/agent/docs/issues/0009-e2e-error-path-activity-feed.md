# Issue: End-to-End — Timeout, Crash, and Cancellation Carry Final Activity Feed

## Parent

PRD: docs/prd/0003-subagent-activity-feed-reset.md

## What to build

When a subagent times out, crashes, or is cancelled, the current system writes an error message to the Output File and returns it as tool output. The activity feed (if any) accumulated during execution should still be available in the final result so that expanded final rendering shows what the subagent was doing before failure.

This slice verifies the complete pipeline — Stream Processor → Spawner → Entry Point → renderResult — for all three error paths:

1. **Timeout**: Subagent runs past its timeout threshold. The Spawner kills the child, writes an error to Output File, and returns a `SpawnSubagentResult` with error output + accumulated activity feed. The Entry Point's `renderResult` shows the feed in expanded mode and the error message in `content`.

2. **Crash**: Subagent child process exits unexpectedly. The Stream Processor detects truncated stream. The Spawner returns error output + whatever activity feed was accumulated. The Entry Point renders accordingly.

3. **Cancellation**: User or signal cancels the subagent. The Spawner kills the child, returns error output + accumulated activity feed. The Entry Point renders accordingly.

This is a verification and integration slice. It assumes #0005 (no assistant_text gibberish), #0006 (deduped tools, clean thinking), and #0007 (spawner carries feed) are already in place. It adds tests that exercise the full pipeline for each error path.

## Acceptance criteria

- [x] Timeout path: final result includes accumulated activity feed and error output.
- [x] Crash path: final result includes accumulated activity feed (if any) and error output.
- [x] Cancellation path: final result includes accumulated activity feed and error output.
- [x] Expanded final rendering for each error path shows metadata + activity feed + error output.
- [x] Collapsed final rendering for each error path shows metadata + error output (no feed).
- [x] LLM-facing content for each error path is the error message only (no feed text).
- [x] Usage is captured for each error path where events were emitted before failure.
- [x] End-to-end integration tests cover all three error paths.
- [x] `npm test` passes with all tests green.

## Blocked by

- #0005 — Stream processor must stop emitting assistant_text deltas (otherwise error-path feeds may contain gibberish).
- #0006 — Tool dedup and thinking noise reduction should be in place for clean error-path feeds.
- #0007 — Spawner must carry final activity feed in result.
- #0008 — Entry point must render final activity feed in expanded mode.
