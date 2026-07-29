import { scoreText, type BoundaryCheck } from "../fuzzy.js";
import type { FileCandidate } from "../picker/types.js";

/** Path-component boundary: start of text or after a path separator. */
const isPathBoundary: BoundaryCheck = (value, index) => {
  if (index === 0) {
    return true;
  }
  return "/\\_- .".includes(value[index - 1] ?? "");
};

/**
 * Path-biased fuzzy match score for a file candidate's relativePath.
 * Built directly on the shared fuzzy scoring engine (scoreText) with
 * path-boundary detection, end-weighting (prefers matches nearer the
 * filename), and a length penalty.
 */
function scoreFileCandidate(
  query: string,
  candidate: FileCandidate,
): number | undefined {
  return scoreText(query, candidate.relativePath, isPathBoundary, {
    endWeighting: true,
    lengthPenalty: true,
  });
}

/**
 * Narrowing function for the file picker.
 *
 * Filters and ranks FileCandidates by path-biased fuzzy matching against
 * the candidate's relativePath (the full workspace-relative path). Ties
 * are broken by alphabetical relativePath order.
 *
 * @returns A new array of matched candidates, sorted best-first.
 */
export function narrowFileCandidates(
  query: string,
  candidates: FileCandidate[],
): FileCandidate[] {
  return candidates
    .map((candidate) => {
      const score = scoreFileCandidate(query, candidate);
      return score === undefined ? undefined : { candidate, score };
    })
    .filter(
      (entry): entry is { candidate: FileCandidate; score: number } =>
        entry !== undefined,
    )
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) {
        return diff;
      }
      return a.candidate.relativePath.localeCompare(b.candidate.relativePath);
    })
    .map((entry) => entry.candidate);
}
