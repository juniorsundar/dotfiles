import type { Candidate, RowParts } from "./types.js";
import type { Source } from "./source.js";
import type { PickerContext } from "./context.js";

/**
 * A Picker is a bundle of five parts: Source, Candidate shape, Narrowing,
 * Render, and Accept (plus Preview as a companion to Accept), plus
 * user-visible metadata for the shared view.
 *
 * Every picker type is a concrete configuration of these parts.
 */
export interface Picker<TCandidate extends Candidate = Candidate> {
  id: string;
  /** Short user-visible name (e.g. "File", "Grep"). */
  label: string;
  /** Query input placeholder text. */
  placeholder: string;
  /** Shown in the results area when no candidates match the query. */
  emptyState: string;
  /**
   * When true the host re-runs the source on every query change and
   * cancels the previous in-flight source (e.g. live-grep, workspace-symbol).
   * When false the host narrows the pre-materialized candidate set.
   * Defaults to false.
   */
  queryDriven?: boolean;
  source: Source<TCandidate>;
  narrow: (query: string, candidates: TCandidate[]) => TCandidate[];
  render: (candidate: TCandidate) => RowParts;
  accept: (
    candidate: TCandidate,
    context: PickerContext,
  ) => void | Promise<void>;
  preview: (
    candidate: TCandidate,
    context: PickerContext,
  ) => void | Promise<void>;
}

/**
 * A registry stores picker registrations by id.
 *
 * Registration is code-only: added at activation with no manifest edit.
 */
export interface Registry {
  register<TCandidate extends Candidate = Candidate>(
    picker: Picker<TCandidate>,
  ): void;
  get(id: string): Picker | undefined;
  /** Enumerate registered pickers in insertion order. */
  all(): Picker[];
}

/**
 * Creates a new picker registry.
 */
export function createRegistry(): Registry {
  const pickers = new Map<string, Picker>();

  return {
    register<TCandidate extends Candidate = Candidate>(
      picker: Picker<TCandidate>,
    ) {
      pickers.set(picker.id, picker as unknown as Picker);
    },
    get(id) {
      return pickers.get(id);
    },
    all() {
      return [...pickers.values()];
    },
  };
}
