# PRD: Reset Subagent Activity Feed Rendering

### Problem Statement

When a subagent runs, the user wants to understand what the disposable child agent is doing without losing access to the final answer. The current live progress UI attempts to stream assistant text deltas into the activity feed, but those deltas are chunked by sentence-like boundaries that are not compatible with markdown, file names, code spans, numbered lists, or short fragments. The result can look like duplicated or nonsensical text instead of a legible subagent transcript.

The user also expects the normal tool expansion keybinding to reveal useful detail after a subagent finishes. Today the live activity feed only exists in partial progress updates. Once the subagent completes, the final tool result carries output and metadata, but not the final activity feed. Expansion therefore toggles technically, but the completed subagent result has no additional subagent progress detail to show.

### Solution

Reset the subagent activity model so live progress and final output have distinct responsibilities.

The live activity feed should show operational progress: lifecycle, tool use, useful thinking text, terminal events, and usage snapshots. It should stop showing streamed assistant text deltas. The authoritative subagent answer should remain the final output from the subagent's Output File and should be rendered once, cleanly, when the subagent completes.

The final subagent result should carry a final activity feed snapshot in its details. In collapsed mode, the completed result should emphasize metadata and the final output. In expanded mode, it should show the full activity feed plus the same final output, so the user can answer “how did this subagent work?” without reading raw task directory files.

### User Stories

1. As a main pi agent user, I want live subagent progress to be readable, so that I can trust what the subagent is doing while it runs.
2. As a main pi agent user, I want tool use to appear during subagent execution, so that I can see when the subagent reads files, runs commands, or performs other actions.
3. As a main pi agent user, I want tool arguments to be summarized clearly, so that I can understand intent without reading raw JSON.
4. As a main pi agent user, I want tool results to be previewed concisely, so that I can spot useful output and failures while the subagent is still running.
5. As a main pi agent user, I want failed subagent tool calls to stand out, so that I can notice problems immediately.
6. As a main pi agent user, I want useful subagent thinking to be visible, so that I can understand the agent’s plan and reasoning path when thinking visibility is enabled.
7. As a main pi agent user, I want noisy thinking lifecycle markers to be minimized or hidden from collapsed views, so that the feed focuses on meaningful content.
8. As a main pi agent user, I do not want assistant text fragments such as isolated punctuation, file suffixes, or list numbers in the live feed, so that the UI does not look broken.
9. As a main pi agent user, I do not want the final subagent answer duplicated in live progress and final result, so that I can read the answer once in its complete form.
10. As a main pi agent user, I want the final subagent output to preserve markdown structure, so that lists, code spans, headings, and file names remain legible.
11. As a main pi agent user, I want collapsed live progress to show only recent activity, so that long-running subagents do not flood the chat.
12. As a main pi agent user, I want expanded live progress to show the full activity feed, so that I can inspect the whole execution when needed.
13. As a main pi agent user, I want collapsed final results to show the final answer prominently, so that completion reads like a normal tool result.
14. As a main pi agent user, I want expanded final results to include the full activity feed, so that I can audit what happened after the subagent completes.
15. As a main pi agent user, I want the expansion keybinding to change visible subagent content after completion, so that the keybinding behaves consistently with other tools.
16. As a main pi agent user, I want metadata such as agent type, agent ID, model, duration, and token usage to remain available, so that I can diagnose cost and behavior.
17. As a main pi agent user, I want live token usage and tool counts to update the call header, so that I can monitor subagent progress without expanding details.
18. As a main pi agent user, I want progress updates to be best-effort, so that a UI rendering problem does not break the subagent run.
19. As a main pi agent user, I want cancellation, timeout, and crash cases to still return clear final output, so that failures are understandable.
20. As a main pi agent user, I want the Progress File to remain useful post-hoc, so that I can inspect the Task Directory if needed.
21. As a subagent extension maintainer, I want the Stream Processor to have a narrow responsibility, so that it parses JSON events and emits semantic progress without inventing markdown chunking rules.
22. As a subagent extension maintainer, I want the Activity Feed Formatter to encapsulate collapsed and expanded feed presentation, so that UI code can render a stable feed interface.
23. As a subagent extension maintainer, I want the Spawner to return the final activity feed snapshot, so that final rendering does not depend on transient partial updates.
24. As a subagent extension maintainer, I want the subagent tool entry point to pass structured final details to rendering, so that final expansion works after execution is complete.
25. As a subagent extension maintainer, I want tests to describe user-visible behavior, so that future stream-processing changes do not reintroduce gibberish or duplicate answer text.
26. As a subagent extension maintainer, I want the final result contract to remain compatible with existing callers, so that the LLM still receives only the final answer text as tool content.
27. As a subagent extension maintainer, I want activity feed lines to preserve structured type and status, so that color and prefix rendering can be changed without reparsing display text.
28. As a subagent extension maintainer, I want duplicate semantic tool events to be coalesced or ignored when they represent the same tool action, so that a single tool call does not appear to start twice.
29. As a subagent extension maintainer, I want usage extraction to continue working with or without a progress callback, so that token metadata is reliable in interactive and non-interactive paths.
30. As a subagent extension maintainer, I want timeout and cancellation paths to carry whatever final feed is available, so that expanded final failures still show useful context.

