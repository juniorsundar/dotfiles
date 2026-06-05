import type { ProbeResult } from "./types.js";

/** Setup hints for common failure patterns. */
const FAILURE_HINTS: Record<string, string> = {
  "structured-intents": "Check that the model supports JSON formatting. Try a prompt that explicitly requests JSON output.",
  "inline-thinking-stripping": "The model is emitting thinking tags but no usable content. Check model configuration for thinking/tool-use settings.",
  "stop-behavior": "The model did not emit a stop_early signal or failed to include reasoning. Verify the model supports structured intents.",
  "fenced-output-recovery": "The model output was not parseable as JSON even after fence extraction. Try requesting plain JSON without markdown formatting.",
  "source-note-extraction": "The model failed to extract required source note fields (url, title, snippets, citation_number). Check that the model can follow structured extraction prompts.",
  "evidence-grounded-synthesis": "The model produced a synthesis without valid citations. Prompt the model to cite sources by number e.g. [1], [2].",
};

const STATUS_ICONS: Record<string, string> = {
  pass: "✓",
  recoverable: "⚠",
  failure: "✗",
};

/**
 * Build a concise human-readable diagnostic summary from probe results.
 * Includes setup hints for any probes that failed.
 */
export function buildSummary(results: ProbeResult[]): string {
  const lines: string[] = [
    "Research Brain Contract Harness — Diagnostic Summary",
    "",
  ];

  // Per-probe results
  for (const r of results) {
    const icon = STATUS_ICONS[r.status] ?? "?";
    lines.push(`  ${icon} ${r.probe}: ${r.status} — ${r.detail}`);
  }

  // Count summary
  const passed = results.filter((r) => r.status === "pass").length;
  const recoverable = results.filter((r) => r.status === "recoverable").length;
  const failed = results.filter((r) => r.status === "failure").length;

  lines.push("");
  lines.push(
    `Results: ${passed} passed, ${recoverable} recoverable, ${failed} failed (${results.length} total)`,
  );

  // Setup hints for failures
  const failedProbes = results.filter((r) => r.status === "failure");
  if (failedProbes.length > 0) {
    lines.push("");
    lines.push("Setup hints for failures:");
    for (const r of failedProbes) {
      const hint = FAILURE_HINTS[r.probe] ?? "No specific hint available for this probe.";
      lines.push(`  • ${r.probe}: ${hint}`);
    }
  }

  return lines.join("\n");
}
