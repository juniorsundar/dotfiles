import type { PickerContext } from "../picker/context.js";
import type { FileCandidate } from "../picker/types.js";

/**
 * Accepts a FileCandidate by opening the file at its absolute path.
 *
 * Performs only the accept effect (open document). Lifecycle (restoring
 * origin, panel, focus) is owned by the host, not the picker.
 */
export async function acceptFileCandidate(
  candidate: FileCandidate,
  context: PickerContext,
): Promise<void> {
  await context.openTextDocument(candidate.id);
}
