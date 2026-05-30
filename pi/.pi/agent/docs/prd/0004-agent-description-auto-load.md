# PRD: Auto-Load Agent Descriptions into Subagent Tool

### Problem Statement

The main pi agent learns about available subagent types from two sources: a manually-maintained capability matrix in `AGENTS.md`, and the `subagent` tool description which currently lists only bare agent type names (e.g. "scout, worker, planner"). The capability matrix in `AGENTS.md` duplicates information that already exists in each agent definition's YAML frontmatter `description` field. When an agent is added or removed, the developer must update both the agent's `.md` file and `AGENTS.md` — a synchronisation burden that is easy to forget and leads to stale documentation.

The capability matrix also occupies significant context budget on every turn, even though it is reference material the LLM only needs at delegation time. A separate `docs/subagent-reference.md` file exists to hold even more detailed per-agent guidance, adding a third place where agent documentation lives.

### Solution

Wire the `description` field from each agent definition's YAML frontmatter directly into the `subagent` tool description. The main pi agent will see a list of available agent types with their one-line descriptions in the tool prompt, updated automatically when agents are added or removed.

Strip `AGENTS.md` down to delegation philosophy: generalised directives about when and how to delegate, risk controls, the prompt contract, and illustrative chaining examples. Remove the capability matrix, routing shortcuts, and local-worker preference. Delete `docs/subagent-reference.md` entirely.

The result: agent descriptions are DRY (defined once in each agent's `.md` file), `AGENTS.md` is a lightweight delegation guide, and there is no separate reference document to maintain.

### User Stories

1. As a pi agent maintainer, I want agent descriptions to be defined in one place (the agent's `.md` file), so that I do not need to update multiple documents when adding or removing agents.
2. As a pi agent maintainer, I want the `subagent` tool description to auto-populate with agent descriptions, so that the main agent always sees current available types without manual updates.
3. As a pi agent maintainer, I want `AGENTS.md` to contain only delegation philosophy, so that it stays small and does not duplicate agent-specific information.
4. As a pi agent maintainer, I want to delete `docs/subagent-reference.md`, so that there is one fewer documentation file to keep in sync.
5. As a main pi agent, I want to see a brief description of each available agent type in the tool prompt, so that I can make informed delegation decisions.
6. As a main pi agent, I want generalised risk controls in `AGENTS.md`, so that I know when to dispatch review or challenge subagents without the guidance being tied to specific agent names.
7. As a main pi agent, I want illustrative chain examples in `AGENTS.md`, so that I can understand common delegation patterns.
8. As a main pi agent, I want the prompt contract template to remain in `AGENTS.md`, so that I know the expected format for spawning subagents.
9. As a pi agent maintainer, I want the domain glossary (`CONTEXT.md`) updated to reflect the removal of `subagent-reference.md`, so that future readers are not confused by references to a deleted file.

### Implementation Decisions

**Module: `extensions/subagents/index.ts`**

- Modify `buildToolDescription(agentsDir)` to iterate over available agent definitions, parse each one with `parseAgentDefinitionFile()`, and extract the `description` field.
- Format the tool description as a preamble followed by a bullet list of agent types with their descriptions.
- If an agent definition has no `description` field, omit the description or show a fallback like "(no description)".
- If parsing fails for an agent, fall back to listing the type name without a description.
- Cache the parsed descriptions to avoid re-reading files on every tool call (the tool description is built once at registration time).

**Module: `AGENTS.md` (both `~/.pi/agent/AGENTS.md` and `dotfiles/pi/.pi/agent/AGENTS.md`)**

- Keep: Core Rule, Delegate When Useful, Prompt Contract.
- Generalise: Risk Controls — remove explicit agent names, use role-based language ("dispatch a review subagent" instead of "use `reviewer`").
- Add: Example Chains — 1–2 illustrative chains using current agent names, noted as examples only.
- Remove: Capability Matrix table, Routing Shortcuts, Local-Worker Preference.

**Module: `docs/subagent-reference.md` (both locations)**

- Delete entirely. Its content (detailed per-agent guidance, example prompts) is superseded by the auto-loaded tool description and the prompt contract in `AGENTS.md`.

**Module: `docs/CONTEXT.md`**

- Update the glossary to note that agent descriptions now live in the auto-generated tool description.
- Remove any reference to `subagent-reference.md` as a living document.

**Design decisions**

- The tool description is built once at extension registration time, not on every call. Agent definitions are read and parsed once, and the resulting description string is cached. If the agents directory changes during a session, a restart is required to pick up changes — this is acceptable because agent definitions change rarely.
- The `description` field is a free-text string in YAML frontmatter. No schema enforcement beyond requiring it to be a non-empty string. Agents without descriptions are listed by name only.
- The tool description will be longer than before (~100 tokens for 9 agents). This is acceptable because it replaces a much larger capability matrix in `AGENTS.md` (~500 tokens).

### Testing Decisions

- Test `buildToolDescription()` with a mock agents directory containing agents with and without descriptions, and agents with invalid frontmatter.
- Verify the tool description includes all agent types and their descriptions.
- Verify graceful degradation when an agent definition file is missing or has no description.
- Verify the tool description is built once (cached) and not re-parsed on every invocation.
- Existing subagent tests in `index.test.ts` should continue to pass unchanged.

### Out of Scope

- Enriching agent descriptions beyond their current one-line values.
- Adding a new `avoid_for` or `use_for` frontmatter field.
- Auto-generating `AGENTS.md` from agent definitions.
- Changes to the subagent spawning, execution, or progress tracking logic.
- Changes to the plan-mode extension's subagent filtering (it already filters by agent type name).

### Further Notes

- The two copies of `AGENTS.md` and `docs/subagent-reference.md` (`~/.pi/agent/` and `dotfiles/pi/.pi/agent/`) are currently identical. Both must be updated. The dotfiles copy appears to be the source of truth.
- The `description` field is already parsed by `parseAgentDefinitionFile()` in `agent-definition-parser.ts` — no parser changes needed.
- The `listAvailableAgents()` function in `spawner.ts` already reads the agents directory to list `.md` files — `buildToolDescription()` can reuse this or follow the same pattern.
