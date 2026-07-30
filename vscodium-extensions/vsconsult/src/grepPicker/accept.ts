import type { PickerContext } from "../picker/context.js";
import type { GrepCandidate } from "../picker/types.js";

/**
 * Accepts a GrepCandidate by opening the matched file for real (not as
 * a preview) at the match's line and column, then revealing the cursor
 * at that position.
 *
 * The same absolutePath is passed to both openTextDocument and
 * revealPosition so the editor lookup finds the editor that
 * openTextDocument just made visible.
 *
 * Lifecycle (origin restore, panel, focus) is host-owned.
 */
export async function acceptGrepCandidate(
  candidate: GrepCandidate,
  context: PickerContext,
): Promise<void> {
  await context.openTextDocument(candidate.absolutePath, { preview: false });
  context.revealPosition(candidate.absolutePath, {
    line: candidate.lineNumber - 1,
    character: candidate.column - 1,
  });
}
