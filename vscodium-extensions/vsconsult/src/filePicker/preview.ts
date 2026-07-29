import type { PickerContext } from "../picker/context.js";
import type { FileCandidate } from "../picker/types.js";

/**
 * Previews a FileCandidate by opening the file in preview mode.
 *
 * Like Accept, Preview performs only the effect (open document as preview).
 * The host owns lifecycle.
 */
export async function previewFileCandidate(
  candidate: FileCandidate,
  context: PickerContext,
): Promise<void> {
  await context.openTextDocument(candidate.id, { preview: true });
}
