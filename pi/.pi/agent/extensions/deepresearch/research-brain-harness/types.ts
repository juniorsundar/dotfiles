/** The 5 v1 Research Brain intents. */
export const VALID_INTENTS = [
  "search",
  "select_sources",
  "update_findings",
  "synthesize_brief",
  "stop_early",
] as const;

export type ResearchIntent = (typeof VALID_INTENTS)[number];

export interface StructuredIntent {
  intent: ResearchIntent;
  reasoning?: string;
}

/** The Research Brain model — a single generate() method, trivially mockable. */
export interface ResearchBrain {
  generate(prompt: string): Promise<string>;
}

export type ProbeStatus = "pass" | "recoverable" | "failure";

export interface ProbeResult {
  status: ProbeStatus;
  probe: string;
  detail: string;
}

export interface HarnessResult {
  results: ProbeResult[];
  summary: string;
  diagnostics: string[];
  passed: number;
  recoverable: number;
  failed: number;
}
