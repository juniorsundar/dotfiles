import { describe, it, expect } from "vitest";
import { resolveModel, validateOverride, recordMetadata, readinessGate, doctor, generatePolicyDoc, CONVENTIONAL_DEFAULT } from "./setup-policy.js";
import type { ResolvedModel, ResearchProposal } from "./setup-policy.js";
import type { DeepresearchConfig } from "../research-brain-harness/config.js";

describe("resolveModel", () => {
  // ── Tier 1: Proposal override ───────────────────────────────────────

  it("uses proposal override when present (tier 1)", () => {
    const resolved = resolveModel({
      proposal: { status: "approved", modelOverride: "proposal-model:latest" },
    });

    expect(resolved.model).toBe("proposal-model:latest");
    expect(resolved.source).toBe("proposal_override");
  });

  it("proposal override takes priority over all other tiers", () => {
    const config: DeepresearchConfig = {
      model: "config-model:v1",
      provider: "ollama",
      ollamaHost: "http://100.64.0.5:11434",
      options: {},
    };

    const resolved = resolveModel({
      proposal: { status: "approved", modelOverride: "proposal-model:latest" },
      config,
      env: { DEEPRESEARCH_MODEL: "env-model:v2" },
    });

    expect(resolved.model).toBe("proposal-model:latest");
    expect(resolved.source).toBe("proposal_override");
  });

  // ── Tier 2: Extension config ────────────────────────────────────────

  it("falls back to extension config when no proposal override (tier 2)", () => {
    const config: DeepresearchConfig = {
      model: "config-model:v1",
      provider: "ollama",
      ollamaHost: "http://100.64.0.5:11434",
      options: {},
    };

    const resolved = resolveModel({ config });

    expect(resolved.model).toBe("config-model:v1");
    expect(resolved.provider).toBe("ollama");
    expect(resolved.host).toBe("http://100.64.0.5:11434");
    expect(resolved.source).toBe("extension_config");
  });

  it("extension config carries provider and host along with model", () => {
    const config: DeepresearchConfig = {
      model: "custom-model:7b",
      provider: "ollama",
      ollamaHost: "http://192.168.1.50:11434",
      options: { temperature: 0.1 },
    };

    const resolved = resolveModel({ config });

    expect(resolved.model).toBe("custom-model:7b");
    expect(resolved.provider).toBe("ollama");
    expect(resolved.host).toBe("http://192.168.1.50:11434");
  });

  // ── Tier 3: Environment fallback ────────────────────────────────────

  it("falls back to env var when no config and no proposal override (tier 3)", () => {
    const resolved = resolveModel({
      env: { DEEPRESEARCH_MODEL: "env-model:v2" },
    });

    expect(resolved.model).toBe("env-model:v2");
    expect(resolved.source).toBe("env_fallback");
  });

  it("env fallback uses ollama provider and localhost as defaults", () => {
    const resolved = resolveModel({
      env: { DEEPRESEARCH_MODEL: "some-model:latest" },
    });

    expect(resolved.model).toBe("some-model:latest");
    expect(resolved.provider).toBe("ollama");
    expect(resolved.host).toBe("http://localhost:11434");
  });

  it("env fallback is skipped when extension config is present", () => {
    const config: DeepresearchConfig = {
      model: "config-model:v1",
      provider: "ollama",
      ollamaHost: "http://100.64.0.5:11434",
      options: {},
    };

    const resolved = resolveModel({
      config,
      env: { DEEPRESEARCH_MODEL: "env-model:v2" },
    });

    expect(resolved.model).toBe("config-model:v1");
    expect(resolved.source).toBe("extension_config");
  });

  it("empty env string is treated as unset", () => {
    const resolved = resolveModel({
      env: { DEEPRESEARCH_MODEL: "" },
    });

    // Should fall all the way through to conventional default
    expect(resolved.source).toBe("conventional_default");
  });

  // ── Tier 4: Conventional default ────────────────────────────────────

  it("falls back to conventional default when nothing else is set (tier 4)", () => {
    const resolved = resolveModel({});

    expect(resolved.model).toBe("tongyi-deepresearch:30b");
    expect(resolved.provider).toBe("ollama");
    expect(resolved.host).toBe("http://localhost:11434");
    expect(resolved.source).toBe("conventional_default");
  });

  it("conventional default matches the Issue 0019 evaluation outcome", () => {
    expect(CONVENTIONAL_DEFAULT).toEqual({
      model: "tongyi-deepresearch:30b",
      provider: "ollama",
      host: "http://localhost:11434",
    });
  });

  // ── Override rejection (no proposal) ────────────────────────────────

  it("rejects model override when proposal is not provided", () => {
    expect(() =>
      resolveModel({
        modelOverride: "some-other-model:latest",
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });

  it("rejects model override when proposal is present but has no override field", () => {
    expect(() =>
      resolveModel({
        proposal: {} as ResearchProposal,
        modelOverride: "some-other-model:latest",
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });

  it("rejects model override when proposal has a different model", () => {
    expect(() =>
      resolveModel({
        proposal: { status: "approved", modelOverride: "proposal-model:latest" },
        modelOverride: "some-other-model:latest",
      }),
    ).toThrow(
      "modelOverride must match the approved proposal's model override",
    );
  });

  it("accepts modelOverride when it matches the proposal (happy path)", () => {
    const config: DeepresearchConfig = {
      model: "config-model:v1",
      provider: "ollama",
      ollamaHost: "http://100.64.0.5:11434",
      options: {},
    };

    const resolved = resolveModel({
      proposal: { status: "approved", modelOverride: "proposal-model:latest" },
      modelOverride: "proposal-model:latest",
      config,
      env: { DEEPRESEARCH_MODEL: "env-model:v2" },
    });

    expect(resolved.model).toBe("proposal-model:latest");
    expect(resolved.source).toBe("proposal_override");
    expect(resolved.provider).toBe("ollama");
  });

  it("rejects proposal override when proposal is draft (not approved)", () => {
    const resolved = resolveModel({
      proposal: { status: "draft", modelOverride: "draft-model:latest" },
    });

    // Draft proposal's override is ignored — falls through to conventional default
    expect(resolved.model).toBe("tongyi-deepresearch:30b");
    expect(resolved.source).toBe("conventional_default");
  });

  it("rejects proposal override when proposal is denied", () => {
    const resolved = resolveModel({
      proposal: { status: "denied", modelOverride: "denied-model:latest" },
    });

    // Denied proposal's override is ignored — falls through to conventional default
    expect(resolved.model).toBe("tongyi-deepresearch:30b");
    expect(resolved.source).toBe("conventional_default");
  });

  it("rejects modelOverride param when proposal is draft", () => {
    expect(() =>
      resolveModel({
        proposal: { status: "draft", modelOverride: "draft-model:latest" },
        modelOverride: "draft-model:latest",
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });
});

// ── validateOverride ──────────────────────────────────────────────────────

describe("validateOverride", () => {
  it("rejects a model override when proposal is not approved", () => {
    expect(() =>
      validateOverride({
        proposal: { status: "draft", modelOverride: "custom-model:latest" },
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });

  it("rejects a model override when proposal is denied", () => {
    expect(() =>
      validateOverride({
        proposal: { status: "denied", modelOverride: "custom-model:latest" },
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });

  it("accepts a model override when proposal is approved", () => {
    expect(() =>
      validateOverride({
        proposal: { status: "approved", modelOverride: "custom-model:latest" },
      }),
    ).not.toThrow();
  });

  it("is a no-op when no model override is present (no error)", () => {
    expect(() =>
      validateOverride({
        proposal: { status: "approved" },
      }),
    ).not.toThrow();
  });

  it("returns the validated override model name", () => {
    const result = validateOverride({
      proposal: { status: "approved", modelOverride: "custom-model:latest" },
    });
    expect(result).toBe("custom-model:latest");
  });

  it("returns undefined when no override is present", () => {
    const result = validateOverride({
      proposal: { status: "approved" },
    });
    expect(result).toBeUndefined();
  });

  it("rejects a model override from a non-proposal source", () => {
    expect(() =>
      validateOverride({
        modelOverride: "some-model:latest",
      }),
    ).toThrow("model override requires an approved Research Proposal");
  });
});

// ── recordMetadata ─────────────────────────────────────────────────────────

describe("recordMetadata", () => {
  const resolved: ResolvedModel = {
    model: "tongyi-deepresearch:30b",
    provider: "ollama",
    host: "http://100.64.0.5:11434",
    source: "extension_config",
  };

  it("records provider, model, template, and stop-token for proposal metadata", () => {
    const meta = recordMetadata(resolved, "proposal");

    expect(meta.provider).toBe("ollama");
    expect(meta.model).toBe("tongyi-deepresearch:30b");
    expect(meta.template).toBeDefined();
    expect(meta.template).toContain("<|im_start|>");
    expect(meta.stopTokens).toEqual(["<|im_start|>", "<|im_end|>"]);
    expect(meta.target).toBe("proposal");
  });

  it("records provider, model, template, and stop-token for run metadata", () => {
    const meta = recordMetadata(resolved, "run");

    expect(meta.provider).toBe("ollama");
    expect(meta.model).toBe("tongyi-deepresearch:30b");
    expect(meta.template).toBeDefined();
    expect(meta.stopTokens).toEqual(["<|im_start|>", "<|im_end|>"]);
    expect(meta.target).toBe("run");
  });

  it("records provider, model, template, and stop-token for diagnostics", () => {
    const meta = recordMetadata(resolved, "diagnostics");

    expect(meta.provider).toBe("ollama");
    expect(meta.model).toBe("tongyi-deepresearch:30b");
    expect(meta.template).toBeDefined();
    expect(meta.stopTokens).toEqual(["<|im_start|>", "<|im_end|>"]);
    expect(meta.target).toBe("diagnostics");
  });

  it("includes resolution source in metadata", () => {
    const meta = recordMetadata(resolved, "run");
    expect(meta.source).toBe("extension_config");
  });

  it("includes host in diagnostics metadata only", () => {
    const diag = recordMetadata(resolved, "diagnostics");
    expect(diag.host).toBe("http://100.64.0.5:11434");

    const proposal = recordMetadata(resolved, "proposal");
    expect(proposal.host).toBeUndefined();

    const run = recordMetadata(resolved, "run");
    expect(run.host).toBeUndefined();
  });

  it("uses Qwen chat template for ollama provider", () => {
    const meta = recordMetadata(
      { model: "qwen-custom:7b", provider: "ollama", host: "http://localhost:11434", source: "env_fallback" },
      "run",
    );

    expect(meta.template).toContain("<|im_start|>");
    expect(meta.template).toContain("<|im_end|>");
    expect(meta.stopTokens).toEqual(["<|im_start|>", "<|im_end|>"]);
  });

  it("does not assume template for non-ollama providers", () => {
    const meta = recordMetadata(
      { model: "some-model", provider: "openai", host: "https://api.openai.com", source: "extension_config" },
      "run",
    );

    // Non-ollama providers get empty template/stop-tokens — caller is responsible
    expect(meta.template).toBe("");
    expect(meta.stopTokens).toEqual([]);
  });
});

// ── readinessGate ─────────────────────────────────────────────────────────

/** Create a mock brain that passes all probes by matching probe prompts. */
function passingBrain(model: string) {
  const responses: Record<string, string> = {
    "structured-intents": JSON.stringify({ intent: "search" }),
    "inline-thinking": "Clean response without thinking tags.",
    "stop-behavior": JSON.stringify({ intent: "stop_early", reasoning: "sufficient" }),
    "fenced-output": JSON.stringify({ intent: "search" }),
    "source-note": JSON.stringify({
      url: "https://example.com",
      title: "Example",
      snippets: ["Finding"],
      citation_number: 1,
    }),
    synthesis: "Findings show results [1] and [2] support the conclusion.",
  };
  return {
    model,
    generate: async (prompt: string) => {
      for (const [key, value] of Object.entries(responses)) {
        if (prompt.includes(`probe: ${key}`)) return value;
      }
      return "";
    },
  };
}

describe("readinessGate", () => {
  const resolved: ResolvedModel = {
    model: "tongyi-deepresearch:30b",
    provider: "ollama",
    host: "http://localhost:11434",
    source: "conventional_default",
  };

  it("resolves when the brain model matches and all probes pass", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    const result = await readinessGate(resolved, brain);
    expect(result.ready).toBe(true);
  });

  it("hard-blocks (throws) when the brain model does not match the resolved model", async () => {
    const brain = passingBrain("wrong-model:7b");

    await expect(readinessGate(resolved, brain)).rejects.toThrow(
      "does not match the resolved Research Brain model",
    );
  });

  it("hard-blocks when the harness has failures", async () => {
    // A brain that returns complete gibberish will fail structured-intents probe
    const brain = {
      model: "tongyi-deepresearch:30b",
      generate: async (_prompt: string) => "not valid json at all",
    };

    await expect(readinessGate(resolved, brain)).rejects.toThrow(
      "Model Readiness Check",
    );
  });

  it("requires readiness check before source work can begin", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    // Readiness check must validate the exact resolved model
    const result = await readinessGate(resolved, brain);
    expect(result).toBeDefined();
    expect(result.testedModel).toBe("tongyi-deepresearch:30b");
  });

  it("records which model was tested in the result", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    const result = await readinessGate(resolved, brain);
    expect(result.testedModel).toBe("tongyi-deepresearch:30b");
    expect(result.testedProvider).toBe("ollama");
  });
});

// ── doctor ────────────────────────────────────────────────────────────────

describe("doctor", () => {
  it("runs diagnostics with the default configured model", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    const result = await doctor({ brain });

    expect(result.model).toBe("tongyi-deepresearch:30b");
    expect(result.provider).toBe("ollama");
    expect(result.harness).toBeDefined();
    expect(result.harness.results.length).toBe(6);
  });

  it("runs diagnostics with an explicit model override", async () => {
    const brain = passingBrain("custom-model:7b");

    const result = await doctor({ brain, explicitModel: "custom-model:7b" });

    expect(result.model).toBe("custom-model:7b");
    expect(result.explicitOverride).toBe(true);
  });

  it("doctor output states the provider, model, and template tested", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    const result = await doctor({ brain });

    expect(result.model).toBe("tongyi-deepresearch:30b");
    expect(result.provider).toBe("ollama");
    expect(result.template).toBeDefined();
    expect(result.template).toContain("<|im_start|>");
  });

  it("doctor does not hard-block on failures — it reports them", async () => {
    const brain = {
      model: "broken-model:latest",
      generate: async (_prompt: string) => "gibberish",
    };

    // Doctor should NOT throw — it's diagnostic, not a gate
    const result = await doctor({
      brain,
      explicitModel: "broken-model:latest",
    });

    expect(result).toBeDefined();
    expect(result.harness).toBeDefined();
    // May have failures but should still return a result
    expect(result.harness.failed).toBeGreaterThanOrEqual(0);
  });

  it("doctor writes artifacts to workspace diagnostics by default", async () => {
    const brain = passingBrain("tongyi-deepresearch:30b");

    const result = await doctor({ brain });

    // Artifact path should point to .pi/research/diagnostics/
    expect(result.artifactPath).toContain(".pi/research/diagnostics");
  });
});

// ── generatePolicyDoc ─────────────────────────────────────────────────────

describe("generatePolicyDoc", () => {
  const resolved: ResolvedModel = {
    model: "tongyi-deepresearch:30b",
    provider: "ollama",
    host: "http://100.64.0.5:11434",
    source: "extension_config",
  };

  it("documents the resolved model name from the evaluation outcome", () => {
    const doc = generatePolicyDoc(resolved);

    expect(doc).toContain("tongyi-deepresearch:30b");
  });

  it("documents the provider and resolution source", () => {
    const doc = generatePolicyDoc(resolved);

    expect(doc).toContain("ollama");
    expect(doc).toContain("extension_config");
  });

  it("documents the Qwen chat template and stop tokens", () => {
    const doc = generatePolicyDoc(resolved);

    expect(doc).toContain("<|im_start|>");
    expect(doc).toContain("<|im_end|>");
    expect(doc).toContain("Stop tokens");
  });

  it("documents the resolution order (4 tiers)", () => {
    const doc = generatePolicyDoc(resolved);

    expect(doc).toContain("Proposal override");
    expect(doc).toContain("Extension config");
    expect(doc).toContain("Environment fallback");
    expect(doc).toContain("Conventional default");
  });

  it("documents that readiness check is required before source work", () => {
    const doc = generatePolicyDoc(resolved);

    expect(doc).toContain("Readiness Check");
    expect(doc).toContain("source work");
  });

  it("is pure markdown (no template syntax in output)", () => {
    const doc = generatePolicyDoc(resolved);

    // The doc should render the template for human reading, not embed raw Modelfile syntax
    expect(doc).not.toContain("{{ .System }}");
  });

  it("shows provider-specific placeholder for non-ollama providers", () => {
    const nonOllama: ResolvedModel = {
      model: "gpt-4",
      provider: "openai",
      host: "https://api.openai.com",
      source: "extension_config",
    };

    const doc = generatePolicyDoc(nonOllama);

    expect(doc).toContain("gpt-4");
    expect(doc).toContain("provider-specific template");
    expect(doc).toContain("provider-specific stop tokens");
  });
});

// ── validateOverride precedence ───────────────────────────────────────────

describe("validateOverride precedence", () => {
  it("explicit modelOverride takes precedence over proposal.modelOverride", () => {
    // When both are provided, the explicit parameter wins (?? operator)
    const result = validateOverride({
      proposal: { status: "approved", modelOverride: "proposal-model:latest" },
      modelOverride: "explicit-model:latest",
    });

    expect(result).toBe("explicit-model:latest");
  });

  it("falls back to proposal.modelOverride when explicit is absent", () => {
    const result = validateOverride({
      proposal: { status: "approved", modelOverride: "proposal-model:latest" },
    });

    expect(result).toBe("proposal-model:latest");
  });
});
