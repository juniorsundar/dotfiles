import type { RowParts, FileCandidate } from "../picker/types.js";

/**
 * Renders a FileCandidate into RowParts for the shared view.
 *
 * The primary label is the filename (label); the secondary text is the
 * directory path (empty string for root-level files).
 */
export function renderFileCandidate(candidate: FileCandidate): RowParts {
  return {
    primary: candidate.label,
    secondary: candidate.directory,
  };
}
