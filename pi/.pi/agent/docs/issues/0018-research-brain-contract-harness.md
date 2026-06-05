# Issue 0018: Research Brain contract harness

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Build a minimal, repeatable diagnostic harness for the Research Brain contract before the full Research Orchestrator extension is implemented. The harness should exercise the v1 behavior the product depends on: structured research intents, Inline Thinking normalization, stop behavior, Source Note extraction when invoked by the orchestrator, evidence-grounded synthesis from supplied Source Notes, and citation discipline. The goal is to make model shortcomings visible early and give later doctor/readiness work a proven contract to productize.

User stories covered: 7, 8, 11, 12, 13, 30, 50, 60.

### Acceptance criteria

- [x] The harness can run scripted contract probes against a configurable Research Brain without creating a Research Run
- [x] The probes cover structured intents, stop behavior, Inline Thinking stripping, recoverable fenced or wrapped structured output, Source Note extraction, and evidence-grounded synthesis
- [x] Probe results distinguish pass, recoverable normalization, and hard failure states
- [x] Raw model responses are retained only as diagnostics and are never treated as Source Notes or Research Brief content
- [x] The harness emits a concise human-readable diagnostic summary with setup hints for common failures
- [x] Tests use mocked model responses and do not require live Ollama or network access

### Blocked by

None — can start immediately.
