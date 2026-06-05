import type { ProbeResult, ResearchBrain } from "./types.js";
import { VALID_INTENTS } from "./types.js";

// ── 1: Structured intents ────────────────────────────────────────────────

export async function probeStructuredIntents(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt = "probe: structured-intents — return JSON with an intent field";

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[structured-intents] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[structured-intents] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "structured-intents",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return validateStructuredIntent(parsed, "pass");
  } catch {
    // Not direct JSON — try recoverable normalization.
  }

  try {
    const extracted = extractJson(raw);
    const parsed: unknown = JSON.parse(extracted);
    return validateStructuredIntent(parsed, "recoverable");
  } catch {
    return {
      status: "failure",
      probe: "structured-intents",
      detail: `Failed to parse JSON. Raw: ${raw.slice(0, 100)}`,
    };
  }
}

// ── 3a: Inline Thinking stripping ──────────────────────────────────────────

export async function probeInlineThinkingStripping(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt =
    "probe: inline-thinking — respond with thinking tags wrapping your reasoning, then output a clean response outside the tags";

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[inline-thinking] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[inline-thinking] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "inline-thinking-stripping",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  const stripped = stripInlineThinking(raw);

  // Check for residual malformed thinking tags (unclosed, truncated)
  const hasResidualTags = /<think(?:ing)?/gi.test(stripped);

  if (stripped === raw && !hasResidualTags) {
    // No thinking tags present — clean output
    if (raw.trim().length === 0) {
      return {
        status: "failure",
        probe: "inline-thinking-stripping",
        detail: "Brain returned empty response",
      };
    }
    return {
      status: "pass",
      probe: "inline-thinking-stripping",
      detail: "No inline thinking present; output clean",
    };
  }

  if (stripped.trim().length === 0) {
    return {
      status: "failure",
      probe: "inline-thinking-stripping",
      detail:
        "All content was inside thinking tags; no usable output after stripping",
    };
  }

  if (hasResidualTags) {
    return {
      status: "recoverable",
      probe: "inline-thinking-stripping",
      detail:
        "Malformed or unclosed thinking tags detected in output; content is partially recoverable",
    };
  }

  return {
    status: "recoverable",
    probe: "inline-thinking-stripping",
    detail:
      "Inline thinking detected and stripped; normalized output recovered",
  };
}

/** Strip inline thinking tags and their contents. */
function stripInlineThinking(text: string): string {
  return stripThinkingBlocks(text);
}

function stripThinkingBlocks(text: string): string {
  return text
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, "")
    .trim();
}

function validateStructuredIntent(
  parsed: unknown,
  status: "pass" | "recoverable",
): ProbeResult {
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "intent" in parsed &&
    typeof (parsed as { intent: string }).intent === "string" &&
    VALID_INTENTS.includes(
      (parsed as { intent: string }).intent.toLowerCase() as typeof VALID_INTENTS[number],
    )
  ) {
    return {
      status,
      probe: "structured-intents",
      detail:
        status === "recoverable"
          ? `Valid intent after normalization: ${(parsed as { intent: string }).intent}`
          : `Valid intent: ${(parsed as { intent: string }).intent}`,
    };
  }
  return {
    status: "failure",
    probe: "structured-intents",
    detail: `JSON parsed but missing or invalid 'intent' field. Got: ${JSON.stringify(parsed)}`,
  };
}

// ── 3b: Stop behavior ─────────────────────────────────────────────────────

export async function probeStopBehavior(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt =
    'probe: stop-behavior — return JSON with intent "stop_early" and a reasoning field explaining why you would stop';

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[stop-behavior] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[stop-behavior] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "stop-behavior",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  try {
    const parsed: unknown = JSON.parse(extractJson(raw));
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "intent" in parsed &&
      typeof (parsed as { intent: string }).intent === "string" &&
      (parsed as { intent: string }).intent.toLowerCase() === "stop_early"
    ) {
      const hasReasoning =
        "reasoning" in parsed &&
        typeof (parsed as { reasoning?: string }).reasoning === "string" &&
        (parsed as { reasoning: string }).reasoning.trim().length > 0;

      if (!hasReasoning) {
        return {
          status: "failure",
          probe: "stop-behavior",
          detail: "stop_early intent present but missing reasoning field",
        };
      }

      return {
        status: "pass",
        probe: "stop-behavior",
        detail: `Valid stop_early with reasoning: ${(parsed as { reasoning: string }).reasoning.slice(0, 60)}`,
      };
    }
    return {
      status: "failure",
      probe: "stop-behavior",
      detail: `Expected intent "stop_early". Got: ${JSON.stringify(parsed)}`,
    };
  } catch {
    return {
      status: "failure",
      probe: "stop-behavior",
      detail: `Failed to parse JSON from response: ${raw.slice(0, 100)}`,
    };
  }
}

