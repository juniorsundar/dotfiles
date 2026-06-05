# Issue 0030: Citation-validated Research Briefs

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Render Research Briefs that are useful to both the user and coding agent while remaining source-grounded. Briefs should separate evidence from interpretation, include bottom line and confidence rationale, report tradeoffs, caveats, gaps, and Evidence Mix coverage, and validate that every numbered citation references an existing Source Note. Invalid citation drafts should be repaired within budget or rejected rather than emitted as the current brief.

User stories covered: 30, 31, 32, 33, 34, 49.

### Acceptance criteria

- [ ] Research Briefs include bottom line, confidence, evidence, interpretation, tradeoffs, caveats, source list, gaps, and optional continuation recommendation
- [ ] Briefs include implications for Pi or the current task only when agent-triggered or task-triggered
- [ ] Factual claims must be supported by Source Notes, not search snippets or candidate metadata alone
- [ ] Numbered citations in the brief validate against existing Source Notes
- [ ] Invalid citations trigger bounded repair or retry within approved synthesis or model-call budget
- [ ] Invalid-citation drafts are never emitted as the current Research Brief
- [ ] Tests cover required sections, evidence-versus-interpretation separation, confidence rationale, citation validation, and invalid-citation failure behavior

### Blocked by

- Issue 0027 — needs Evidence Mix and Negative Evidence state.
- Issue 0028 — needs robust Source Notes.
- Issue 0029 — needs budget exhaustion and continuation behavior.
