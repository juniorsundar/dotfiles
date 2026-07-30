import type { PreviewContent } from "../host/previewContent.js";

/**
 * Host-backed helpers handed to a picker's accept and preview actions.
 *
 * Pickers act on candidates through the PickerContext rather than reaching
 * into the host API directly. The host provides the production implementation;
 * tests provide a fake.
 */
export interface PickerContext {
  /** Open a text document by URI (absolute path). */
  openTextDocument(
    uri: string,
    options?: { preview?: boolean },
  ): Promise<unknown>;

  /** Read a file's content by absolute path. */
  readFile(uri: string): Promise<string>;

  /** Read a bounded preview of a file by absolute path.
   *
   * Returns a structured result (text, truncated, binary, error) per the
   * content policy in src/host/previewContent.ts. Used by preview actions;
   * callers that need the full file (accept/source) use readFile.
   */
  readPreviewContent(uri: string): Promise<PreviewContent>;

  /** Show or update the session-owned virtual preview document.
   *
   * An optional `reveal` position scrolls the virtual preview editor to
   * that line so the match is visible; when omitted the preview opens at
   * the top (unchanged behavior from before ticket 11). */
  showPreview(p: {
    text: string;
    title: string;
    languageId?: string;
    reveal?: { line: number; character: number };
  }): Promise<void>;

  /** Resolve the language identifier VSCodium would select for a real file URI.
   *
   * Returns `undefined` when no language is associated or resolution fails.
   * Callers should treat `undefined` as plain text.
   */
  resolveLanguageId?(uri: string): Promise<string | undefined>;

  /** Close the session-owned virtual preview document. */
  closePreview(): Promise<void>;

  /** Reveal a position in an already-open document. */
  revealPosition(
    uri: string,
    position: { line: number; character: number },
  ): void;

  /** Execute a host command. */
  executeCommand(command: string, ...args: unknown[]): Promise<unknown>;

  /** Read the origin (editor state when the picker was invoked). */
  readOrigin(): { uri: string } | undefined;
}
