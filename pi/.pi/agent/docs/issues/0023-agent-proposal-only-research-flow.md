# Issue 0023: Agent proposal-only research flow

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Constrain the `deepresearch` agent tool so agents can request Research Proposals but cannot silently approve, start, resume, cancel, force synthesis, or steer a Research Run. Agent-triggered proposals must require a valid Research Trigger and should refuse routine lookup, local-codebase-only exploration, or curiosity-only searches with guidance toward normal tools.

User stories covered: 5, 46, 47, 48.

### Acceptance criteria

- [ ] The `deepresearch` tool supports proposal creation without starting a Research Run
- [ ] Agent-triggered proposal creation requires a valid Research Trigger
- [ ] Routine lookup, local-codebase-only exploration, and curiosity-only requests are refused with clear guidance
- [ ] The tool cannot approve, deny, start, resume, cancel, force synthesis, or add Steering Instructions
- [ ] Human approval is required before any agent-triggered proposal becomes a Research Run
- [ ] Tests verify allowed and forbidden agent actions

### Blocked by

- Issue 0022 — needs editable Research Proposals.
