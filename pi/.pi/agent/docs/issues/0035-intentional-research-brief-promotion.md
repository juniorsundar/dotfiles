# Issue 0035: Intentional Research Brief promotion

### Parent

PRD: `docs/prd/0005-pi-native-deep-research.md`

ADR: `docs/adr/0002-pi-native-research-orchestrator.md`

### What to build

Type: AFK.

Add minimal human-only promotion for Research Briefs that should become shared project documentation. Research artifacts remain local scratch by default; promotion should create a shareable package that preserves enough citation metadata and evidence snippets for auditability without promoting raw diagnostics, raw model responses, or full fetched content by default. Agents may recommend promotion but must not perform it.

User stories covered: 16, 17.

### Acceptance criteria

- [ ] Promotion is available only through a human command and not through the `deepresearch` agent tool
- [ ] Promotion is allowed for completed and budget-exhausted Research Briefs
- [ ] Promoted budget-exhausted briefs preserve best-effort status, caveats, gaps, confidence rationale, and continuation recommendation when present
- [ ] Promotion writes only inside the active workspace by default and refuses unsafe destinations
- [ ] Promotion creates parent directories as needed, avoids overwriting existing files unless explicitly forced, and prints all written paths
- [ ] The promoted package includes the Research Brief plus source-reference metadata and snippets needed to audit claims
- [ ] Raw diagnostics, raw model responses, and full raw fetched content are not promoted by default
- [ ] Tests cover safe path handling, overwrite refusal, budget-exhausted labeling, and agent-tool refusal

### Blocked by

- Issue 0030 — needs citation-validated Research Briefs.
- Issue 0032 — needs Human Research View rendering.
