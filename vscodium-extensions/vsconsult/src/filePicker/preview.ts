import type { PickerContext } from "../picker/context.js";
import type { FileCandidate } from "../picker/types.js";

/**
 * Previews a FileCandidate by showing the session-owned virtual preview.
 *
 * Like Accept, Preview performs only the effect (update virtual document).
 * The host owns lifecycle.
 */
export async function previewFileCandidate(
  candidate: FileCandidate,
  context: PickerContext,
): Promise<void> {
  const text = await context.readFile(candidate.id);
  await context.showPreview({
    text,
    title: candidate.relativePath,
  });
}
