import type { Candidate } from "./types.js";

/**
 * The session object a Source returns.
 *
 * For a snapshot source, `candidates` is the full result and `updates` is
 * undefined. For a stream source (future), `candidates` is the initial batch
 * and `updates` delivers incremental batches.
 */
export interface SourceSession<TCandidate extends Candidate = Candidate> {
  candidates: TCandidate[] | Promise<TCandidate[]>;
  /**
   * Optional stream of incremental candidate batches.
   * Present only for stream sources; snapshot sources omit it.
   */
  updates?: AsyncIterable<TCandidate[]>;
}

/**
 * The Source interface — the part of a Picker that produces candidates.
 *
 * A Source is query-aware: it receives the query and returns a session
 * (snapshot or stream). Snapshot sources (e.g., file picker) ignore the
 * query and deliver all candidates at once.
 */
export interface Source<TCandidate extends Candidate = Candidate> {
  (query: string, signal: AbortSignal): SourceSession<TCandidate>;
}
