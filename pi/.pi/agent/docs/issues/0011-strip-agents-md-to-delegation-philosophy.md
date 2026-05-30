# Issue 0011: Strip AGENTS.md to Delegation Philosophy

### Parent

PRD: `docs/prd/0004-agent-description-auto-load.md`

### What to build

Rewrite `AGENTS.md` (both `~/.pi/agent/AGENTS.md` and `dotfiles/pi/.pi/agent/AGENTS.md`) to contain only delegation philosophy. Remove all agent-specific reference material that is now auto-loaded by the tool description.

**Keep:**
- Core Rule — coordinator owns user intent, judgment, planning, synthesis, edits, validation, final reporting
- Delegate When Useful — generalised directives (no agent names) about when to consider subagents
- Risk Controls — generalised language ("dispatch a review subagent" not "use `reviewer`")
- Prompt Contract — the spawning template (already uses `<agent_type>` placeholders)

**Add:**
- Example Chains — 1–2 illustrative delegation chains using current agent names, noted as examples only

**Remove:**
- Capability Matrix table (Use for / Avoid for / Expected result)
- Routing Shortcuts (cheap → local-worker, repo recon → scout, etc.)
- Local-Worker Preference section

### Acceptance criteria

- [ ] `AGENTS.md` contains no agent-specific capability matrix or routing table
- [ ] Risk controls use role-based language, not specific agent names
- [ ] Example chains are present with agent names, noted as illustrative
- [ ] Prompt contract template is preserved unchanged
- [ ] Both copies (`~/.pi/agent/` and `dotfiles/pi/.pi/agent/`) are updated identically
- [ ] The file is noticeably shorter than before

### Blocked by

- Issue 0010 — the tool description must provide agent descriptions before the matrix is removed.
