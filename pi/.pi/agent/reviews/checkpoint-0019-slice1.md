# Checkpoint Review: Tracer bullet — Ollama Brain adapter + contract harness

## Scope
- **Changed**: settings.json, extensions/deepresearch/research-brain-harness/ollama-brain.ts, run-harness.ts, probes.ts, probe-runner.ts, types.ts, diagnostic-summary.ts
- **Tests**: probe-runner.test.ts (40 tests), diagnostic-summary.test.ts (9 tests)
- **Issue**: docs/issues/0019-evaluate-research-brain-model-options.md

## Findings

### CONCERN: `deepresearch.promptTemplate` in settings.json is never consumed by the adapter

**Severity**: CONCERN
**Location**: settings.json:22, ollama-brain.ts:5-6
**Description**: settings.json defines `"deepresearch.promptTemplate": null` but `OllamaBrain` accepts `systemPrompt` (not `promptTemplate`). The field name in settings.json and the adapter option name are semantically mismatched. If a future developer sets `promptTemplate` in settings expecting it to affect the brain's prompt, it will be silently ignored — `run-harness.ts` hardcodes the config and never reads settings.json.
**Suggestion**: Either rename `promptTemplate` → `systemPrompt` in settings.json (and document it as "overrides Modelfile SYSTEM"), or make `run-harness.ts` read settings.json so the two are bound together.

### CONCERN: `extractJson` fence regex can be tricked by prose mentioning fence syntax outside thinking blocks

**Severity**: CONCERN
**Location**: probes.ts:161-162 (extractJson)
**Description**: The first fence regex `` /```(?:json)?\s*([\s\S]*?)```/ `` uses a non-greedy match on the first triple-backtick pair. If the model outputs prose mentioning fence syntax (e.g., "I will use ```json``` markers") outside a thinking block, `extractJson` extracts the prose mention ("markers") instead of the actual fenced JSON later in the output. The existing test `"fenced-output: thinking that mentions fences before final fenced JSON -> recoverable"` covers fence-mentions-inside-thinking (which are stripped before extraction), but not fence-mentions-in-prose-outside-thinking. A real model might do this.
**Suggestion**: After the first fence extraction, validate the extracted string is parseable JSON. If not, fall through to the "last resort" JSON-object regex rather than returning invalid content.

### CONCERN: `run-harness.ts` hardcodes model/host/options instead of reading `settings.json`

**Severity**: CONCERN
**Location**: run-harness.ts:7-14
**Description**: The live harness duplicates the model/host/options values from settings.json rather than reading the config file. Any change to settings.json (new model, different host, different options) requires a manual update to run-harness.ts. This creates a drift risk between the configured Research Brain and the one actually evaluated.
**Suggestion**: Have `run-harness.ts` read `settings.json` (or accept CLI args/`.env`) so the harness always evaluates the config-specified brain.

### NOTE: `stripThinkingBlocks` does not handle nested thinking tags

**Severity**: NOTE
**Location**: probes.ts:84 (stripThinkingBlocks)
**Description**: The regex `<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>` uses non-greedy match and would break on nested thinking tags (e.g., `<thinking>outer <think>inner</think></thinking>` — it matches outer→inner, leaving orphaned `</thinking>`). This is a theoretical edge case; no current model generates nested thinking blocks. Not actionable now.
**Suggestion**: No action needed unless a model is observed generating nested thought chains.

### NOTE: `probeStructuredIntents` first-pass `JSON.parse(raw)` does not strip thinking blocks

**Severity**: NOTE
**Location**: probes.ts:18-21 (probeStructuredIntents)
**Description**: The first JSON.parse attempt is on the raw string, which fails if the model wraps JSON in thinking tags. This is by design — the second attempt calls `extractJson` which strips thinking. But it means every model that uses thinking for structured output always goes through the "recoverable" path, never "pass". The "pass" path only works for models outputting clean JSON with no thinking or fence wrapping. This is correct behavior (thinking-wrapped JSON IS recoverable, not a direct pass), but is worth documenting so expectations are clear.
**Suggestion**: Add a comment in `probeStructuredIntents` explaining the intentional fallback design.

### NOTE: `citation_number >= 1` is not validated in source-note-extraction

**Severity**: NOTE
**Location**: probes.ts:230-232
**Description**: `citation_number` is validated as an integer but not checked for being >= 1. A citation_number of 0 or -3 would pass type validation but be semantically invalid for source notes. The test suite has `"citation_number is float -> failure"` but no `"citation_number is 0 -> failure"`.
**Suggestion**: Add `note.citation_number > 0` to the validation and a corresponding test case.

## Edge Case Audit

