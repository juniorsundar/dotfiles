# Issue 0034: Interruption, shutdown, and Manual Resume

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Make Research Runs safe across Pi shutdown, interruption, readiness failure, and explicit continuation. Active v1 runs should stop on shutdown, be marked interrupted, and never become detached orphan processes. Manual Resume should present the previous state and require approval of remaining or revised Research Budget before continuing from existing artifacts.

User stories covered: 43, 44, 45.

### Acceptance criteria

- [ ] Active running or synthesizing Research Runs are marked interrupted on Pi shutdown
- [ ] V1 does not create detached background Research Run processes
- [ ] Manual Resume supports interrupted, readiness-failed, and budget-exhausted runs
- [ ] Resume from readiness-failed state shows diagnostics and reruns readiness after approval before source work
- [ ] Resume from interrupted state shows completed Source Notes, ledger state, and budget used and remaining
- [ ] Resume from budget-exhausted state requires explicit additional budget approval and preserves prior brief versions
- [ ] Completed Research Runs are terminal in v1 and require a new Research Proposal for new facts or angles
- [ ] Tests cover shutdown marking, no detached orphan behavior, resume approval, and continuation without repeating completed Source Notes

### Blocked by

- Issue 0025 — needs approved Research Runs.
- Issue 0029 — needs budget exhaustion and continuation behavior.
- Issue 0031 — needs progress and status surfaces.
