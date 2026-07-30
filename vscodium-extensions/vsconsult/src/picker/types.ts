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
 * A live-grep candidate extending the shared Candidate contract with
 * file-and-match provenance fields.
 *
 * `id` is "${relativePath}:${lineNumber}:${column}" — stable within a
 * picker session. `label` is the full matched line text and the field
 * that Narrowing matches against.
 */
export interface GrepCandidate extends Candidate {
  /** Forward-slash path relative to the workspace folder root. */
  relativePath: string;
  /** Absolute filesystem path of the matched file. */
  absolutePath: string;
  /** 1-based line number of the match. */
  lineNumber: number;
  /** 1-based column of the match start. */
  column: number;
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
