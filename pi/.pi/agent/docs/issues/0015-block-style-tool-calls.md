# Issue 0015: Block-style tool calls

### Parent

PRD: `docs/prd/subagent-visualization-redesign.md`

### What to build

The centerpiece visual change: tool calls in the activity feed are rendered as prominent multi-line blocks instead of flat single-line summaries. Each tool block shows a bullet indicator (●) with the tool name in bold, an indented `└` line with parameter details, and an indented `└─╼` line with the result preview when the tool completes. Tool start and completion events are merged into a single block — the separate `ok bash completed → ...` result line is eliminated. The collapsed window is reduced from 6 to 3 events to preserve screen density. The rendering logic is extracted from the tool registration module into a dedicated activity feed renderer module. Tool argument formatting (the per-tool dispatch that formats bash commands, file paths, search queries, etc.) moves from the stream processor to the renderer so it can adapt formatting to the display context. Both collapsed and expanded views use the same block format. Failed tools show a ✗ indicator with the error in the result line.

### Acceptance criteria

- [x] Tool calls render as multi-line blocks: `● name status` header, `└ params` line, `└─╼ result` line (when result exists)
- [x] Tool name is rendered in bold/accent style
- [x] Status indicators: `✓` succeeded, `✗` failed, none for in-progress (spinner is a separate issue)
- [x] Parameter summary is indented with `└` tree connector in dim/code style
- [x] Result preview is indented with `└─╼` connector in dim style
- [x] Tool start and completion events are merged into a single block in the activity feed (no separate result line)
- [x] Failed tool blocks show `✗` and include the error text in the `└─╼` line
- [x] Collapsed window default reduced from 6 to 3 events
- [x] Both collapsed and expanded views render tool calls in block style
- [x] Rendering logic is extracted into a dedicated activity feed renderer module (separate from tool registration)
- [x] Tool argument formatting logic (summarizeToolArgs dispatch) lives in the renderer, not the stream processor
- [x] The renderer builds Container-based components (not a single Text)
- [x] Existing non-tool event types (lifecycle, usage, assistant_text, terminal) continue to render correctly
- [x] Feed text output (collapsed/expanded) reflects the new block format
- [x] All formatter tests updated to match new block-style text expectations
- [x] Renderer tests verify Component structure for tool block components

### Blocked by

- Issue 0014 — structured tool data must flow through the pipeline before the renderer can use it
