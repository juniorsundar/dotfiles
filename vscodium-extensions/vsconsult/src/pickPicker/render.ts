import type { PickerCandidate, RowParts } from "../picker/types.js";

/**
 * Renders a PickerCandidate into RowParts for the shared view.
 *
 * The primary label is the picker's name; the secondary text is the
 * picker's placeholder (carried on the candidate as `description`); the
 * tooltip shows the registry id.
 */
export function renderPickCandidate(candidate: PickerCandidate): RowParts {
  return {
    primary: candidate.label,
    secondary: candidate.description,
    tooltip: candidate.id,
  };
}
