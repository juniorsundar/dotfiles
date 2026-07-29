import { scoreText, type BoundaryCheck } from "./fuzzy.js";

export interface Candidate {
  id: string;
  name: string;
  directory: string;
  relativePath: string;
}

export interface RankedCandidate extends Candidate {
  score: number;
}

/** Path-component boundary: start of text or after a path separator. */
const isPathBoundary: BoundaryCheck = (value, index) => {
  if (index === 0) {
    return true;
  }

  return "/\\_- .".includes(value[index - 1] ?? "");
};

/**
 * Path-biased fuzzy match score built as a thin wrapper over the general
 * {@linkcode import("./fuzzy.js").scoreText | fuzzy scoring engine}.
 * Adds path-component-boundary bonuses, end-weighting (prefers matches
 * nearer the filename), and a length penalty.
 *
 * Whitespace separates query fragments and is not matched.
 */
export function scorePath(query: string, relativePath: string): number | undefined {
  return scoreText(query, relativePath, isPathBoundary, {
    endWeighting: true,
    lengthPenalty: true,
  });
}

export function rankCandidates(
  query: string,
  candidates: readonly Candidate[],
): RankedCandidate[] {
  return candidates
    .map((candidate) => {
      const score = scorePath(query, candidate.relativePath);
      return score === undefined ? undefined : { ...candidate, score };
    })
    .filter((candidate): candidate is RankedCandidate => candidate !== undefined)
    .sort(
      (left, right) =>
        right.score - left.score || left.relativePath.localeCompare(right.relativePath),
    );
}
