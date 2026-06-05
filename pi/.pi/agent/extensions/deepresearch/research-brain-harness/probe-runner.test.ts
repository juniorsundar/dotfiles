import { describe, it, expect } from "vitest";
import { runHarness } from "./probe-runner.js";
import type { ResearchBrain } from "./types.js";

// Mock brain that returns canned responses
class MockBrain implements ResearchBrain {
  constructor(
    private responses: Record<string, string> = {},
  ) {}
  async generate(prompt: string): Promise<string> {
    for (const [key, value] of Object.entries(this.responses)) {
      if (prompt.includes(`probe: ${key}`)) return value;
    }
    return "";
  }
}

/** Build a thinking tag pair that survives angle-bracket stripping in file writes. */
const thinkingTag = (content: string): string =>
  `${String.fromCharCode(60)}thinking${String.fromCharCode(62)}${content}${String.fromCharCode(60)}/thinking${String.fromCharCode(62)}`;

describe("runHarness", () => {
  // ── Harness-level ─────────────────────────────────────────────────────

  it("accepts a ResearchBrain via dependency injection (no Research Run)", async () => {
    const brain = new MockBrain();
    const result = await runHarness(brain);
    expect(result).toBeDefined();
    expect(result.results).toBeInstanceOf(Array);
  });

  it("completes without Ollama connection or network access", async () => {
    const brain = new MockBrain();
    const result = await runHarness(brain);
    expect(result).toBeDefined();
  });

  it("includes diagnostics array with raw responses", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    expect(result.diagnostics).toBeInstanceOf(Array);
    expect(result.diagnostics.length).toBeGreaterThan(0);
  });

  it("returns counts: passed, recoverable, failed", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    expect(result.passed).toBeGreaterThanOrEqual(0);
    expect(result.recoverable).toBeGreaterThanOrEqual(0);
    expect(result.failed).toBeGreaterThanOrEqual(0);
    expect(result.passed + result.recoverable + result.failed).toBe(
      result.results.length,
    );
  });

  it("returns summary string containing probe names", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe("string");
    expect(result.summary).toContain("structured-intents");
  });

  it("one failing probe does not prevent other probes from running", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    expect(result.results.length).toBe(6);
    const si = result.results.find((r) => r.probe === "structured-intents");
    expect(si!.status).toBe("pass");
  });

  // ── structured-intents ────────────────────────────────────────────────

  it("structured-intents: valid JSON with search intent -> pass", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe).toBeDefined();
    expect(probe!.status).toBe("pass");
  });

  it("structured-intents: all 5 v1 intents are accepted", async () => {
    for (const intent of [
      "search",
      "select_sources",
      "update_findings",
      "synthesize_brief",
      "stop_early",
    ]) {
      const brain = new MockBrain({
        "structured-intents": JSON.stringify({ intent }),
      });
      const result = await runHarness(brain);
      const probe = result.results.find(
        (r) => r.probe === "structured-intents",
      );
      expect(probe!.status).toBe("pass");
    }
  });

  it("structured-intents: malformed response (gibberish) -> failure", async () => {
    const brain = new MockBrain({
      "structured-intents": "not valid json at all just some text",
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe).toBeDefined();
    expect(probe!.status).toBe("failure");
  });

  it("structured-intents: valid JSON with missing intent field -> failure", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ foo: "bar" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe).toBeDefined();
    expect(probe!.status).toBe("failure");
  });

  it("structured-intents: valid JSON with invalid intent string -> failure", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "not_a_valid_intent" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe).toBeDefined();
    expect(probe!.status).toBe("failure");
  });

  it("structured-intents: case-insensitive intent matching", async () => {
    const brain = new MockBrain({
      "structured-intents": JSON.stringify({ intent: "SEARCH" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe!.status).toBe("pass");
  });

  it("structured-intents: valid intent after thinking and fence wrapping -> recoverable", async () => {
    const brain = new MockBrain({
      "structured-intents": `${String.fromCharCode(60)}think${String.fromCharCode(62)}Choosing a valid intent.${String.fromCharCode(60)}/think${String.fromCharCode(62)}\n\n\`\`\`json\n${JSON.stringify({ intent: "search" })}\n\`\`\``,
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe!.status).toBe("recoverable");
  });

  it("structured-intents: brain.generate() rejects -> graceful failure", async () => {
    const brain = new MockBrain();
    brain.generate = async () => {
      throw new Error("model unreachable");
    };
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "structured-intents");
    expect(probe).toBeDefined();
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("unreachable");
  });

  // -- 3a: inline-thinking-stripping ------------------------------------

  it("inline-thinking: no thinking tags -> pass", async () => {
    const brain = new MockBrain({
      "inline-thinking": "This is a clean response without any thinking tags.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "inline-thinking-stripping",
    );
    expect(probe!.status).toBe("pass");
  });

  it("inline-thinking: thinking tags present -> recoverable (stripped)", async () => {
    const brain = new MockBrain({
      "inline-thinking": `${thinkingTag("Let me think about this...")}Here is the answer.`,
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "inline-thinking-stripping",
    );
    expect(probe!.status).toBe("recoverable");
    expect(probe!.detail).toContain("stripped");
  });

  it("inline-thinking: empty response -> failure", async () => {
    const brain = new MockBrain({ "inline-thinking": "" });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "inline-thinking-stripping",
    );
    expect(probe!.status).toBe("failure");
  });

  it("inline-thinking: all content inside thinking tags -> failure", async () => {
    const brain = new MockBrain({
      "inline-thinking": thinkingTag("Only thinking here, no real content."),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "inline-thinking-stripping",
    );
    expect(probe!.status).toBe("failure");
  });

  it("inline-thinking: unclosed thinking tag -> recoverable", async () => {
    // Truncated output: opening tag but no closing tag
    const brain = new MockBrain({
      "inline-thinking": `${String.fromCharCode(60)}thinkingUnclosed tag content. Here is the real answer.`,
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "inline-thinking-stripping",
    );
    expect(probe!.status).toBe("recoverable");
    expect(probe!.detail).toContain("Malformed");
  });

  // -- 3b: stop-behavior ------------------------------------------------

  it("stop-behavior: valid stop_early with reasoning -> pass", async () => {
    const brain = new MockBrain({
      "stop-behavior": JSON.stringify({
        intent: "stop_early",
        reasoning: "Sufficient evidence gathered",
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "stop-behavior");
    expect(probe!.status).toBe("pass");
  });

  it("stop-behavior: stop_early without reasoning -> failure", async () => {
    const brain = new MockBrain({
      "stop-behavior": JSON.stringify({ intent: "stop_early" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "stop-behavior");
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("reasoning");
  });

  it("stop-behavior: wrong intent -> failure", async () => {
    const brain = new MockBrain({
      "stop-behavior": JSON.stringify({
        intent: "search",
        reasoning: "looking for things",
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "stop-behavior");
    expect(probe!.status).toBe("failure");
  });

  it("stop-behavior: not JSON -> failure", async () => {
    const brain = new MockBrain({
      "stop-behavior": "I think we should stop now because we have enough.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find((r) => r.probe === "stop-behavior");
    expect(probe!.status).toBe("failure");
  });

  // -- 3c: fenced-output-recovery ---------------------------------------

  it("fenced-output: clean JSON without fences -> pass", async () => {
    const brain = new MockBrain({
      "fenced-output": JSON.stringify({ intent: "search" }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("pass");
  });

  it("fenced-output: JSON inside fences -> recoverable", async () => {
    const brain = new MockBrain({
      "fenced-output": '```json\n{"intent": "search"}\n```',
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("recoverable");
    expect(probe!.detail).toContain("fence");
  });

  it("fenced-output: JSON wrapped in prose with fences -> recoverable", async () => {
    const brain = new MockBrain({
      "fenced-output":
        'Here is the response:\n\n```json\n{"intent": "search"}\n```\n\nHope that helps.',
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("recoverable");
  });

  it("fenced-output: thinking that mentions fences before final fenced JSON -> recoverable", async () => {
    const brain = new MockBrain({
      "fenced-output": `${String.fromCharCode(60)}think${String.fromCharCode(62)}The output should use \`\`\`json ... \`\`\` fences.${String.fromCharCode(60)}/think${String.fromCharCode(62)}\n\n\`\`\`json\n${JSON.stringify({ intent: "search" })}\n\`\`\``,
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("recoverable");
  });

  it("fenced-output: prose that mentions fences before final fenced JSON -> recoverable", async () => {
    const brain = new MockBrain({
      "fenced-output": `I will use \`\`\`json ... \`\`\` fences.\n\n\`\`\`json\n${JSON.stringify({ intent: "search" })}\n\`\`\``,
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("recoverable");
  });

  it("fenced-output: unrecoverable response -> failure", async () => {
    const brain = new MockBrain({
      "fenced-output": "Just some random text with no JSON at all anywhere.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "fenced-output-recovery",
    );
    expect(probe!.status).toBe("failure");
  });

  // -- 3d: source-note-extraction ---------------------------------------

  it("source-note: all required fields present -> pass", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        url: "https://example.com/research",
        title: "Example Research",
        snippets: ["Finding 1", "Finding 2"],
        citation_number: 1,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("pass");
  });

  it("source-note: missing url -> failure", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        title: "Example",
        snippets: ["Finding"],
        citation_number: 1,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("url");
  });

  it("source-note: snippets is not an array -> failure", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        url: "https://example.com",
        title: "Example",
        snippets: "not an array",
        citation_number: 1,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("snippets");
  });

  it("source-note: citation_number is float -> failure", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        url: "https://example.com",
        title: "Example",
        snippets: ["Finding"],
        citation_number: 2.5,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("positive integer");
  });

  it("source-note: citation_number is zero -> failure", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        url: "https://example.com",
        title: "Example",
        snippets: ["Finding"],
        citation_number: 0,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("positive integer");
  });

  it("source-note: empty snippets array -> failure", async () => {
    const brain = new MockBrain({
      "source-note": JSON.stringify({
        url: "https://example.com",
        title: "Example",
        snippets: [],
        citation_number: 1,
      }),
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("snippets");
  });

  it("source-note: not valid JSON -> failure", async () => {
    const brain = new MockBrain({
      "source-note": "The source note should contain a URL and title.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "source-note-extraction",
    );
    expect(probe!.status).toBe("failure");
  });

  // -- 3e: evidence-grounded-synthesis ----------------------------------

  it("synthesis: valid citations to source 1 and 2 -> pass", async () => {
    const brain = new MockBrain({
      synthesis:
        "Cats are mammals [1], while dogs are canines [2]. Both are common pets.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "evidence-grounded-synthesis",
    );
    expect(probe!.status).toBe("pass");
  });

  it("synthesis: single citation -> pass", async () => {
    const brain = new MockBrain({
      synthesis:
        "Research shows cats are mammals (Source 1). Further study needed.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "evidence-grounded-synthesis",
    );
    expect(probe!.status).toBe("pass");
  });

  it("synthesis: invalid citation to source 5 -> failure", async () => {
    const brain = new MockBrain({
      synthesis: "Dogs are canines [5]. This is well established.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "evidence-grounded-synthesis",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("non-existent");
  });

  it("synthesis: zero citations -> failure", async () => {
    const brain = new MockBrain({
      synthesis:
        "Pets are animals that people keep for companionship. They include cats and dogs.",
    });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "evidence-grounded-synthesis",
    );
    expect(probe!.status).toBe("failure");
    expect(probe!.detail).toContain("No citations");
  });

  it("synthesis: empty response -> failure", async () => {
    const brain = new MockBrain({ synthesis: "" });
    const result = await runHarness(brain);
    const probe = result.results.find(
      (r) => r.probe === "evidence-grounded-synthesis",
    );
    expect(probe!.status).toBe("failure");
  });

  // -- C4: Raw response isolation ---------------------------------------

  it("raw model responses never appear in ProbeResult detail as Source Note content", async () => {
    const brain = new MockBrain({
      "inline-thinking": `${thinkingTag("secret thought")}Clean output here.`,
      "structured-intents": JSON.stringify({ intent: "search" }),
      "stop-behavior": JSON.stringify({
        intent: "stop_early",
        reasoning: "done",
      }),
      "fenced-output": '```json\n{"intent": "search"}\n```',
      "source-note": JSON.stringify({
        url: "https://x.com",
        title: "X",
        snippets: ["a"],
        citation_number: 1,
      }),
      synthesis: "Pets are animals [1].",
    });
    const result = await runHarness(brain);
    // Raw responses should be in diagnostics
    expect(result.diagnostics.some((d) => d.includes("secret thought"))).toBe(
      true,
    );
    // Summary should NOT contain raw thinking content
    expect(result.summary).not.toContain("secret thought");
    // Probe details should not contain raw thinking
    for (const r of result.results) {
      expect(r.detail).not.toContain("secret thought");
    }
  });
});
