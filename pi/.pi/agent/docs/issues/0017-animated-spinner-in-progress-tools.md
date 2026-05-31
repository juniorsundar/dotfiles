# Issue 0017: Animated spinner for in-progress tools

### Parent

PRD: `docs/prd/subagent-visualization-redesign.md`

### What to build

In-progress tool calls show an animated spinner in the block header, replacing the static ● bullet with a cycling ◐ indicator. The spinner is driven by a `setInterval` timer (~80ms) stored in the render context state, ensuring animation continues even during quiet periods when no new progress events arrive. Each timer tick increments a spinner frame counter and calls `invalidate()` to trigger a re-render. The timer is cleaned up when the tool completes (replaced by ✓ or ✗), when the component is replaced by the final render, or on error. This gives an immediate visual signal of what the subagent is actively working on right now.

### Acceptance criteria

- [x] In-progress tool blocks show an animated spinner indicator (◐) instead of the static ● bullet
- [x] Spinner is driven by a `setInterval` timer (~80ms), not by progress event arrival
- [x] Timer is stored in render context state and shared across partial renders
- [x] Each timer tick increments a frame counter and calls `context.invalidate()`
- [x] Spinner keeps animating during quiet periods (no new events for seconds)
- [x] When a tool completes, its spinner is replaced by the appropriate status indicator (✓ or ✗)
- [x] When a tool completes, the spinner timer is cleared
- [x] Timer is cleared on final render (component replacement) to prevent leaks
- [x] Timer is cleared on error paths to prevent leaks
- [x] Only the most recently started in-progress tool shows a spinner (not all started tools)
- [x] Renderer tests verify spinner lifecycle: timer starts on tool start, clears on completion, clears on final render

### Blocked by

- Issue 0015 — needs block-style tool call rendering with status indicators
