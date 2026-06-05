import { describe, it, expect } from "vitest";
import { buildSummary } from "./diagnostic-summary.js";
import type { ProbeResult } from "./types.js";

describe("buildSummary", () => {
  it("returns a human-readable string (not raw JSON)", () => {
    const results: ProbeResult[] = [
      { status: "pass", probe: "structured-intents", detail: "Valid intent" },
    ];
    const summary = buildSummary(results);
    expect(typeof summary).toBe("string");
    // Should NOT be parseable as JSON (it's a formatted string)
    expect(() => JSON.parse(summary)).toThrow();
  });

  it("includes all three status icons (pass, recoverable, failure)", () => {
    const results: ProbeResult[] = [
      { status: "pass", probe: "probe-a", detail: "ok" },
      { status: "recoverable", probe: "probe-b", detail: "normalized" },
      { status: "failure", probe: "probe-c", detail: "broken" },
    ];
    const summary = buildSummary(results);
    expect(summary).toContain("✓");
    expect(summary).toContain("⚠");
    expect(summary).toContain("✗");
  });

  it("includes count summary line", () => {
    const results: ProbeResult[] = [
      { status: "pass", probe: "a", detail: "ok" },
      { status: "pass", probe: "b", detail: "ok" },
      { status: "recoverable", probe: "c", detail: "normalized" },
      { status: "failure", probe: "d", detail: "broken" },
    ];
    const summary = buildSummary(results);
    expect(summary).toContain("2 passed, 1 recoverable, 1 failed (4 total)");
  });

  it("includes setup hints for failure entries", () => {
    const results: ProbeResult[] = [
      { status: "failure", probe: "structured-intents", detail: "bad json" },
    ];
    const summary = buildSummary(results);
    expect(summary).toContain("Setup hints for failures:");
    expect(summary).toContain("structured-intents");
    expect(summary).toContain("JSON formatting");
  });

  it("does NOT include setup hints section when no failures", () => {
    const results: ProbeResult[] = [
      { status: "pass", probe: "a", detail: "ok" },
    ];
    const summary = buildSummary(results);
    expect(summary).not.toContain("Setup hints");
  });

  it("includes all probe names in the summary", () => {
    const results: ProbeResult[] = [
      { status: "pass", probe: "structured-intents", detail: "ok" },
      { status: "pass", probe: "inline-thinking-stripping", detail: "ok" },
      { status: "pass", probe: "stop-behavior", detail: "ok" },
      { status: "pass", probe: "fenced-output-recovery", detail: "ok" },
      { status: "pass", probe: "source-note-extraction", detail: "ok" },
      { status: "pass", probe: "evidence-grounded-synthesis", detail: "ok" },
    ];
    const summary = buildSummary(results);
    expect(summary).toContain("structured-intents");
    expect(summary).toContain("inline-thinking-stripping");
    expect(summary).toContain("stop-behavior");
    expect(summary).toContain("fenced-output-recovery");
    expect(summary).toContain("source-note-extraction");
    expect(summary).toContain("evidence-grounded-synthesis");
  });

  it("is concise (under 2000 chars for 6 probes)", () => {
    const results: ProbeResult[] = [
      {
        status: "pass",
        probe: "structured-intents",
        detail: "Valid intent: search with reasoning about the research plan",
      },
      {
        status: "recoverable",
        probe: "inline-thinking-stripping",
        detail:
          "Inline thinking detected and successfully stripped from output",
      },
      {
        status: "pass",
        probe: "stop-behavior",
        detail: "Valid stop_early with clear reasoning about evidence sufficiency",
      },
      {
        status: "recoverable",
        probe: "fenced-output-recovery",
        detail: "JSON recovered from markdown code fence wrapping",
      },
      {
        status: "pass",
        probe: "source-note-extraction",
        detail:
          "Valid source note with url, title, 2 snippets, and citation number",
      },
      {
        status: "pass",
        probe: "evidence-grounded-synthesis",
        detail: "Synthesis with 2 valid citations to source notes [1, 2]",
      },
    ];
    const summary = buildSummary(results);
    expect(summary.length).toBeLessThan(2000);
  });

  it("handles empty results array", () => {
    const summary = buildSummary([]);
    expect(typeof summary).toBe("string");
    expect(summary.length).toBeGreaterThan(0);
    expect(summary).toContain("0 passed");
  });

  it("every known probe has a failure hint", () => {
    const allProbes = [
      "structured-intents",
      "inline-thinking-stripping",
      "stop-behavior",
      "fenced-output-recovery",
      "source-note-extraction",
      "evidence-grounded-synthesis",
    ];
    for (const probe of allProbes) {
      const results: ProbeResult[] = [
        { status: "failure", probe, detail: "test" },
      ];
      const summary = buildSummary(results);
      expect(summary).toContain(probe);
      // Should NOT use the generic fallback
      expect(summary).not.toContain(
        `No specific hint available for this probe.`,
      );
    }
  });
});
