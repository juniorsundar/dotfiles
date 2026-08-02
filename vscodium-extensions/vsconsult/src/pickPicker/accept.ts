import type { PickerContext } from "../picker/context.js";
import type { PickerCandidate } from "../picker/types.js";

/**
 * Accepts a PickerCandidate by starting the chosen picker.
 *
 * Performs only the accept effect (start the picker via the host's
 * startPicker primitive, which switches the active session). Lifecycle
 * (restoring origin, panel, focus) is owned by the host, not the picker.
 */
export async function acceptPickCandidate(
  candidate: PickerCandidate,
  context: PickerContext,
): Promise<void> {
  await context.startPicker(candidate.id);
}