// ── 3c: Fenced output recovery ────────────────────────────────────────────

export async function probeFencedOutputRecovery(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt =
    'probe: fenced-output — return JSON with intent "search" but wrap it in a markdown code fence (```json ... ```)';

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[fenced-output] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[fenced-output] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "fenced-output-recovery",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  // First try direct JSON parse
  try {
    JSON.parse(raw.trim());
    // It's clean JSON without fences — technically still passes
    return {
      status: "pass",
      probe: "fenced-output-recovery",
      detail: "Clean JSON returned without fence wrapping",
    };
  } catch {
    // Not direct JSON — try extracting from fences
  }

  try {
    const extracted = extractJson(raw);
    const parsed: unknown = JSON.parse(extracted);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "intent" in parsed &&
      typeof (parsed as { intent: string }).intent === "string"
    ) {
      const wasFenced =
        raw.includes("```") && raw !== extracted && extracted !== raw.trim();
      return {
        status: wasFenced ? "recoverable" : "pass",
        probe: "fenced-output-recovery",
        detail: wasFenced
          ? "JSON recovered from markdown fence wrapping (recoverable normalization)"
          : `Valid JSON with intent: ${(parsed as { intent: string }).intent}`,
      };
    }
    return {
      status: "failure",
      probe: "fenced-output-recovery",
      detail: `Extracted JSON but missing 'intent' field: ${extracted.slice(0, 60)}`,
    };
  } catch {
    return {
      status: "failure",
      probe: "fenced-output-recovery",
      detail: `Unable to recover JSON from response: ${raw.slice(0, 100)}`,
    };
  }
}

// ── 3d: Source Note extraction ────────────────────────────────────────────

const REQUIRED_SOURCE_NOTE_FIELDS = [
  "url",
  "title",
  "snippets",
  "citation_number",
] as const;

