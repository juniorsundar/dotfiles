import type { DeepresearchConfig } from "../research-brain-harness/config.js";
import type { ResearchBrain, HarnessResult } from "../research-brain-harness/types.js";
import { runHarness } from "../research-brain-harness/probe-runner.js";

// ── Types ──────────────────────────────────────────────────────────────────

export interface ResolvedModel {
  model: string;
  provider: string;
  host: string;
  /** Which tier resolved the model. */
  source:
    | "proposal_override"
    | "extension_config"
    | "env_fallback"
    | "conventional_default";
}

export interface ResolveModelInput {
  /** Optional approved proposal with a possible model override. */
  proposal?: ResearchProposal;
  /** Extension config from settings.json deepresearch block. */
  config?: DeepresearchConfig;
  /** Environment variables (injected for testability). */
  env?: Record<string, string | undefined>;
  /**
   * Explicit model override. Must be validated against proposal first.
   * Rejected if proposal is absent or doesn't carry this override.
   */
  modelOverride?: string;
}

// ── Conventional default (Issue 0019 evaluation outcome) ───────────────────

export const CONVENTIONAL_DEFAULT: Omit<ResolvedModel, "source"> = {
  model: "tongyi-deepresearch:30b",
  provider: "ollama",
  host: "http://localhost:11434",
};

export interface ResearchProposal {
  status: "draft" | "approved" | "denied";
  modelOverride?: string;
}

export interface ValidateOverrideInput {
  proposal?: ResearchProposal;
  /** Explicit model override from a non-proposal source. */
  modelOverride?: string;
}

/**
 * Validate that a run-specific model override originates from an approved
 * Research Proposal. Returns the validated override model name, or undefined
 * if no override is present.
 *
 * Throws if a model override is supplied without an approved proposal.
 */
export function validateOverride(
  input: ValidateOverrideInput = {},
): string | undefined {
  const { proposal, modelOverride } = input;
  const override = modelOverride ?? proposal?.modelOverride;

  if (override === undefined) {
    return undefined;
  }

  if (!proposal || proposal.status !== "approved") {
    throw new Error("model override requires an approved Research Proposal");
  }

  return override;
}

// ── Metadata recording ────────────────────────────────────────────────────

export type MetadataTarget = "proposal" | "run" | "diagnostics";

export interface ModelMetadata {
  provider: string;
  model: string;
  template: string;
  stopTokens: string[];
  source: string;
  target: MetadataTarget;
  /** Host included only for diagnostics target. */
  host?: string;
}

/** Known-good template and stop tokens for Ollama Qwen-family models. */
const OLLAMA_QWEN_TEMPLATE = [
  "{{ if .System }}<|im_start|>system",
  "{{ .System }}<|im_end|>",
  "{{ end }}<|im_start|>user",
  "{{ .Prompt }}<|im_end|>",
  "<|im_start|>assistant",
].join("\n");

const OLLAMA_QWEN_STOP_TOKENS = ["<|im_start|>", "<|im_end|>"];

/**
 * Record provider, model, prompt/template, and stop-token settings as
 * metadata for a given target (proposal, run, or diagnostics).
 *
 * For ollama providers, the known-good Qwen chat template and stop tokens
 * from the Issue 0019 evaluation are recorded automatically.
 * For non-ollama providers, template and stop-tokens are left empty — the
 * caller is expected to supply provider-specific settings.
 */
export function recordMetadata(
  resolved: ResolvedModel,
  target: MetadataTarget,
): ModelMetadata {
  const isOllama = resolved.provider === "ollama";

  const meta: ModelMetadata = {
    provider: resolved.provider,
    model: resolved.model,
    template: isOllama ? OLLAMA_QWEN_TEMPLATE : "",
    stopTokens: isOllama ? [...OLLAMA_QWEN_STOP_TOKENS] : [],
    source: resolved.source,
    target,
  };

  if (target === "diagnostics") {
    meta.host = resolved.host;
  }

  return meta;
}

// ── Readiness gate ────────────────────────────────────────────────────────

export interface BrainWithModel extends ResearchBrain {
  model: string;
}

export interface ReadinessResult {
  ready: boolean;
  testedModel: string;
  testedProvider: string;
  harness: HarnessResult;
}

/**
 * Run the full Model Readiness Check against the exact resolved model.
 * Must be called immediately before source work begins.
 *
 * Hard-blocks (throws) if:
 * - The brain's model does not match the resolved model
 * - Any probe failure is detected
 */
export async function readinessGate(
  resolved: ResolvedModel,
  brain: BrainWithModel,
): Promise<ReadinessResult> {
  if (brain.model !== resolved.model) {
    throw new Error(
      `Brain model '${brain.model}' does not match the resolved Research Brain model '${resolved.model}'. ` +
        "The full Model Readiness Check must test the exact resolved model immediately before source work begins.",
    );
  }

  const harness = await runHarness(brain);

  if (harness.failed > 0) {
    throw new Error(
      `Model Readiness Check failed: ${harness.failed} probe(s) failed. ` +
        `See diagnostics for details.`,
    );
  }

  return {
    ready: true,
    testedModel: resolved.model,
    testedProvider: resolved.provider,
    harness,
  };
}

// ── Doctor ────────────────────────────────────────────────────────────────

