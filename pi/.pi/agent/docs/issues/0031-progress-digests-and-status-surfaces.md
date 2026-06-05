# Issue 0031: Progress Digests and status surfaces

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Expose compact, user-facing progress and status without flooding the main conversation. A running Research Run should emit Progress Digests with budget usage, Evidence Mix coverage, current signal, gaps, next step, and artifact pointers. The human command and `deepresearch` tool should provide status-oriented access without exposing raw model working memory or allowing forbidden agent actions.

User stories covered: 38, 39, 42, 50.

### Acceptance criteria

- [ ] Progress Digests are compact, human-readable, and distinct from model-facing Run Summaries
- [ ] Progress Digests show budget usage, Evidence Mix coverage, current signal, unresolved gaps, next step, and artifact pointers
- [ ] Status output reports proposal and Research Run lifecycle states, active or queued status, interruption state, and relevant artifact pointers
- [ ] The `deepresearch` status action cannot mutate runs or reveal raw diagnostics as normal research output
- [ ] Background Research Runs surface Progress Digests without blocking unrelated conversation
- [ ] Tests cover digest rendering, status rendering, queued and active states, and separation from Run Summary content

### Blocked by

- Issue 0026 — needs the minimal Research Run loop.
