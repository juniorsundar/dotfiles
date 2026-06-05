# Issue 0032: Human Research View rendering

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Generate a self-contained Human Research View from canonical Markdown and JSON-family Research Run artifacts. Human-initiated completed or budget-exhausted runs should automatically produce the view; agent-triggered runs should render it only on demand. Pi should print the view path instead of opening a browser, and incomplete or stale/failed continuation states should be clearly labeled or refused according to the status policy.

User stories covered: 35, 36, 37.

### Acceptance criteria

- [ ] The Human Research View is derived from canonical Research Brief and run state artifacts, not maintained as canonical state
- [ ] The view is self-contained and does not depend on external assets
- [ ] Human-initiated completed and budget-exhausted runs automatically generate a view
- [ ] Agent-triggered runs can render a view on demand only for statuses that intentionally represent a readable brief
- [ ] Budget-exhausted views clearly show best-effort status, caveats, gaps, and continuation recommendation when present
- [ ] Failed runs with previous brief metadata are refused by normal render paths unless explicit human inspection is requested
- [ ] Tests verify status labels, warnings, source links, budget and coverage summaries, stale or best-effort banners, and no external assets

### Blocked by

- Issue 0030 — needs citation-validated Research Briefs.