| Edge Case | Tested? | Test Location |
|-----------|---------|---------------|
| **structured-intents** | | |
| Valid JSON with search intent → pass | YES | probe-runner.test.ts:55-61 |
| All 5 v1 intents accepted | YES | probe-runner.test.ts:63-75 |
| Gibberish response → failure | YES | probe-runner.test.ts:77-83 |
| Missing intent field → failure | YES | probe-runner.test.ts:85-91 |
| Invalid intent string → failure | YES | probe-runner.test.ts:93-99 |
| Case-insensitive matching | YES | probe-runner.test.ts:101-107 |
| Thinking + fence wrapping → recoverable | YES | probe-runner.test.ts:109-117 |
| brain.generate() rejects → graceful failure | YES | probe-runner.test.ts:119-129 |
| Empty/whitespace-only response | NO | — |
| JSON array instead of object | NO | — |
| intent = empty string `""` | NO | — |
| intent with leading/trailing whitespace | NO | — |
| **inline-thinking-stripping** | | |
| No thinking tags → pass | YES | probe-runner.test.ts:133-139 |
| Thinking tags present → recoverable | YES | probe-runner.test.ts:141-149 |
| Empty response → failure | YES | probe-runner.test.ts:151-156 |
| All content inside thinking → failure | YES | probe-runner.test.ts:158-163 |
| Unclosed thinking tag → recoverable | YES | probe-runner.test.ts:165-173 |
| Nested thinking tags | NO | — |
| Only whitespace response | NO | — |
| Case-variant tags (`<THINK>`, `<Think>`) | NO | — |
| **stop-behavior** | | |
| Valid stop_early + reasoning → pass | YES | probe-runner.test.ts:177-186 |
| stop_early without reasoning → failure | YES | probe-runner.test.ts:188-194 |
| Wrong intent → failure | YES | probe-runner.test.ts:196-203 |
| Not JSON → failure | YES | probe-runner.test.ts:205-210 |
| Empty reasoning string (whitespace) | NO | — |
| Missing intent field entirely | NO | — |
| **fenced-output-recovery** | | |
| Clean JSON without fences → pass | YES | probe-runner.test.ts:214-221 |
| JSON inside ``` fences → recoverable | YES | probe-runner.test.ts:223-230 |
| JSON in prose + fences → recoverable | YES | probe-runner.test.ts:232-240 |
| Thinking mentioning fences → recoverable | YES | probe-runner.test.ts:242-252 |
| Unrecoverable → failure | YES | probe-runner.test.ts:254-260 |
| Prose mentioning fences outside thinking | NO | — |
| Unclosed fence (no closing ```) | NO | — |
| Multiple fence blocks (first is prose, second is real) | NO | — |
| **source-note-extraction** | | |
| All required fields present → pass | YES | probe-runner.test.ts:264-275 |
| Missing url → failure | YES | probe-runner.test.ts:277-286 |
| snippets not array → failure | YES | probe-runner.test.ts:288-297 |
| citation_number is float → failure | YES | probe-runner.test.ts:299-307 |
| Empty snippets array → failure | YES | probe-runner.test.ts:309-316 |
| Not valid JSON → failure | YES | probe-runner.test.ts:318-323 |
| citation_number = 0 or negative | NO | — |
| Empty url string | NO | — |
| Empty title string | NO | — |
| Extra unknown fields | NO | — |
| **evidence-grounded-synthesis** | | |
| Valid citations [1] and [2] → pass | YES | probe-runner.test.ts:327-334 |
| Single citation → pass | YES | probe-runner.test.ts:336-343 |
| Invalid citation [5] → failure | YES | probe-runner.test.ts:345-352 |
| Zero citations → failure | YES | probe-runner.test.ts:354-361 |
| Empty response → failure | YES | probe-runner.test.ts:363-368 |
| Citation to source 0 (fencepost) | NO | — |
| Mixed valid + invalid citations | NO | — |
| Duplicate citations [1][1] | NO | — |

## Option Propagation

| Option | Entry Point | Consumer | Propagated? |
|--------|-------------|----------|-------------|
| `deepresearch.model` | settings.json:21 | run-harness.ts:7 (hardcoded) | SILENT-IGNORE — harness duplicates value, doesn't read config |
| `deepresearch.provider` | settings.json:22 | — (never read) | SILENT-IGNORE — no code references `provider` |
| `deepresearch.ollamaHost` | settings.json:23 | run-harness.ts:8 (hardcoded) | SILENT-IGNORE — harness duplicates value |
| `deepresearch.promptTemplate` | settings.json:24 | — (never read) | SILENT-IGNORE — `OllamaBrain` uses `systemPrompt`, not `promptTemplate` |
| `deepresearch.options.temperature` | settings.json:25 | run-harness.ts:10 (hardcoded) | SILENT-IGNORE — harness duplicates value |
| `deepresearch.options.num_predict` | settings.json:26 | run-harness.ts:11 (hardcoded) | SILENT-IGNORE — harness duplicates value |
| `OllamaBrainOptions.model` | run-harness.ts:7 | ollama-brain.ts:22 (constructor) | YES — stored and used in `generate()` |
| `OllamaBrainOptions.host` | run-harness.ts:8 | ollama-brain.ts:23 (constructor) | YES — stored and used in `generate()` |
| `OllamaBrainOptions.systemPrompt` | (not passed by harness) | ollama-brain.ts:20,38-39 | YES — passed through to API when set |
| `OllamaBrainOptions.options` | run-harness.ts:9-12 | ollama-brain.ts:27,36 | YES — forwarded to API request |

## Summary

- **Findings**: 3 CONCERN, 3 NOTE (0 BLOCKER)
- **Edge cases tested**: 26 / 42 (62%) — solid coverage for a tracer bullet
- **Options propagated**: 0 / 6 from settings.json to harness (all hardcoded); 4 / 4 internal `OllamaBrainOptions` propagated correctly

### Next action

This slice passes as a tracer bullet. The three CONCERN items are worth fixing before full Research Orchestrator implementation begins:

1. **settings.json ↔ harness coupling** — decide whether `run-harness.ts` should read settings.json or remain a standalone script. If standalone, document the duplication. If not, wire `run-harness.ts` to read `settings.json` directly.
2. **extractJson fence-trickling** — add parse-validation guard after first fence regex to prevent prose-fence extraction.
3. **`promptTemplate` dead field** — either use it in `OllamaBrain` or rename/remove it in settings.json.

The live harness result (3 passed, 3 recoverable, 0 failed) is valid evidence for acceptance criteria 1, 3, and 6. The 3 recoverable results directly inform criteria 4 and 5 (the HITL evaluation decision). No BLOCKER prevents proceeding to the next slice.
