# Subagent Visualization Redesign

### Problem Statement

The subagent activity feed is visually monotonous — a flat sequential log of single-line events with short text prefixes (`ok`, `fail`, `tool`, `think`, `say`) and ANSI coloring. Tool calls are crammed into one-line summaries with no visual weight, making it easy to miss what tools ran and what parameters they received. Thinking text is dumped as raw plain text with no formatting, despite often containing structured reasoning that would benefit from markdown rendering. The stream moves fast enough that details are lost even when the feed is expanded.

### Solution

Redesign the activity feed with structured visual hierarchy: tool calls rendered as prominent block-style entries with bold names, status indicators, and indented parameters and results; thinking blocks rendered with the full TUI Markdown component for proper formatting; and in-progress tool calls showing an animated spinner to signal active work. Enrich the data pipeline to carry structured tool information (name, raw arguments, result preview) through to the renderer instead of flattening it prematurely.

### User Stories

1. As a developer watching subagent execution, I want tool calls to be visually prominent with their own block in the feed, so that I can quickly scan what work the subagent performed.

2. As a developer watching subagent execution, I want to see tool parameters (commands, file paths, search queries) indented below the tool name, so that I can understand what each tool call is doing at a glance.

3. As a developer watching subagent execution, I want tool results shown as an indented line inside the same block as the call, so that I can see both the request and response as one unit.

4. As a developer watching subagent execution, I want in-progress tool calls to show an animated spinner, so that I can immediately see what the subagent is actively working on right now.

5. As a developer watching subagent execution, I want thinking text rendered as formatted markdown, so that lists, emphasis, and other structured reasoning content is readable and not just raw dumped text.

6. As a developer watching subagent execution, I want a clear visual distinction between tool calls, thinking, and lifecycle events using different bullet styles and indentation, so that I can parse the feed's structure without reading every line.

7. As a developer watching subagent execution, I want the collapsed feed to still show the full block-style format for recent events, so that I get the same visual quality without needing to expand.

8. As a developer watching subagent execution, I want fewer events shown in collapsed mode (since each event takes more vertical space), so that the feed doesn't overflow the screen.

9. As a developer watching subagent execution, I want the spinner on an active tool to keep animating even when no new events arrive, so that a long-running tool call doesn't look frozen.

10. As a developer using Ctrl+O to expand the feed, I want to see the full history with the same block-style format, so that the expanded view is consistent with the collapsed view and not a different format.

11. As a developer reviewing a completed subagent, I want the final metadata block to look consistent with the block-style feed, so that the visual language is unified across the lifecycle.

12. As a developer inspecting a failed tool call, I want the error clearly visible inside the tool block with a failure indicator, so that I can immediately identify what went wrong.

13. As a developer watching a subagent spawn another subagent, I want the nested agent type and prompt to be visible in the tool block, so that I can understand the delegation chain.

14. As a developer reviewing subagent progress, I want assistant text events to still be visually lightweight (not block-style), so that they don't compete with tool calls for attention.

15. As a developer consuming the subagent tool from automation, I want the progress event data model to remain backward-compatible, so that existing integrations don't break.

16. As a developer working on the subagents extension, I want the rendering logic extracted into its own module, so that the tool registration code stays focused and the renderer can evolve independently.

### Implementation Decisions

- **ProgressEvent interface gains three optional fields**: `toolName` (string), `toolArgs` (raw `Record<string, unknown>`), and `toolResultPreview` (string). These are only present on tool events. All existing fields remain unchanged. The progress file format remains backward-compatible because `tail-progress` validates only `type`, `text`, and `timestamp` as required.

- **Stream Processor emits structured tool data**: Tool start events carry `toolName` and `toolArgs` from the NDJSON input. Tool completion events carry `toolName` and `toolResultPreview`. The `text` field continues to be populated with the same summary string for backward compatibility. Tool result preview events remain as-is (they carry incremental output, not final results).

- **Tool results merge into the start event in the activity feed**: The formatter pairs tool start and completion events, merging the result preview into the start event's `ActivityFeedLine`. Completed tool blocks show the result as an indented `→` line. This eliminates the separate `ok bash completed → ...` result line from the feed.

- **Block-style rendering for tool events**: Each tool call produces a multi-line visual block:
  - Line 1: bullet indicator (`●`), tool name (bold/accent), status indicator (`✓` succeeded, `✗` failed, `◐` in-progress)
  - Line 2: `└` tree connector + parameter summary (dim/code style)
  - Line 3 (if result exists): `└─╼` connector + result preview (dim)

- **Markdown rendering for thinking events**: Thinking events use the TUI `Markdown` component for content rendering, preceded by a `◇ thinking` header line in a `Text` component. Both are children of a `Container`.

