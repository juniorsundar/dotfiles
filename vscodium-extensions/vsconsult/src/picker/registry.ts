import type { Candidate, RowParts } from "./types.js";
import type { Source } from "./source.js";
import type { PickerContext } from "./context.js";

/**
 * A Picker is a bundle of five parts: Source, Candidate shape, Narrowing,
 * Render, and Accept (plus Preview as a companion to Accept).
 *
 * Every picker type is a concrete configuration of these parts.
 */
export interface Picker<TCandidate extends Candidate = Candidate> {
  id: string;
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
  };
}
