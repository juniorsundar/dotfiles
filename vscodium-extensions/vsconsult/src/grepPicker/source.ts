import type { Source, SourceSession } from "../picker/source.js";
import type { GrepCandidate } from "../picker/types.js";

/**
 * The searchWorkspace primitive injected at activation.
 * Mirrors the shape returned by createSearchWorkspace in grepSourcing.ts.
 */
export type SearchWorkspace = (
  query: string,
  signal: AbortSignal,
) => SourceSession<GrepCandidate>;

/**
 * Creates a grep Source that delegates to the injected searchWorkspace.
 *
 * The source is a thin adapter: it forwards (query, signal) to
 * searchWorkspace and returns the resulting session verbatim. For a
 * query-driven stream picker this means the host receives either a
 * snapshot (empty query → []) or a stream of batch updates.
 */
export function createGrepSource(
  searchWorkspace: SearchWorkspace,
): Source<GrepCandidate> {
  return (query: string, signal: AbortSignal): SourceSession<GrepCandidate> => {
    return searchWorkspace(query, signal);
  };
}
