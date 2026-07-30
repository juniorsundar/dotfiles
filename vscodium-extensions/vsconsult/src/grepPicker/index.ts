import type { Registry } from "../picker/registry.js";
import type { GrepCandidate } from "../picker/types.js";
import type { SearchWorkspace } from "./source.js";
import { createGrepSource } from "./source.js";
import { narrowGrepCandidates } from "./narrow.js";
import { renderGrepCandidate } from "./render.js";
import { acceptGrepCandidate } from "./accept.js";
import { previewGrepCandidate } from "./preview.js";

/**
 * Assembles the grep picker from its parts, backed by the injected
 * searchWorkspace primitive, and registers it.
 *
 * The picker id is `"grep"`. It is queryDriven: the host re-runs the
 * source on every query change and cancels the in-flight run.
 */
export function createGrepPicker(
  searchWorkspace: SearchWorkspace,
  registry: Registry,
) {
  const source = createGrepSource(searchWorkspace);

  const picker = {
    id: "grep",
    label: "Grep",
    placeholder: "Search workspace contents…",
    emptyState: "No matches",
    queryDriven: true,
    source,
    narrow: narrowGrepCandidates,
    render: renderGrepCandidate,
    accept: acceptGrepCandidate,
    preview: previewGrepCandidate,
  };

  registry.register(picker);
  return picker;
}
