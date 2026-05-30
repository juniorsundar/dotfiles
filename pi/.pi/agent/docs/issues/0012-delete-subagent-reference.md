# Issue 0012: Delete subagent-reference.md

### Parent

PRD: `docs/prd/0004-agent-description-auto-load.md`

### What to build

Delete `docs/subagent-reference.md` from both `~/.pi/agent/docs/` and `dotfiles/pi/.pi/agent/docs/`. This file contains detailed per-agent guidance, example prompts, and routing details that are now superseded by the auto-loaded tool description and the prompt contract in `AGENTS.md`.

### Acceptance criteria

- [ ] `docs/subagent-reference.md` is deleted from `~/.pi/agent/docs/`
- [ ] `docs/subagent-reference.md` is deleted from `dotfiles/pi/.pi/agent/docs/`
- [ ] No other files reference `subagent-reference.md` as a living document

### Blocked by

- Issue 0011 — AGENTS.md must be self-sufficient before the reference doc is deleted.