export async function probeSourceNoteExtraction(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt =
    "probe: source-note — given this source: URL=https://example.com/research, title='Example Research Page', content='Some research findings about AI'. Return a JSON source note with url, title, snippets (array of evidence strings), and citation_number (integer)";

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[source-note] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[source-note] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "source-note-extraction",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  try {
    const extracted = extractJson(raw);
    const parsed: unknown = JSON.parse(extracted);

    if (typeof parsed !== "object" || parsed === null) {
      return {
        status: "failure",
        probe: "source-note-extraction",
        detail: `Parsed value is not an object: ${typeof parsed}`,
      };
    }

    const missing: string[] = [];
    for (const field of REQUIRED_SOURCE_NOTE_FIELDS) {
      if (!(field in parsed)) {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      return {
        status: "failure",
        probe: "source-note-extraction",
        detail: `Missing required fields: ${missing.join(", ")}`,
      };
    }

    // Validate types
    const note = parsed as {
      url: unknown;
      title: unknown;
      snippets: unknown;
      citation_number: unknown;
    };
    const typeErrors: string[] = [];
    if (typeof note.url !== "string" || note.url.trim().length === 0)
      typeErrors.push("url is missing or empty");
    if (typeof note.title !== "string" || note.title.trim().length === 0)
      typeErrors.push("title is missing or empty");
    if (!Array.isArray(note.snippets))
      typeErrors.push("snippets is not an array");
    else if (
      note.snippets.length === 0 ||
      !note.snippets.every(
        (s: unknown) => typeof s === "string" && s.trim().length > 0,
      )
    )
      typeErrors.push("snippets must be a non-empty array of non-empty strings");
    if (
      typeof note.citation_number !== "number" ||
      !Number.isInteger(note.citation_number) ||
      note.citation_number < 1
    )
      typeErrors.push("citation_number is not a positive integer");

    if (typeErrors.length > 0) {
      return {
        status: "failure",
        probe: "source-note-extraction",
        detail: `Type validation failed: ${typeErrors.join(", ")}`,
      };
    }

    return {
      status: "pass",
      probe: "source-note-extraction",
      detail: `Valid source note: url=${note.url}, title=${note.title}, snippets=${note.snippets.length}, citation=${note.citation_number}`,
    };
  } catch {
    return {
      status: "failure",
      probe: "source-note-extraction",
      detail: `Failed to parse source note JSON: ${raw.slice(0, 100)}`,
    };
  }
}

// ── 3e: Evidence-grounded synthesis ───────────────────────────────────────

export async function probeEvidenceGroundedSynthesis(
  brain: ResearchBrain,
  diagnostics: string[],
): Promise<ProbeResult> {
  const prompt =
    "probe: synthesis — given these source notes: [1] 'Cats are mammals', [2] 'Dogs are canines'. Produce a brief synthesis about pets, citing sources by number e.g. [1] or (Source 1)";

  let raw: string;
  try {
    raw = await brain.generate(prompt);
    diagnostics.push(`[synthesis] raw: ${raw}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    diagnostics.push(`[synthesis] generate() rejected: ${message}`);
    return {
      status: "failure",
      probe: "evidence-grounded-synthesis",
      detail: `Brain generate() rejected: ${message}`,
    };
  }

  // Extract citation references using common patterns: [1], [2], (Source 1), etc.
  const citationPatterns = [
    /\[(\d+)\]/g,
    /\(Source\s+(\d+)\)/gi,
    /\(source\s+(\d+)\)/gi,
    /\[Source\s+(\d+)\]/gi,
  ];

  const citedNumbers = new Set<number>();
  for (const pattern of citationPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(raw)) !== null) {
      citedNumbers.add(parseInt(match[1], 10));
    }
  }

  if (citedNumbers.size === 0) {
    // No citations found at all — check if response is even present
    if (raw.trim().length === 0) {
      return {
        status: "failure",
        probe: "evidence-grounded-synthesis",
        detail: "Brain returned empty synthesis",
      };
    }
    return {
      status: "failure",
      probe: "evidence-grounded-synthesis",
      detail:
        "No citations found in synthesis. Expected numbered references to source notes.",
    };
  }

  // Check that all citations reference existing source notes (1 and 2)
  const invalidCitations = [...citedNumbers].filter((n) => n > 2 || n < 1);
  if (invalidCitations.length > 0) {
    return {
      status: "failure",
      probe: "evidence-grounded-synthesis",
      detail: `Citations reference non-existent source notes: ${invalidCitations.join(", ")} (valid: 1, 2)`,
    };
  }

  return {
    status: "pass",
    probe: "evidence-grounded-synthesis",
    detail: `Synthesis with ${citedNumbers.size} valid citation(s): [${[...citedNumbers].sort().join(", ")}]`,
  };
}

// ── Shared helpers ─────────────────────────────────────────────────────────

/**
 * Extract JSON from a response that may be wrapped in fences or prose.
 * Tries: direct parse, ``` fences, content after last ``` fence end.
 */
function extractJson(text: string): string {
  const trimmed = stripThinkingBlocks(text).trim();

  // Try extracting from fenced blocks, preferring the last parseable JSON
  // block because prose may mention ```json ... ``` before the final answer.
  const fencedBlocks = [...trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
  for (let i = fencedBlocks.length - 1; i >= 0; i--) {
    const candidate = fencedBlocks[i][1]?.trim();
    if (!candidate) continue;
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // Keep looking for a later/earlier parseable fenced JSON block.
    }
  }

  // Try extracting content after the last ``` fence close.
  const afterFence = trimmed.match(/```[\s\S]*?```\s*([\s\S]*)$/);
  if (afterFence?.[1] && afterFence[1].trim().length > 0) {
    return afterFence[1].trim();
  }

  // If it starts with { or [ and ends with } or ], assume direct JSON
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    return trimmed;
  }

  // Last resort: try to find a JSON object in the text
  const objectMatch = trimmed.match(/(\{[\s\S]*\})/);
  if (objectMatch?.[1]) {
    return objectMatch[1];
  }

  return trimmed;
}
