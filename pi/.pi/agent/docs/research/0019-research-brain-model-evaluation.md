# Issue 0019: Research Brain model evaluation

Date: 2026-06-06

## Config tested

Configured Research Brain from `settings.json`:

- Provider: `ollama`
- Model: `tongyi-deepresearch:30b`
- Host: `http://100.64.0.5:11434`
- Options: `temperature=0.1`, `num_predict=4096`
- System override: none in settings; model uses Modelfile `SYSTEM`

## Modelfile findings

### Known-bad setup

Initial Tongyi Modelfile used a bare prompt template:

```text
TEMPLATE """{{ .Prompt }}"""
```

Observed behavior:

- Modelfile `SYSTEM` was not injected into prompts.
- The model behaved like raw continuation instead of instruction-following chat.
- Simple JSON probes caused prompt echoing, hallucinated example tasks, or runaway completions.
- This setup is **not acceptable** as a v1 Research Brain configuration.

### Known-good setup

Updated Modelfile uses Qwen chat formatting and explicit stop tokens:

```text
TEMPLATE """{{ if .System }}<|im_start|>system
{{ .System }}<|im_end|>
{{ end }}<|im_start|>user
{{ .Prompt }}<|im_end|>
<|im_start|>assistant
"""

PARAMETER stop "<|im_start|>"
PARAMETER stop "<|im_end|>"
```

The Modelfile `SYSTEM` also includes the Research Brain contract guidance:

- structured intents must use one of `search`, `select_sources`, `update_findings`, `synthesize_brief`, `stop_early`
- JSON responses must contain valid JSON matching requested fields
- `stop_early` requires a non-empty `reasoning` field
- supplied source-note citations must use only supplied source numbers
- internal thinking should remain brief and final output must satisfy the contract

## Contract harness result

Command:

```bash
npx tsx extensions/deepresearch/research-brain-harness/run-harness.ts
```

Latest result after Modelfile and harness-normalizer fixes:

```text
Research Brain Contract Harness — Diagnostic Summary

  ⚠ structured-intents: recoverable — Valid intent after normalization: stop_early
  ⚠ inline-thinking-stripping: recoverable — Malformed or unclosed thinking tags detected in output; content is partially recoverable
  ✓ stop-behavior: pass — Valid stop_early with reasoning
  ⚠ fenced-output-recovery: recoverable — JSON recovered from markdown fence wrapping
  ✓ source-note-extraction: pass — Valid source note
  ✓ evidence-grounded-synthesis: pass — Synthesis with 2 valid citation(s): [1, 2]

Results: 3 passed, 3 recoverable, 0 failed (6 total)
```

## Behavior matrix

| Capability | Result | Notes |
|---|---:|---|
| Structured intents | Recoverable | Produces valid intent JSON after `<think>...</think>` stripping. In ambiguous probe, chose `stop_early` with reasoning, which is allowed by the contract. |
| Inline Thinking normalization | Recoverable | Model emits `<think>` reasoning and may also emit requested `<thinking>` tags in final content. Normal artifacts must strip thinking and preserve raw responses only in diagnostics. |
| Stop behavior | Pass | Produces `stop_early` with non-empty reasoning. |
| Fenced/wrapped structured output | Recoverable | Produces valid fenced JSON; parser must strip thinking and select the last parseable fenced JSON block. |
| Source Note extraction | Pass | Produces required `url`, `title`, `snippets`, and positive integer `citation_number`. |
| Evidence-grounded synthesis | Pass | Produces citations to supplied source numbers. |

## Recommendation

Use `tongyi-deepresearch:30b` as the v1 Research Brain **only with the known-good Qwen chat Modelfile template, stop tokens, and Research Brain contract SYSTEM guidance above**.

## Required setup steps

1. Serve `tongyi-deepresearch:30b` through Ollama.
2. Use the Qwen `<|im_start|>` / `<|im_end|>` Modelfile template.
3. Set `PARAMETER stop` for both `<|im_start|>` and `<|im_end|>`.
4. Include the Research Brain contract guidance in the Modelfile `SYSTEM`.
5. Configure Pi `settings.json`:

```json
"deepresearch": {
  "model": "tongyi-deepresearch:30b",
  "provider": "ollama",
  "ollamaHost": "http://100.64.0.5:11434",
  "systemPrompt": null,
  "options": {
    "temperature": 0.1,
    "num_predict": 4096
  }
}
```

6. Run the harness before enabling a Research Run:

```bash
npx tsx extensions/deepresearch/research-brain-harness/run-harness.ts
```

## Risks and guardrails

- **Recoverable structured output is expected**: v1 must normalize `<think>...</think>` blocks and fenced JSON before parsing.
- **Raw model responses are diagnostics only**: raw output must not become Source Notes or Research Brief content.
- **Readiness must hard-block on failures**: any hard failure in structured intents, stop behavior, Source Note extraction, or citation-grounded synthesis should produce `readiness_failed` and block Research Runs.
- **Template drift is high risk**: reverting to bare `{{ .Prompt }}` or omitting stop tokens should be treated as known-bad setup.
- **Model ambiguity remains**: ambiguous structured-intent prompts may choose `stop_early`; orchestrator prompts should include concrete run context and allowed intent semantics.

## Alternative evaluation decision

No alternative model was required by the acceptance criteria because the configured Tongyi setup produced **0 hard failures** after Modelfile correction and harness normalization. The known-bad alternative configuration (`{{ .Prompt }}` template) was evaluated and rejected.

If future regressions introduce hard failures, evaluate `qwen3.6:35b` first because it is the closest available Qwen-family alternative on the same Ollama host, then `gemma4:31b` as a different-family fallback.
