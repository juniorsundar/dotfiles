# Issue 0016: Markdown-rendered thinking

### Parent

PRD: `docs/prd/subagent-visualization-redesign.md`

### What to build

Thinking events in the activity feed are rendered using the TUI Markdown component instead of plain text. Each thinking block shows a `◇` header line followed by the thinking content rendered as formatted markdown — preserving lists, emphasis, code spans, and other structured content that is currently dumped as raw unformatted text. Thinking blocks are visually distinct from tool blocks (different bullet style ◇ vs ●, markdown rendering vs plain text). Assistant text events remain lightweight (not block-style) so they don't compete with tool calls for visual attention. The renderer builds a Container with a Text header component and a Markdown child component for each thinking block.

### Acceptance criteria

- [x] Thinking events render with a `◇ thinking` header line
- [x] Thinking content is rendered using the TUI Markdown component (not plain Text)
- [x] Lists, emphasis, code spans, and other markdown constructs render correctly in thinking blocks
- [x] Thinking blocks are visually distinct from tool call blocks
- [x] Multiple consecutive thinking events produce separate thinking blocks (not merged)
- [x] Assistant text events remain lightweight single-line style (not block-style)
- [x] Renderer builds a Container with Text header + Markdown child for thinking blocks
- [x] Both collapsed and expanded views render thinking as markdown
- [x] Formatter flags thinking events for markdown rendering (via type or a flag on ActivityFeedLine)
- [x] Renderer tests verify that thinking events produce a Container with appropriate Text + Markdown children

### Blocked by

- Issue 0015 — needs Container-based rendering infrastructure and the extracted renderer module
