/** Normalise a fuzzy query: lowercase, strip whitespace. */
export function normalizeQuery(query: string): string {
  return query.toLocaleLowerCase().replaceAll(/\s+/g, "");
}

/** Normalise text to match against: lowercase only. */
export function normalizeText(text: string): string {
  return text.toLocaleLowerCase();
}

/** Function type for per-position boundary checks in the scoring engine. */
export type BoundaryCheck = (text: string, index: number) => boolean;

/**
 * General word-boundary detection: start of text, or after a character that
 * is not a letter or digit.
 */
export const isWordBoundary: BoundaryCheck = (text, index) => {
  if (index === 0) {
    return true;
  }
  return /[^a-zA-Z0-9]/.test(text[index - 1]);
};

/**
 * Internal scoring engine that both the general primitive and the
 * path-biased wrapper build on. Parameterising the boundary check and the
 * optional end-weighting / length-penalty flags is the only difference
 * between the two.
 */
export function scoreText(
  query: string,
  text: string,
  boundaryCheck: BoundaryCheck,
  options?: { endWeighting?: boolean; lengthPenalty?: boolean },
): number | undefined {
  const needle = normalizeQuery(query);
  const haystack = normalizeText(text);

  if (needle.length === 0) {
    return 0;
  }

  let score = 0;
  let searchFrom = 0;
  let previousMatch = -2;

  for (const char of needle) {
    const match = haystack.indexOf(char, searchFrom);
    if (match === -1) {
      return undefined;
    }

    score += 10;
    if (match === previousMatch + 1) {
      score += 14;
    }
    if (boundaryCheck(haystack, match)) {
      score += 18;
    }

    // Penalise the gap between consecutive matched characters (compactness).
    score -= Math.min(match - searchFrom, 12);

    if (options?.endWeighting) {
      score += Math.floor((match / Math.max(haystack.length, 1)) * 4);
    }

    previousMatch = match;
    searchFrom = match + 1;
  }

  if (options?.lengthPenalty) {
    score -= Math.floor(haystack.length / 24);
  }

  return score;
}

/**
 * Scores a fuzzy subsequence match on arbitrary text with no path, filename,
 * or field bias. Higher scores favour contiguous matches, word-boundary
 * matches (start of text or after a non-alphanumeric character), and compact
 * matches (query characters close together in the text).
 *
 * Returns `undefined` when the query does not match, `0` for an empty query,
 * and a positive integer for a successful match.
 *
 * This is the shared primitive that every picker's narrow function builds on.
 */
export function score(query: string, text: string): number | undefined {
  return scoreText(query, text, isWordBoundary);
}

/**
 * Ranks an array of items by how well their projected text matches a fuzzy query.
 * Items that do not match at all are excluded. Ties are stable (original order
 * is preserved for equal scores).
 *
 * @typeParam T — the item type (no field constraints; `textOf` decouples scoring
 *   from any specific property).
 * @returns A new array of items sorted by descending match score (best first).
 */
export function rank<T>(
  query: string,
  items: T[],
  textOf: (item: T) => string,
): T[] {
  return items
    .map((item) => ({ item, score: score(query, textOf(item)) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== undefined)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}
