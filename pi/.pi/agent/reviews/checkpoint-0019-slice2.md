# Checkpoint Review: Config drift + fence parser robustness (Slice 2.6)

## Scope
- **Changed**: settings.json, extensions/deepresearch/research-brain-harness/config.ts, config.test.ts, run-harness.ts, probes.ts, probe-runner.test.ts
- **Tests**: config.test.ts (1 test), probe-runner.test.ts (41 tests), diagnostic-summary.test.ts (9 tests) — 51 total, all green
- **Issue**: docs/issues/0019-evaluate-research-brain-model-options.md

## Findings

### CONCERN: `loadDeepresearchConfig` has no edge-case unit tests

**Severity**: CONCERN
**Location**: config.test.ts:6-37
**Description**: The only config test exercises the happy path (all fields present, `systemPrompt: null` → `undefined`). The following runtime paths are all untested: missing `deepresearch` key → throws; empty model string → throws; missing provider → defaults to `"ollama"`; missing `ollamaHost` → defaults to `http://localhost:11434`; `systemPrompt` as a real string → returned as-is; missing `options` → defaults to `{}`; `options` as non-object → defaults to `{}`; settings file not found → ENOENT propagates. The config loader is the single source of truth for the harness; uncovered edge cases here could yield silent misconfiguration.
**Suggestion**: Add at least 4 tests: missing model → throws; missing provider → defaults to ollama; missing ollamaHost → defaults to localhost; systemPrompt string → returned verbatim.

### CONCERN: `citation_number >= 1` still not validated in source-note probe

**Severity**: CONCERN
**Location**: probes.ts:193-200
**Description**: Previous slice flagged this: `citation_number` is validated as an integer but not checked for being ≥ 1. A value of `0` or `-3` passes the type gate but is semantically invalid. No test covers `citation_number = 0`.
**Suggestion**: Add `note.citation_number > 0` to the validation gate and a corresponding test case.

### CONCERN: `run-harness.ts` has no test for `provider !== "ollama"` rejection

**Severity**: CONCERN
**Location**: run-harness.ts:15-18
**Description**: The harness refuses non-ollama providers with a throw. This is correct now but untested — if a future developer removes or weakens this check, nothing catches the regression.
**Suggestion**: Add a unit test in config.test.ts that exercises provider-rejection, or abstract the provider-validation into a standalone testable function.

### NOTE: `extractJson` afterFence fallback can return trailing prose

**Severity**: NOTE
**Location**: probes.ts:143-145
**Description**: After iterating backwards through all fenced blocks (none parseable), `extractJson` checks for content after the last closing fence. If a fenced block exists but is unparseable, this returns trailing prose instead of actual JSON elsewhere. Caller handles `JSON.parse` failure gracefully (returns "failure"), so no crash — but function contract is technically violated. Very narrow edge case.
**Suggestion**: No action unless a real model exhibits this pattern. The fallback chain (direct JSON, last-resort JSON object regex) usually catches the real JSON.

### NOTE: Config module lives in harness directory — future extension may need shared loader

**Severity**: NOTE
**Location**: config.ts:1-5
**Description**: `loadDeepresearchConfig` lives in `research-brain-harness/config.ts`. If the main extension needs the same config, it would import from the harness (cross-package dependency into a test tool) or duplicate the logic.
**Suggestion**: Tag for extension-implementation slice: promote config.ts to a shared module (e.g., `extensions/deepresearch/shared/config.ts`).

## Previous Slice Resolutions

| Previous CONCERN (Slice 1) | Status | Evidence |
|---|---|---|
| `promptTemplate` dead field → rename to `systemPrompt` | ✓ RESOLVED | settings.json line 24 renamed; config.ts reads `systemPrompt` |
| `extractJson` fence regex tricked by prose → add parse guard | ✓ RESOLVED | `extractJson` iterates backwards through all fenced blocks, tries `JSON.parse` on each candidate |
| `run-harness.ts` hardcodes values → read settings.json | ✓ RESOLVED | `run-harness.ts` calls `loadDeepresearchConfig()`; supports `PI_SETTINGS_PATH` override |

## Edge Case Audit

| Edge Case | Tested? | Test Location |
|-----------|---------|---------------|
| **config loading** | | |
| Happy path (all fields, null systemPrompt → undefined) | YES | config.test.ts:13-37 |
| Missing `deepresearch` key → throws | NO | — |
| Empty model string → throws | NO | — |
| Missing provider → defaults to "ollama" | NO | — |
| Missing ollamaHost → defaults to localhost | NO | — |
| systemPrompt as string → returned verbatim | NO | — |
| Missing options → defaults to {} | NO | — |
| File not found → ENOENT error | NO | — |
| **fenced-output (regression: prose before fenced JSON)** | | |
| Prose mentioning fences before final fenced JSON → recoverable | **YES — NEW** | probe-runner.test.ts:242-252 |
| Prose mentioning fences outside thinking + non-JSON first fence + parseable later fence | YES | Same test (backwards iteration exercises this) |
| **pre-existing untested edge cases** | | |
| citation_number = 0 or negative (source-note) | NO | — |
| Unclosed fence (no closing ```) | NO | — |
| Mixed valid + invalid citations (synthesis) | NO | — |
| Citation to source 0 (synthesis) | NO | — |

## Option Propagation

All 6 `deepresearch.*` options now propagate from `settings.json` → `loadDeepresearchConfig` → `run-harness.ts` → `OllamaBrain` → Ollama API.

| Option | Entry Point | Consumer | Propagated? |
|--------|-------------|----------|-------------|
| `deepresearch.model` | settings.json:21 | OllamaBrain.model → `/api/generate` body | ✓ YES |
| `deepresearch.provider` | settings.json:22 | run-harness.ts provider gate | ✓ YES (validation only) |
| `deepresearch.ollamaHost` | settings.json:23 | OllamaBrain.host → fetch URL | ✓ YES |
| `deepresearch.systemPrompt` | settings.json:24 | OllamaBrain.systemPrompt → `request.system` | ✓ YES (undefined = skip) |
| `deepresearch.options.*` | settings.json:25-26 | OllamaBrain.options → `request.options` | ✓ YES |

All previous "SILENT-IGNORE" entries are now correctly wired. No remaining option-drift concerns.

## Summary

- **Findings**: 0 BLOCKER, 3 CONCERN, 2 NOTE (plus 2 pre-existing CONCERN items resolved)
- **Edge cases tested**: 2 / 11 config edge cases (18%); 1 fenced-output regression test added; 0 / 5 pre-existing untested source-note edges covered
- **Options propagated**: 6 / 6 (100% — all previous drift resolved)
- **Tests**: 51 passed (3 files), 1 new test added for the prose-fence regression

### Verdict

**Slice passes for the defined scope.** All three previous CONCERN items are resolved. The config wiring is correct end-to-end: `settings.json` → `loadDeepresearchConfig` → `run-harness.ts` → `OllamaBrain` → Ollama API. The `extractJson` backwards-iteration fix is sound and regression-tested. No architectural regressions introduced.

### Next action

Fix the config loader test gap **before or during the next slice** (it's the single source of truth for harness configuration — untested edge cases could cause silent misconfiguration during live model evaluation). The `citation_number >= 1` validation is a low-risk pre-existing gap but worth fixing alongside source-note work if touched again. Proceed to slice 2.7 or HITL model evaluation.
