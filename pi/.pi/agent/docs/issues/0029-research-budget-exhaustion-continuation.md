# Issue 0029: Research Budget exhaustion and continuation recommendations

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Implement hard Research Budget enforcement across the running loop, including budget-exhausted termination, best-effort Research Brief behavior, and Continuation Recommendations. Budget approvals and revisions should be auditable, and continuation should preserve prior artifacts rather than silently restarting or overwriting a valid prior brief.

User stories covered: 18, 19, 20, 21, 22, 45.

### Acceptance criteria

- [ ] Budget usage separately tracks searches, fetch attempts, successful source visits, extraction calls, synthesis calls, model calls or rounds, retries, and elapsed time
- [ ] Failed fetches consume fetch-attempt budget but not successful source-visit budget
- [ ] The orchestrator enforces hard budget limits even if the Research Brain wants to continue
- [ ] Budget exhaustion can produce a best-effort Research Brief with caveats, gaps, confidence rationale, and optional Continuation Recommendation
- [ ] Continuation requires explicit additional budget approval and records the budget revision without overwriting original approval history
- [ ] Every budget approval or revision is recorded as an append-only ledger event
- [ ] Tests cover hard-limit enforcement, early-stop acceptance, budget-exhausted brief creation, and continuation recommendation behavior

### Blocked by

- Issue 0026 — needs the minimal Research Run loop.
