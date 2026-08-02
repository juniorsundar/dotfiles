import { rank } from "../fuzzy.js";
import type { PickerCandidate } from "../picker/types.js";

/**
 * Narrowing for the picker chooser.
 *
 * Filters and ranks PickerCandidates by fuzzy matching against the
 * candidate's label using the shared fuzzy primitive — no path or field
 * bias. The source already sorts alphabetically, so narrowing only ever
 * reorders within the narrowed set.
 *
 * @returns A new array of matched candidates, sorted best-first.
 */
export function narrowPickCandidates(
  query: string,
  candidates: PickerCandidate[],
): PickerCandidate[] {
  return rank(query, candidates, (candidate) => candidate.label);
}