export interface DoctorInput {
  /** The brain to test. */
  brain: BrainWithModel;
  /** Optional explicit model override being checked. */
  explicitModel?: string;
  /** Override artifact path for testing. */
  artifactPath?: string;
}

export interface DoctorResult {
  model: string;
  provider: string;
  template: string;
  explicitOverride: boolean;
  harness: HarnessResult;
  artifactPath: string;
}

/**
 * Run diagnostics on demand without creating a Research Run.
 * Supports default model checks and explicit model override checks.
 * Unlike readinessGate, doctor does NOT hard-block on failures — it reports them.
 */
export async function doctor(input: DoctorInput): Promise<DoctorResult> {
  const { brain, explicitModel, artifactPath } = input;

  const harness = await runHarness(brain);

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = explicitModel
    ? `doctor-override-${ts}`
    : `doctor-default-${ts}`;

  return {
    model: explicitModel ?? brain.model,
    provider: "ollama",
    template: OLLAMA_QWEN_TEMPLATE,
    explicitOverride: explicitModel !== undefined,
    harness,
    artifactPath:
      artifactPath ?? `.pi/research/diagnostics/${slug}.json`,
  };
}

// ── Policy documentation ──────────────────────────────────────────────────

/**
 * Generate a setup policy document reflecting the resolved model configuration.
 * The output is human-readable markdown suitable for extension documentation.
 */
export function generatePolicyDoc(resolved: ResolvedModel): string {
  const templateDesc = resolved.provider === "ollama"
    ? "Qwen chat template with `<|im_start|>` / `<|im_end|>` delimiters"
    : "(provider-specific template)";

  const stopTokensDesc = resolved.provider === "ollama"
    ? "`<|im_start|>`, `<|im_end|>`"
    : "(provider-specific stop tokens)";

  return [
    `# Research Brain Setup Policy`,
    ``,
    `> Generated from Issue 0019 live model evaluation.`,
    ``,
    `## Resolved Model`,
    ``,
    `- **Model**: \`${resolved.model}\``,
    `- **Provider**: ${resolved.provider}`,
    `- **Host**: ${resolved.host}`,
    `- **Source**: ${resolved.source}`,
    ``,
    `## Model Resolution Order`,
    ``,
    `1. **Proposal override** — model specified in an approved Research Proposal`,
    `2. **Extension config** — \`deepresearch.model\` in \`settings.json\``,
    `3. **Environment fallback** — \`DEEPRESEARCH_MODEL\` environment variable`,
    `4. **Conventional default** — \`tongyi-deepresearch:30b\` on Ollama at \`localhost:11434\``,
    ``,
    `## Template & Stop Tokens`,
    ``,
    `- **Template**: ${templateDesc}`,
    `- **Stop tokens**: ${stopTokensDesc}`,
    ``,
    `## Readiness Check`,
    ``,
    `The full Model Readiness Check must test the exact resolved model`,
    `immediately before source work begins. Hard failures block Research Runs.`,
    `Use \`/research doctor\` for on-demand diagnostics.`,
    ``,
    `## Run-Specific Overrides`,
    ``,
    `Model overrides are allowed only when present in an approved Research`,
    `Proposal. Overrides from unapproved proposals or non-proposal sources`,
    `are rejected.`,
  ].join("\n");
}

/**
 * Resolve the Research Brain model following the 4-tier order:
 *   1. Proposal override (approved Research Proposal only)
 *   2. Extension config (settings.json deepresearch block)
 *   3. Environment fallback (DEEPRESEARCH_MODEL)
 *   4. Conventional default (tongyi-deepresearch:30b on ollama)
 *
 * Throws if modelOverride is supplied without matching proposal approval.
 */
export function resolveModel(input: ResolveModelInput = {}): ResolvedModel {
  const { proposal, config, env, modelOverride } = input;

  // Validate modelOverride against proposal
  if (modelOverride !== undefined) {
    if (!proposal || proposal.modelOverride === undefined) {
      throw new Error("model override requires an approved Research Proposal");
    }
    if (proposal.status !== "approved") {
      throw new Error("model override requires an approved Research Proposal");
    }
    if (proposal.modelOverride !== modelOverride) {
      throw new Error(
        "modelOverride must match the approved proposal's model override",
      );
    }
  }

  // Tier 1: Proposal override
  if (proposal?.modelOverride && proposal.status === "approved") {
    const effectiveOverride = modelOverride ?? proposal.modelOverride;
    return {
      model: effectiveOverride,
      provider: config?.provider ?? "ollama",
      host: config?.ollamaHost ?? "http://localhost:11434",
      source: "proposal_override",
    };
  }

  // Tier 2: Extension config
  if (config?.model && config.model.trim().length > 0) {
    return {
      model: config.model,
      provider: config.provider ?? "ollama",
      host: config.ollamaHost ?? "http://localhost:11434",
      source: "extension_config",
    };
  }

  // Tier 3: Environment fallback
  const envModel = env?.DEEPRESEARCH_MODEL?.trim();
  if (envModel && envModel.length > 0) {
    return {
      model: envModel,
      provider: "ollama",
      host: "http://localhost:11434",
      source: "env_fallback",
    };
  }

  // Tier 4: Conventional default
  return {
    ...CONVENTIONAL_DEFAULT,
    source: "conventional_default",
  };
}
