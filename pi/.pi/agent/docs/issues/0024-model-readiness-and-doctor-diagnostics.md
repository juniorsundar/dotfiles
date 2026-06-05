# Issue 0024: Model Readiness Check and doctor diagnostics

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Productize the Research Brain contract harness as v1 readiness behavior. The Research Orchestrator should run a quick reachability check before normal approvable proposal creation, run a full Model Readiness Check after approval and before source work, and expose a standalone doctor command for setup diagnostics. Readiness failures must hard-block Research Runs rather than producing misleading research artifacts.

User stories covered: 7, 8, 9, 10, 11, 12, 13.

### Acceptance criteria

- [ ] Quick reachability runs before creating or showing a normal approvable Research Proposal
- [ ] Quick reachability failures produce setup-blocked guidance and may write Workspace Diagnostics without creating a proposal or run
- [ ] Full readiness runs after approval and before source work using the exact resolved Research Brain model
- [ ] Full readiness failures leave a stable readiness-failed Research Run artifact with Run Diagnostics
- [ ] Doctor diagnostics can run on demand without creating a Research Run
- [ ] Inline Thinking and malformed structured output are normalized or rejected according to the setup policy
- [ ] Tests use mocked model responses for pass, recoverable, and hard-failure cases

### Blocked by

- Issue 0020 — needs the Research Brain setup policy.
- Issue 0021 — needs the Research Orchestrator extension skeleton.
