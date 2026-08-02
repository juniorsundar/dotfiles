import type { PickerContext } from "../picker/context.js";
import type { PickerCandidate } from "../picker/types.js";

/**
 * Previews a PickerCandidate — a deliberate no-op.
 *
 * The chooser is a picker of pickers: its rows reference other pickers,
 * so there is no document to preview. The preview action intentionally
 * calls no context primitive and opens no document; selecting a row
 * simply highlights it in the shared view.
 */
export function previewPickCandidate(
  _candidate: PickerCandidate,
  _context: PickerContext,
): void {}
