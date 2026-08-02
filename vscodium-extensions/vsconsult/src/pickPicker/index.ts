import type { Registry, Picker } from "../picker/registry.js";
import type { PickerCandidate } from "../picker/types.js";
import { createPickSource } from "./source.js";
import { narrowPickCandidates } from "./narrow.js";
import { renderPickCandidate } from "./render.js";
import { acceptPickCandidate } from "./accept.js";
import { previewPickCandidate } from "./preview.js";

/**
 * Assembles the picker chooser from its parts and registers it with the
 * given registry.
 *
 * The picker id is `"pick"`. Its candidates are the other registered
 * pickers; accepting a candidate starts that picker via the host's
 * `startPicker` primitive. Preview is a no-op — a row references another
 * picker, not a document.
 */
export function createPickPicker(registry: Registry): Picker<PickerCandidate> {
  const source = createPickSource(registry, "pick");

  const picker: Picker<PickerCandidate> = {
    id: "pick",
    label: "Pick",
    placeholder: "Choose a picker…",
    emptyState: "No matching picker",
    source,
    narrow: narrowPickCandidates,
    render: renderPickCandidate,
    accept: acceptPickCandidate,
    preview: previewPickCandidate,
  };

  registry.register(picker);
  return picker;
}
