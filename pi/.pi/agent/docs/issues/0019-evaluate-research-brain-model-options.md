# Issue 0019: Evaluate Research Brain model options

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: HITL.

Use the Research Brain contract harness to evaluate the current Tongyi/Ollama setup and any plausible model alternatives before committing to the full extension. This slice is intentionally human-in-the-loop because it requires running local models, interpreting live failures, tuning model/template/stop-token settings, and deciding whether Tongyi DeepResearch remains the v1 Research Brain or whether the default setup needs to change.

User stories covered: 7, 8, 9, 10, 11, 12, 13, 60.

### Acceptance criteria

- [x] The current Tongyi/Ollama setup is run through the contract harness and results are recorded
- [x] At least one alternative configuration or model option is evaluated if Tongyi fails hard contract probes
- [x] The evaluation identifies known-good or known-bad prompt template, stop-token, and structured-output behavior
- [x] The selected v1 Research Brain recommendation is documented with risks and required setup steps
- [x] Any unresolved model limitations are explicitly mapped to readiness failures or product guardrails
- [x] No full Research Orchestrator implementation work depends on unverified live model assumptions

Evaluation artifact: `docs/research/0019-research-brain-model-evaluation.md`

### Blocked by

- Issue 0018 — needs the Research Brain contract harness.
