/**
 * Shared Candidate contract.
 * Every candidate carries the shared contract `id` (a stable handle the host
 * and webview protocol use to refer to a row) and `label` (the primary display
 * text and default narrowing text). Picker types extend this with their own
 * strongly-typed fields.
 */
export interface Candidate {
  id: string;
  label: string;
}

/**
 * A file-system candidate extending the shared Candidate contract with
 * file-specific fields.
 */
export interface FileCandidate extends Candidate {
  directory: string;
  relativePath: string;
}

/**
 * Structured row parts returned by a picker's Render.
 * The host maps these into fixed DOM slots; pickers do not lay out rows.
 */
export interface RowParts {
  primary: string;
  secondary?: string;
  icon?: string;
  tooltip?: string;
}
