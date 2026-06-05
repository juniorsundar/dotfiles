# Issue 0025: Approve proposals into queued Research Runs

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Turn approved Research Proposals into Research Runs with lifecycle state, budget state, evidence mix state, and stable artifacts. Approval should create the run only after proposal validation and readiness gating, then place the run in queued or active execution according to the one-active-run v1 constraint. Queued runs must not consume research budget until they are about to become active.

User stories covered: 6, 14, 15, 18, 20, 41, 42.

### Acceptance criteria

- [ ] Approval creates a Research Run with readable date, slug, and short-id identity
- [ ] Approved proposal content is carried into the Research Run as the human-readable approved request
- [ ] Run status records lifecycle state, trigger, blocking/background mode, timestamps, and resume metadata
- [ ] The one-active-run constraint treats only running and synthesizing runs as active
- [ ] Additional approved runs become queued or request user action when another run is active
- [ ] Queued runs do not consume search, source, model-call, or elapsed-time research budget
- [ ] Tests cover immediate activation, queued activation, and readiness-failed transition

### Blocked by

- Issue 0022 — needs editable Research Proposals.
- Issue 0024 — needs readiness checks and diagnostics.
