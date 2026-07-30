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

  /** Show or update the session-owned virtual preview document. */
  showPreview(p: {
    text: string;
    title: string;
    languageId?: string;
  }): Promise<void>;

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
