import type { FileSourcingWorkspace } from "../fileSourcing.js";
import type { Picker, Registry } from "../picker/registry.js";
import type { FileCandidate } from "../picker/types.js";
import { createFileSource } from "./source.js";
import { narrowFileCandidates } from "./narrow.js";
import { renderFileCandidate } from "./render.js";
import { acceptFileCandidate } from "./accept.js";
import { previewFileCandidate } from "./preview.js";

/**
 * Assembles the file picker from its prefactored parts, backed by an
 * injectable workspace, and registers it with the given registry.
 *
 * The picker id is `"file"`.
 */
export function createFilePicker(
  workspace: FileSourcingWorkspace,
  registry: Registry,
): Picker<FileCandidate> {
  const source = createFileSource(workspace);

  const picker: Picker<FileCandidate> = {
    id: "file",
    label: "File",
    placeholder: "Narrow workspace files…",
    emptyState: "No matching workspace files",
    source,
    narrow: narrowFileCandidates,
    render: renderFileCandidate,
    accept: acceptFileCandidate,
    preview: previewFileCandidate,
  };

  registry.register(picker);
  return picker;
}
