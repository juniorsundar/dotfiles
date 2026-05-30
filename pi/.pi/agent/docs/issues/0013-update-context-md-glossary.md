# Issue 0013: Update CONTEXT.md Glossary

### Parent

PRD: `docs/prd/0004-agent-description-auto-load.md`

### What to build

Update `docs/CONTEXT.md` to reflect the new architecture:

- Remove any reference to `subagent-reference.md` as a living document
- Add or update a note that agent descriptions now live in the auto-generated `subagent` tool description (sourced from YAML frontmatter in `agents/*.md`)
- Ensure the glossary remains accurate after the AGENTS.md and subagent-reference.md changes

### Acceptance criteria

- [ ] `CONTEXT.md` contains no references to `subagent-reference.md` as a current document
- [ ] The glossary notes that agent descriptions are auto-loaded from agent definitions into the tool description
- [ ] All existing glossary entries remain accurate after the refactor

### Blocked by

- Issue 0012 — the reference doc must be deleted before the glossary is updated to reflect its absence.
