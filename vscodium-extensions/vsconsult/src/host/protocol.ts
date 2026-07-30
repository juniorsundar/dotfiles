import type { Candidate, RowParts } from "../picker/types.js";
import type { Picker } from "../picker/registry.js";

// ---------------------------------------------------------------------------
// PickerConfig — labels and UI text sent in the `configure` message
// ---------------------------------------------------------------------------

export interface PickerConfig {
  /** Uniquely identifies the active picker type. */
  id: string;
  /** Short user-visible name (e.g. "File"). */
  label: string;
  /** Placeholder shown in the query input. */
  placeholder: string;
  /** Shown when no candidates match the query. */
  emptyState: string;
}

// ---------------------------------------------------------------------------
// RowMessage — serializable row shape sent to the webview
// ---------------------------------------------------------------------------

export interface RowMessage {
  id: string;
  primary: string;
  secondary?: string;
  icon?: string;
  tooltip?: string;
}

// ---------------------------------------------------------------------------
// Outbound (host → webview) message types
// ---------------------------------------------------------------------------

export type OutboundMessage =
  | { type: "configure"; config: PickerConfig }
  | { type: "setQuery"; query: string }
  | { type: "reset" }
  | { type: "results"; rows: RowMessage[]; status: string }
  | { type: "status"; message: string; error?: boolean }
  | { type: "complete" }
  | { type: "idle" };

// ---------------------------------------------------------------------------
// Inbound (webview → host) message types
// ---------------------------------------------------------------------------

export type InboundMessage =
  | { type: "ready" }
  | { type: "query"; query: string }
  | { type: "select"; id: string }
  | { type: "accept"; id: string }
  | { type: "cancel" };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Builds a PickerConfig from a registered Picker.
 * The host sends this as the first message after a picker is invoked.
 */
export function buildPickerConfig<TCandidate extends Candidate>(
  picker: Picker<TCandidate>,
): PickerConfig {
  return {
    id: picker.id,
    label: picker.label,
    placeholder: picker.placeholder,
    emptyState: picker.emptyState,
  };
}

/**
 * Maps typed candidates to RowMessage objects through the picker's render
 * function. The host sends these as the `rows` array in a `results` message.
 */
export function shapeCandidateRows<TCandidate extends Candidate>(
  picker: Picker<TCandidate>,
  candidates: TCandidate[],
): RowMessage[] {
  return candidates.map((c) => {
    const parts: RowParts = picker.render(c);
    return { id: c.id, ...parts };
  });
}
