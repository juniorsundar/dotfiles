import { score } from "../fuzzy.js";
import type { GrepCandidate } from "../picker/types.js";

/**
 * Narrowing function for the grep picker.
 *
 * An identity / light post-filter: the query is matched against the
 * candidate's label (the matched line text) using the shared fuzzy
 * primitive with no path bias. Candidates are filtered to those
 * matching the query and ranked best-first by word-boundary score.
 * An empty query returns all candidates in original order.
 */
export function narrowGrepCandidates(
  query: string,
  candidates: GrepCandidate[],
): GrepCandidate[] {
  if (query === "") return candidates;

  return candidates
    .map((candidate) => {
      const s = score(query, candidate.label);
      return s === undefined ? undefined : { candidate, score: s };
    })
    .filter(
      (entry): entry is { candidate: GrepCandidate; score: number } =>
        entry !== undefined,
    )
    .sort((a, b) => {
      const diff = b.score - a.score;
      if (diff !== 0) return diff;
      // Stable: preserve original order for equal scores.
      return 0;
    })
    .map((entry) => entry.candidate);
}