- **Animated spinner for in-progress tools**: A `setInterval` timer (~80ms) stored in the render context state drives `invalidate()` calls, cycling spinner frames (`◐↔◓↔◑↔◒`). The timer is cleared when the tool completes, when the component is replaced by the final render, or on error. The spinner counter increments on each tick, not on each progress event, ensuring animation continues during quiet periods.

- **Container-based rendering replaces single Text component**: The `renderResult` function builds a `Container` with multiple `Text` and `Markdown` children instead of a single `Text` component. Each tool call and thinking block is one or more child components. The `renderCall` component remains a `Text` (the header is still two lines).

- **Collapsed window reduced from 6 to 3 events**: Block-style entries take roughly 2-3× the vertical space of flat lines. Reducing the collapsed window keeps the same approximate screen footprint.

- **Activity Feed Renderer extracted as new module**: All rendering logic (component building, spinner lifecycle, theme-sensitive formatting, header formatting, metadata block) moves from the tool registration entry point into a dedicated renderer module. The entry point retains only tool registration, execution wiring, and a thin delegation to the renderer.

- **Tool parameter formatting lives in the renderer**: The `summarizeToolArgs` dispatch logic (per-tool arg formatting: bash→command, read→path, edit→path+edit count, subagent→agent_type+prompt, etc.) moves from the stream processor to the renderer. The stream processor passes raw args; the renderer formats them for display. This allows different formatting in different view contexts (collapsed vs expanded, narrow vs wide terminal).

- **ActivityFeedLine gains the same optional fields**: `toolName`, `toolArgs`, and `toolResultPreview` flow through from `ProgressEvent` to `ActivityFeedLine`, giving the renderer structured data to work with.

### Testing Decisions

- **What makes a good test**: Tests should verify external behavior — the shape of data produced, the structure of components built, and the visual output for given input events. They should not assert on internal implementation details like private helper function signatures or intermediate state.

- **Activity Feed Formatter tests**: Assert on the `ActivityFeedOutput` structure — verify that tool events with `toolName`/`toolArgs` produce block-style text in both collapsed and expanded views. Verify tool result merging (start+completion produce a single block with result line). Verify the reduced collapsed window (3 events). Verify backward compatibility when new fields are absent. Verify thinking events are flagged for markdown rendering. Existing test structure (event arrays → expected text) continues to work with updated expectations.

- **Activity Feed Renderer tests**: Assert on the Component structures produced — verify that a tool event produces a Container with appropriate children, that thinking events produce a Markdown child, and that spinner lifecycle (timer start/clear) behaves correctly. Mock the theme object. May need a lightweight TUI render harness that calls `render(width)` on produced components and checks the output lines.

- **ProgressEvent + Tail tests**: Verify that the interface accepts the new optional fields without breaking existing field requirements. Verify that `tail-progress` parsing accepts events both with and without the new fields (backward compatibility). Verify that events missing `type`, `text`, or `timestamp` are still rejected.

- **Stream Processor tests**: Verify that tool start events emit `toolName` and `toolArgs` from the NDJSON input. Verify that tool completion events emit `toolName` and `toolResultPreview`. Verify that `text` field continues to be populated with the same summary string. Verify that non-tool events are unaffected. Existing test structure (NDJSON lines → yielded events) continues to work with additional field assertions.

- **Prior art**: The existing test suites in `activity-feed-formatter.test.ts` and `stream-processor.test.ts` establish the pattern: construct input events, call the function, assert on output shapes and text. The renderer tests will follow the same convention but assert on Component structure rather than plain text.

### Out of Scope

- Side-by-side layout (TUI only supports vertical stacking via Container)
- Progress bars for token usage (visual token counter is acceptable as-is)
- Collapsible thinking blocks (thinking is always shown in full in both views)
- Box-drawing character borders around tool blocks (block-style uses indentation, not box-drawing frames)
- Changes to the NDJSON output format of `pi --mode json`
- Changes to the spawner's process lifecycle or file structure
- Changes to agent definitions or the agent type system
- Web-based or HTML rendering (the visualization is TUI-only)

### Further Notes

- The design was developed through an interactive grilling session that resolved five key decisions: block-style vs inline vs boxed tool rendering, markdown vs italic-vs-collapsible thinking, timer-driven vs event-driven spinner animation, raw-args vs pre-formatted data model, and full-block vs compressed collapsed view.

- The existing ADR 0001 (Node spawn session manager) is unaffected — this change is purely in the rendering and data pipeline layers, not in process management.

- The `CONTEXT.md` glossary terms that apply: Subagent, Stream Processor, Progress File, Agent ID, Task Directory, Agent Type, Agent Definition. No new domain terms are introduced — "activity feed," "block-style," and "spinner" are rendering concepts, not domain concepts.
