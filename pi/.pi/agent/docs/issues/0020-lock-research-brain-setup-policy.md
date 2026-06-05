# Issue 0020: Lock Research Brain setup policy

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK after HITL model selection.

Turn the selected model evaluation outcome into a stable setup policy for the extension. Define how the Research Brain model is resolved, how proposal overrides are approved, what provider/model/template metadata must be recorded, and which readiness failures hard-block Research Runs. This gives implementation agents a fixed contract before they build proposal approval, doctor diagnostics, and run execution.

User stories covered: 3, 7, 8, 9, 10, 11, 12, 13.

### Acceptance criteria

- [x] The model resolution order is specified as proposal override, extension configuration, environment fallback, then documented conventional default
- [x] Run-specific model overrides are allowed only when present in an approved Research Proposal
- [x] Provider, model, prompt/template, and stop-token settings are recorded in proposal metadata, run metadata, and diagnostics
- [x] The full Model Readiness Check is required to test the exact resolved model immediately before source work begins
- [x] Doctor behavior is defined for default model checks and explicit model override checks
- [x] Setup policy documentation reflects the selected model outcome from the live evaluation slice

### Blocked by

- Issue 0019 — needs the model evaluation decision.