### Implementation Decisions

- The Stream Processor should no longer emit assistant text progress events from streamed text deltas. It should continue to use final assistant text from message completion and agent completion events as the authoritative final output.
- The Stream Processor should continue emitting semantic progress events for subagent lifecycle, tool starts, tool updates, tool completions, useful thinking text, terminal events, and usage.
- Thinking lifecycle markers should not dominate the collapsed experience. The preferred behavior is to keep actual thinking content and either omit start/end markers or make them available only where they are useful for debugging.
- Tool start events should be deduplicated when multiple raw JSON event types describe the same semantic tool start. The Progress File should not imply that a tool started twice when it only started once.
- The Activity Feed Formatter should remain the deep module that converts progress events into collapsed and expanded feed views. Its interface should continue to return structured lines, hidden-count metadata, and usage snapshots.
- The Spawner should accumulate or load the final set of progress events and return a final activity feed snapshot with the subagent result. The returned result should include final output, agent identity, agent type, model, duration, usage, and activity feed.
- The subagent tool entry point should keep partial updates and final results separate. Partial updates should use the activity feed as live progress. Final results should include both final output and structured details needed for expanded rendering.
- The LLM-facing content of the subagent tool result should remain the clean final subagent output. Activity feed data is UI detail and should live in structured details rather than being mixed into the answer text.
- Final collapsed rendering should emphasize metadata and the clean final output, not the full feed.
- Final expanded rendering should render metadata, the full activity feed, and the clean final output in a stable order.
- Live collapsed rendering should show recent feed events with a hidden-count indicator when older events are omitted.
- Live expanded rendering should show the full available feed in chronological order.
- The call header should continue to display agent type, model, token usage, context window when known, and tool count.
- Rendering should use structured event type and status for styling rather than parsing display prefixes.
- The Progress File remains an execution artifact in the Task Directory and should remain useful for post-hoc debugging.
- The Output File remains the authoritative source of the final answer and should not be replaced by concatenated streamed deltas.
- Timeout, crash, and cancellation paths should continue writing clear error output and should return available metadata and activity feed where possible.
- No schema migration is required for existing Task Directories. Older Progress Files may lack newer event types or feed metadata, and readers should degrade gracefully.

### Testing Decisions

- Tests should focus on external behavior: what progress events are emitted, what final result shape is returned, what text is rendered in collapsed versus expanded states, and what the LLM-facing tool content contains.
- Stream Processor tests should verify that streamed assistant text deltas do not produce activity feed assistant text events, while final assistant output is still returned at completion.
- Stream Processor tests should verify that markdown-shaped output, numbered lists, file names, and code spans are not split into feed fragments.
- Stream Processor tests should verify that useful thinking text is emitted once and that thinking lifecycle noise is not duplicated.
- Stream Processor tests should verify deduplication of semantically identical tool start events.
- Activity Feed Formatter tests should verify collapsed hidden-count behavior, expanded chronological behavior, usage extraction, line typing, and status preservation.
- Spawner tests should verify that the final result includes a final activity feed snapshot even after progress tailing stops.
- Spawner tests should verify that usage is captured from progress events or from the Progress File when no live progress callback is provided.
- Spawner tests should verify timeout, crash, and cancellation behavior with final feed availability where possible.
- Subagent tool entry point tests should verify that partial updates render feed content while final results render clean output.
- Subagent tool entry point tests should verify that final collapsed and expanded rendering differ meaningfully when a final activity feed is present.
- Subagent tool entry point tests should verify that the LLM-facing final content does not include progress feed text.
- Prior art exists in the current Stream Processor, Activity Feed Formatter, Spawner, Tail Progress, and subagent tool entry point test suites. New tests should extend those suites rather than introduce a separate testing style.

### Out of Scope

- Redesigning the subagent runtime process model.
- Reintroducing tmux or shell-based stream filtering.
- Changing Agent Definition parsing, model selection, tool permissions, or timeout defaults except where needed for activity rendering tests.
- Fixing missing or stale Agent Type definitions.
- Changing web search, researcher tools, or external extension registration.
- Building a full interactive debugger or attach-to-subagent workflow.
- Changing Pi core keybindings or Tool Execution Component internals.
- Persisting rich UI state beyond existing Task Directory artifacts.
- Altering the final answer content produced by the subagent model.

### Further Notes

- The key product distinction is that progress is operational telemetry while output is the subagent’s answer. Mixing streamed answer fragments into telemetry caused the user-visible regression.
- The normal expansion keybinding already reaches custom renderers through the expanded render option. The missing piece is final result data: final details must include a feed worth expanding.
- The glossary terms Subagent, Agent Type, Task Directory, Stream Processor, Process Registry, Output File, Progress File, and Agent ID should continue to be used consistently in implementation and documentation.
