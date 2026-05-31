# Plan: 0017 Animated Spinner for In-Progress Tools
> Status: complete

## Decisions
- **Spinner frames**: ◐ ◓ ◑ ◒ (4 frames, ~80ms interval)
- **State storage**: `context.state.spinnerTimer` + `context.state.spinnerFrame` (shared across partial renders)
- **Timer management**: In `renderResult` in `index.ts` (partial path for start/clear, non-partial path for cleanup)
- **Spinner rendering**: `renderActivityFeed` accepts `spinnerFrame` param, passed from `renderResult` via `state.spinnerFrame`
- **Most-recently-started detection**: Walk lines from end, find last `isToolBlock && status===started`
- **Timer check uses expanded.lines** (not collapsed) to avoid clearing timer when tool scrolled out of collapsed window
- **Timer gate uses isToolBlock()** to ensure timer only starts when a visible tool block exists

## Files Changed

### `extensions/subagents/activity-feed-renderer.ts`
- Added `SPINNER_CHARS` constant (4 frames: ◐◓◑◒)
- Added optional `spinnerFrame` parameter to `renderActivityFeed`
- Added `latestInProgressIndex` detection (walks lines from end)
- Added `Math.abs(Math.trunc())` guard on frame index
- Updated `renderLine` to accept optional `spinnerChar`
- Updated `renderToolHeader` to use `spinnerChar ?? "●"`

### `extensions/subagents/activity-feed-renderer.test.ts` (+4 tests)
- Spinner character renders instead of ● when spinnerFrame=0
- Frame cycling through all 4 characters
- Completed tool shows ● ✓ even with spinnerFrame (no spinner on completed)
- Multiple in-progress: only latest gets spinner, others show ●

### `extensions/subagents/index.ts`
- Imported `isToolBlock` from formatter
- Added spinner timer management in `renderResult` partial path (start/clear)
- Added timer cleanup in non-partial path (final render)
- Passes `state.spinnerFrame` to `renderActivityFeed`

### `extensions/subagents/index.test.ts` (+8 tests)
- Timer starts on in-progress tool, ticks increment frame + invalidate
- spinnerFrame passed through to renderActivityFeed (◐ rendered)
- Timer cleared when all tools complete
- Timer cleared on final (non-partial) render
- Timer cleared on error result
- No timer when feed has no in-progress tools
- No duplicate timer when one exists
- Timer kept when in-progress tool only in expanded.lines

## Test Results
All 232 tests pass across 11 test files.