import type { RowParts, GrepCandidate } from "../picker/types.js";

/**
 * Renders a GrepCandidate into RowParts for the shared view.
 *
 * primary   — the matched line text, trimmed of leading whitespace.
 * secondary — `${relativePath}:${lineNumber}`, provenance to the file and line.
 * tooltip   — the absolute path (disambiguates same-named files).
 */
export function renderGrepCandidate(candidate: GrepCandidate): RowParts {
  return {
    primary: candidate.label.trimStart(),
    secondary: `${candidate.relativePath}:${candidate.lineNumber}`,
    tooltip: candidate.absolutePath,
  };
}
