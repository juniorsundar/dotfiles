# Issue: Entry Point — Render Final Activity Feed in Expanded Completed Results

## Parent

PRD: docs/prd/0003-subagent-activity-feed-reset.md

## What to build

The subagent tool entry point's `renderResult` function currently renders final (non-partial) results as a metadata block (agent type, model, duration, tokens) followed by the subagent's output text. The `options.expanded` flag is respected for partial results (showing the full activity feed), but final results do not include activity feed data, so expansion has no effect on completed subagent results.

Update `renderResult` to use the final activity feed from `SpawnSubagentResult.activityFeed` (carried through `result.details`):

1. **Collapsed final result**: Render metadata block + separator + clean subagent output. Do not show the activity feed in collapsed mode — the answer is the focus.

2. **Expanded final result**: Render metadata block + separator + full activity feed (showing lifecycle, tools, thinking, usage in chronological order) + separator + clean subagent output. This lets the user answer "how did this subagent work?" without reading raw Task Directory files.

3. **LLM-facing content isolation**: The `content` array in the tool result (what the LLM sees) must remain only the clean final subagent output. Activity feed data lives exclusively in `details` and is only consumed by the TUI renderer.

4. **Graceful degradation**: If `activityFeed` is absent or empty (older spawner, legacy callers), render the same final result as before — metadata + output. No errors, no missing content.

## Acceptance criteria

- [x] Collapsed final result shows metadata block + separator + subagent output (no activity feed).
- [x] Expanded final result shows metadata block + separator + full activity feed + separator + subagent output.
- [x] The `content` field in the tool result contains only the clean subagent output, never activity feed text.
- [x] `renderResult` degrades gracefully when `activityFeed` is absent from details.
- [x] Partial results continue to use the existing live feed rendering path (unchanged).
- [x] Tests verify collapsed vs expanded final rendering differs meaningfully.
- [x] Tests verify LLM-facing content excludes activity feed.
- [x] `npm test` passes with all tests green.

## Blocked by

- #0007 — Spawner must carry `activityFeed` in `SpawnSubagentResult` before the entry point can render it.
