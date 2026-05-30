# Issue 0010: Wire Agent Descriptions into Subagent Tool Description

### Parent

PRD: `docs/prd/0004-agent-description-auto-load.md`

### What to build

Modify the `subagent` tool description so it auto-loads each agent type's `description` field from its YAML frontmatter. Currently `buildToolDescription()` in `extensions/subagents/index.ts` lists bare agent type names. The change should produce a tool description like:

```
Delegate work to a subagent. Available agent types:
- scout: Fast codebase recon that returns compressed context for handoff
- worker: Bounded implementation with clear scope and validation
- ...
```

The `description` field is already parsed by `parseAgentDefinitionFile()` in `agent-definition-parser.ts` — no parser changes needed. `listAvailableAgents()` in `spawner.ts` already reads the agents directory. The tool description is built once at extension registration time and cached.

### Acceptance criteria

- [x] `buildToolDescription()` iterates agent definitions and extracts their `description` field
- [x] The tool description includes a bullet list of agent types with their descriptions
- [x] Agents without a `description` field are listed by name only (graceful degradation)
- [x] Agents with invalid or missing definition files are handled without crashing
- [x] The tool description is built once at registration, not re-parsed on every call
- [x] Existing subagent tests in `index.test.ts` continue to pass

### Blocked by

None — can start immediately.
