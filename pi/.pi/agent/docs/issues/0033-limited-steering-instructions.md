# Issue 0033: Limited Steering Instructions

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Support the v1 Steering Instruction surface without turning a Research Run into an unrestricted second chat. Users should be able to cancel, force synthesis after the current step, or add a narrowing/prioritizing/excluding instruction within the approved Research Question. Steering must be recorded in the ledger and reflected in the Research Brief when it materially affects coverage, confidence, or termination.

User stories covered: 40.

### Acceptance criteria

- [ ] Cancel stops the run without producing a Research Brief, preserves artifacts, and records reason and final status
- [ ] Force synthesis is refused when no Source Notes exist
- [ ] Force synthesis with partial evidence can produce a caveated forced-synthesis Research Brief
- [ ] Added instructions may narrow, prioritize, exclude, or clarify within the approved Research Question
- [ ] Added instructions cannot broaden scope, add a substantially new comparison axis, or require a new Evidence Mix without continuation or a new Research Proposal
- [ ] Every Steering Instruction appends a ledger event with timestamp, instruction type, budget state, applied/rejected/deferred status, and application details
- [ ] Tests cover cancel, force synthesis refusal, forced-synthesis brief caveats, accepted instructions, and rejected scope expansion

### Blocked by

- Issue 0026 — needs the minimal Research Run loop.
- Issue 0030 — needs citation-validated Research Briefs.
