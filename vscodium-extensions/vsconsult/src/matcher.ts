export interface Candidate {
  id: string;
  name: string;
  directory: string;
  relativePath: string;
}

export interface RankedCandidate extends Candidate {
  score: number;
}

function isBoundary(value: string, index: number): boolean {
  if (index === 0) {
    return true;
  }

  return "/\\_- .".includes(value[index - 1] ?? "");
}

/**
 * Scores a fuzzy subsequence match. Higher scores favour contiguous matches,
 * path-component boundaries, and matches near the end of the path (usually
 * the filename). Whitespace separates query fragments and is not matched.
 */
export function scorePath(query: string, relativePath: string): number | undefined {
  const needle = query.toLocaleLowerCase().replaceAll(/\s+/g, "");
  const haystack = relativePath.toLocaleLowerCase();

  if (needle.length === 0) {
    return 0;
  }

  let score = 0;
  let searchFrom = 0;
  let previousMatch = -2;

  for (const character of needle) {
    const match = haystack.indexOf(character, searchFrom);
    if (match === -1) {
      return undefined;
    }

    score += 10;
    if (match === previousMatch + 1) {
      score += 14;
    }
    if (isBoundary(haystack, match)) {
      score += 18;
    }

    // Prefer compact matches and matches nearer the filename.
    score -= Math.min(match - searchFrom, 12);
    score += Math.floor((match / Math.max(haystack.length, 1)) * 4);

    previousMatch = match;
    searchFrom = match + 1;
  }

  return score - Math.floor(haystack.length / 24);
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
