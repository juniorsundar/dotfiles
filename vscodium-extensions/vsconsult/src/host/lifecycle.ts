/**
 * HostEnv — abstract operations that the host needs to perform lifecycle
 * actions. The production implementation wraps vscode APIs; tests provide
 * a fake.
 */
export interface HostEnv {
  /**
   * Restore a previous editor state: show the document at the given URI,
   * set the selection, and reveal it. Called on cancel when an origin
   * exists.
   */
  restoreOrigin(origin: Origin): Promise<void>;

  /**
   * Focus the active editor group. Called on cancel when no origin exists.
   */
  focusActiveEditorGroup(): Promise<void>;

  /**
   * Close the panel. Called on exit when the panel was not visible before
   * the picker was invoked.
   */
  closePanel(): Promise<void>;
}

/** Snapshot of the editor state when the picker was invoked. */
export interface Origin {
  uri: string;
  selection: { line: number; character: number };
  viewColumn?: number;
}

// ---------------------------------------------------------------------------
// Lifecycle orchestrators
// ---------------------------------------------------------------------------

/**
 * Cancel lifecycle: restore the origin editor (or focus the editor group if
 * there was no origin), then run exit.
 *
 * The caller (host) is responsible for clearing the preview timer and
 * posting the idle message before and after this call.
 */
export async function runCancel(
  env: HostEnv,
  origin: Origin | undefined,
): Promise<void> {
  if (origin) {
    await env.restoreOrigin(origin);
  } else {
    await env.focusActiveEditorGroup();
  }
}

/**
 * Exit lifecycle: restore panel visibility.
 *
 * If the panel was not visible before the picker was invoked, close it to
 * return editor space.
 *
 * The caller (host) is responsible for clearing the preview timer, posting
 * the idle message, and clearing the session.
 */
export async function runExit(
  env: HostEnv,
  panelWasVisible: boolean,
): Promise<void> {
  if (!panelWasVisible) {
    await env.closePanel();
  }
}
