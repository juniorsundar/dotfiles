import type { Registry, Picker } from "../picker/registry.js";
import type { Source } from "../picker/source.js";
import type { PickerCandidate } from "../picker/types.js";

/**
 * Creates the chooser Source: a snapshot, query-agnostic source that
 * enumerates the registry minus the chooser's own id and sorts the
 * candidates alphabetically by label.
 *
 * Each candidate is a thin reference to a registered picker: `id` and
 * `label` are taken from the picker, `description` from its placeholder.
 * The registry itself stays unbiased — the sort is applied here.
 */
export function createPickSource(
  registry: Registry,
  selfId: string,
): Source<PickerCandidate> {
  return (): { candidates: PickerCandidate[] } => {
    const candidates = registry
      .all()
      .filter((picker: Picker) => picker.id !== selfId)
      .map(toCandidate)
      .sort((a, b) => a.label.localeCompare(b.label));
    return { candidates };
  };
}

/** Projects a registered picker onto the thin PickerCandidate reference. */
function toCandidate(picker: Picker): PickerCandidate {
  return {
    id: picker.id,
    label: picker.label,
    description: picker.placeholder,
  };
}
