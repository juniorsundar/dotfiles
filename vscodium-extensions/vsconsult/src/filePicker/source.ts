import type { Source, SourceSession } from "../picker/source.js";
import type { FileCandidate } from "../picker/types.js";
import {
  type FileSourcingWorkspace,
  sourceWorkspaceFiles,
} from "../fileSourcing.js";

/**
 * Creates a file Source that produces FileCandidates from an injectable
 * workspace.
 *
 * The file picker is a snapshot source: it ignores the query, snapshots
 * the workspace file tree, and returns all candidates at once. It never
 * emits updates.
 */
export function createFileSource(
  workspace: FileSourcingWorkspace,
): Source<FileCandidate> {
  return (query: string): SourceSession<FileCandidate> => {
    const promise = sourceWorkspaceFiles(workspace).then((results) =>
      results.map((r) => r.candidate),
    );
    return { candidates: promise };
  };
}
