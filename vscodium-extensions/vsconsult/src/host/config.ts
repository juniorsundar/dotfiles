/**
 * User-configurable settings for vsconsult, surfaced through the VS Code
 * Settings UI (see `contributes.configuration` in package.json).
 *
 * Defaults are centralised here as named constants so host.ts, previewContent.ts,
 * and fileSourcing.ts share one source of truth. `readVsconsultConfig` reads
 * the live values from a `getConfiguration('vsconsult')`-shaped object so the
 * host can re-read on configuration-change events without restarting pickers.
 */

/** Default preview debounce delay (ms). Snappy without thrashing reads. */
export const DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS = 125;

/** Default full-preview byte cap (1 MiB). Files up to this size preview whole. */
export const DEFAULT_FULL_PREVIEW_MAX_BYTES = 1024 * 1024; // 1 MiB

/** Default truncated-excerpt size (512 KiB) for files over the full cap. */
export const DEFAULT_EXCERPT_MAX_BYTES = 512 * 1024; // 512 KiB

/**
 * Default cap on the number of candidate rows sent to the webview per
 * `results` message. The webview renders one DOM node per row, so an
 * unbounded list (a broad liveGrep query can match thousands of lines)
 * makes each render expensive and backlogs during rapid typing. The
 * status line reports the true total plus a "showing N" note when this
 * cap is hit, so the user always knows the full match count. Set to `0`
 * to disable the cap (send every match).
 */
export const DEFAULT_MAX_RESULTS_ROWS = 200;

/** Baseline exclude patterns always applied when sourcing workspace files. */
export const DEFAULT_FILE_EXCLUDES: readonly string[] = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.direnv/**",
  "**/dist/**",
  "**/out/**",
  "**/.cache/**",
];

/** Resolved vsconsult configuration. */
export interface VsconsultConfig {
  previewDebounceDelayMs: number;
  previewFullMaxBytes: number;
  previewExcerptMaxBytes: number;
  fileExcludes: string[];
  /** Max rows sent to the webview per results message (0 = no cap). */
  maxResultsRows: number;
}

/**
 * Minimal shape needed to read settings — matches the object returned by
 * `vscode.workspace.getConfiguration('vsconsult')`. Kept as an interface so
 * tests can pass a plain stub without importing the `vscode` module.
 */
export interface VsconsultConfigurationAccessor {
  get<T>(section: string): T | undefined;
}

/**
 * Reads the four vsconsult settings from a `getConfiguration('vsconsult')`-shaped
 * accessor, falling back to the named defaults when a value is absent or of the
 * wrong type. Type guards keep malformed user input (e.g. a negative delay or a
 * non-array excludes list) from crashing the picker.
 */
export function readVsconsultConfig(
  accessor: VsconsultConfigurationAccessor,
): VsconsultConfig {
  return {
    previewDebounceDelayMs: clampNonNegativeInt(
      accessor.get<number>("previewDebounceDelayMs"),
      DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS,
    ),
    previewFullMaxBytes: clampPositiveInt(
      accessor.get<number>("previewFullMaxBytes"),
      DEFAULT_FULL_PREVIEW_MAX_BYTES,
    ),
    previewExcerptMaxBytes: clampPositiveInt(
      accessor.get<number>("previewExcerptMaxBytes"),
      DEFAULT_EXCERPT_MAX_BYTES,
    ),
    fileExcludes: stringArrayOr(
      accessor.get<string[]>("fileExcludes"),
      DEFAULT_FILE_EXCLUDES,
    ),
    maxResultsRows: clampNonNegativeInt(
      accessor.get<number>("maxResultsRows"),
      DEFAULT_MAX_RESULTS_ROWS,
    ),
  };
}

function isFiniteInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value);
}

function clampNonNegativeInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFiniteInteger(value) || value < 0) return fallback;
  return value;
}

function clampPositiveInt(value: number | undefined, fallback: number): number {
  if (value === undefined || !isFiniteInteger(value) || value < 1) return fallback;
  return value;
}

function stringArrayOr(value: string[] | undefined, fallback: readonly string[]): string[] {
  if (!Array.isArray(value)) return [...fallback];
  const filtered = value.filter((v): v is string => typeof v === "string");
  return filtered.length === value.length ? filtered : [...fallback];
}