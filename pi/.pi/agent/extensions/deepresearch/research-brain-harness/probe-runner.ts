import type { ResearchBrain, HarnessResult, ProbeResult } from "./types.js";
import {
  probeStructuredIntents,
  probeInlineThinkingStripping,
  probeStopBehavior,
  probeFencedOutputRecovery,
  probeSourceNoteExtraction,
  probeEvidenceGroundedSynthesis,
} from "./probes.js";
import { buildSummary } from "./diagnostic-summary.js";

/** All probe functions. */
type ProbeFn = (
  brain: ResearchBrain,
  diagnostics: string[],
) => Promise<ProbeResult>;

const ALL_PROBES: ProbeFn[] = [
  probeStructuredIntents,
  probeInlineThinkingStripping,
  probeStopBehavior,
  probeFencedOutputRecovery,
  probeSourceNoteExtraction,
  probeEvidenceGroundedSynthesis,
];

/**
 * Run all contract probes against a Research Brain and return a diagnostic result.
 * Does NOT create a Research Run — purely diagnostic.
 */
export async function runHarness(brain: ResearchBrain): Promise<HarnessResult> {
  const diagnostics: string[] = [];
  const results: ProbeResult[] = [];

  for (const probeFn of ALL_PROBES) {
    try {
      const result = await probeFn(brain, diagnostics);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      diagnostics.push(`[harness] probe threw: ${message}`);
      results.push({
        status: "failure",
        probe: "unknown",
        detail: `Probe threw unhandled exception: ${message}`,
      });
    }
  }

  let passed = 0;
  let recoverable = 0;
  let failed = 0;
  for (const r of results) {
    if (r.status === "pass") passed++;
    else if (r.status === "recoverable") recoverable++;
    else failed++;
  }

  const summary = buildSummary(results);

  return { results, summary, diagnostics, passed, recoverable, failed };
}
