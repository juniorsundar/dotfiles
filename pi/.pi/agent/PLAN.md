# Plan: Issue 0020 — Lock Research Brain setup policy
> Status: complete

## Decisions

- **Module location**: `extensions/deepresearch/setup-policy/setup-policy.ts`
- **Testing**: vitest, 50 tests, MockBrain pattern from probe-runner.test.ts
- **Conventional default**: `tongyi-deepresearch:30b` on `ollama` at `localhost:11434` (Issue 0019 evaluation)

## Results

### Files changed
- `extensions/deepresearch/setup-policy/setup-policy.ts` — new, ~295 lines
- `extensions/deepresearch/setup-policy/setup-policy.test.ts` — new, ~530 lines, 50 tests

### Exports
| Export | Purpose |
|---|---|
| `resolveModel()` | 4-tier model resolution (proposal → config → env → default) |
| `validateOverride()` | Rejects overrides from unapproved/non-proposal sources |
| `recordMetadata()` | Records provider/model/template/stop-token for proposal/run/diagnostics |
| `readinessGate()` | Wraps harness, hard-blocks on model mismatch or failures |
| `doctor()` | On-demand diagnostics, reports failures without hard-blocking |
| `generatePolicyDoc()` | Markdown policy doc reflecting Issue 0019 outcome |

### Acceptance criteria coverage
- [x] Model resolution order (proposal override → ext config → env → default)
- [x] Run-specific overrides only via approved proposals
- [x] Provider/model/template/stop-token in proposal, run, diagnostics metadata
- [x] Full Model Readiness Check required before source work
- [x] Doctor behavior for default + explicit override checks
- [x] Policy documentation reflects Issue 0019 evaluation outcome

### Tests: 347 total (50 new + 297 existing)
