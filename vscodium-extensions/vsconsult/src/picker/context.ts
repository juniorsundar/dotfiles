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
