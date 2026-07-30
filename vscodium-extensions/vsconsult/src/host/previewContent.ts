/**
 * Bounded preview content policy for file-picker candidates.
 *
 * Pure, host-owned module: it decides *how much* of a file to read and how to
 * represent it, given injectable filesystem primitives. It never touches the
 * real filesystem directly, which keeps byte limits and bounded I/O
 * observable in tests.
 *
 * Policy (ADR 0004 / ticket 08):
 *   - Files up to and including 1 MiB receive a complete textual preview.
 *   - Larger files read at most the first 512 KiB with a visible truncation
 *     notice.
 *   - Binary-looking content receives an explanatory fallback, not raw bytes.
 *   - Stat / read / decode failures are non-fatal.
 *
 * Sizes are expressed in bytes; the read primitive is invoked with an explicit
 * byte cap so a large file is never loaded completely only to be truncated.
 */

/** Independent byte-limit constants (spec literals). */
export const FULL_PREVIEW_MAX_BYTES = 1024 * 1024; // 1 MiB
export const EXCERPT_MAX_BYTES = 512 * 1024; // 512 KiB

/** Byte limits applied when reading a bounded preview. */
export interface PreviewByteLimits {
  /** Files up to this size preview whole; larger files are excerpted. */
  fullMaxBytes: number;
  /** Bytes shown from the start of a file that exceeds `fullMaxBytes`. */
  excerptMaxBytes: number;
}

/** The default limits, matching the named constants above. */
export const DEFAULT_PREVIEW_BYTE_LIMITS: PreviewByteLimits = {
  fullMaxBytes: FULL_PREVIEW_MAX_BYTES,
  excerptMaxBytes: EXCERPT_MAX_BYTES,
};

/** Injectable filesystem primitives. */
export interface PreviewFilePrimitives {
  /** Stat the file; returns at least `{ size }` in bytes. */
  stat(path: string): Promise<{ size: number }>;

  /** Read at most `maxBytes` bytes starting at the beginning of the file. */
  readBytes(path: string, maxBytes: number): Promise<Uint8Array>;

  /**
   * Optional byte-decode step. Defaults to `decodeUtf8Safe`. Injectable so a
   * decode failure can be represented and kept non-fatal (criterion 6), and
   * so tests can observe the decode path independently of the read path.
   */
  decode?(bytes: Uint8Array): string;
}

/** Structured result of a preview read. */
export interface PreviewContent {
  /** The decoded (or fallback) text to display in the virtual preview. */
  text: string;
  /** Whether the content was truncated to fit the excerpt limit. */
  truncated: boolean;
  /** Whether the content was treated as binary-looking. */
  binary: boolean;
  /** The file size in bytes, as reported by stat. */
  size: number;
  /** Non-fatal error message if stat/read/decode failed. */
  error?: string;
  /**
   * Human-readable truncation notice for truncated previews, otherwise
   * undefined. Callers compose it into the displayed payload so the user
   * cannot mistake an excerpt for the complete file.
   */
  truncationNotice?: string;
}

/**
 * Reads a bounded preview of the file at `path` and returns a structured
 * representation suitable for the virtual preview document.
 *
 * `limits` overrides the default byte caps; when omitted, the package
 * defaults (`FULL_PREVIEW_MAX_BYTES` / `EXCERPT_MAX_BYTES`) are used so
 * existing callers and tests keep their behaviour.
 */
export async function readPreviewContent(
  path: string,
  deps: PreviewFilePrimitives,
  limits: PreviewByteLimits = DEFAULT_PREVIEW_BYTE_LIMITS,
): Promise<PreviewContent> {
  let size: number;
  try {
    size = (await deps.stat(path)).size;
  } catch (e) {
    const message = errorMessage(e);
    return {
      text: message,
      truncated: false,
      binary: false,
      size: 0,
      error: message,
    };
  }
  const { fullMaxBytes, excerptMaxBytes } = limits;
  const truncated = size > fullMaxBytes;
  const maxBytes = truncated ? excerptMaxBytes : Math.min(size, fullMaxBytes);
  let bytes: Uint8Array;
  try {
    bytes = await deps.readBytes(path, maxBytes);
  } catch (e) {
    const message = errorMessage(e);
    return {
      text: message,
      truncated: false,
      binary: false,
      size,
      error: message,
    };
  }

  if (looksBinary(bytes)) {
    return {
      text: binaryFallback(path, size),
      truncated: false,
      binary: true,
      size,
    };
  }

  let text: string;
  try {
    text = (deps.decode ?? decodeUtf8Safe)(bytes);
  } catch (e) {
    const message = errorMessage(e);
    return {
      text: message,
      truncated: false,
      binary: false,
      size,
      error: message,
    };
  }

  const truncationNotice = truncated
    ? `… [truncated — showing first ${excerptMaxBytes} bytes of ${size}]`
    : undefined;
  return {
    text,
    truncated,
    binary: false,
    size,
    truncationNotice,
  };
}

/** Coerce an unknown caught error into a display message. */
function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return typeof e === "string" ? e : String(e);
}

/**
 * Best-effort binary detection. A NUL byte is a strong, well-known signal of
 * non-text content; this is intentionally conservative rather than a precise
 * content-type guess (ADR 0004 calls binary detection explicitly best-effort).
 */
function looksBinary(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i += 1) {
    if (bytes[i] === 0x00) return true;
  }
  return false;
}

/**
 * Explanatory fallback for binary-looking content. Conveys the path and size
 * (metadata) without emitting raw bytes that would corrupt the preview.
 */
function binaryFallback(path: string, size: number): string {
  return `Binary file — no text preview available.\nPath: ${path}\nSize: ${size} bytes`;
}

/**
 * Decodes `bytes` as UTF-8, trimming any incomplete trailing multibyte
 * sequence so the result is valid UTF-8 with no U+FFFD replacement character
 * introduced by a boundary cut.
 *
 * UTF-8 continuation bytes are `0x80..0xBF`. A leading byte encodes the
 * expected sequence length (2/3/4 bytes); if fewer continuation bytes follow
 * than the leading byte promises, the trailing partial sequence is dropped
 * before decoding.
 */
function decodeUtf8Safe(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  // Find the index of the last leading byte that starts a complete sequence.
  let cut = bytes.length;
  let i = 0;
  // Walk forward counting whole codepoints so `cut` ends on a boundary.
  while (i < cut) {
    const b0 = bytes[i]!;
    let len: number;
    if (b0 < 0x80) len = 1;
    else if ((b0 & 0xe0) === 0xc0) len = 2;
    else if ((b0 & 0xf0) === 0xe0) len = 3;
    else if ((b0 & 0xf8) === 0xf0) len = 4;
    else { i += 1; continue; } // stray continuation byte
    if (i + len > cut) {
      // Incomplete trailing sequence: drop it from the decode window.
      cut = i;
      break;
    }
    i += len;
  }
  return Buffer.from(bytes.subarray(0, cut)).toString("utf8");
}