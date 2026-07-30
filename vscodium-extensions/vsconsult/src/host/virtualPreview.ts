import * as vscode from "vscode";

/**
 * The fixed URI scheme for the session-owned virtual preview document.
 * One stable scheme across all candidates — no per-candidate URIs.
 */
const SCHEME = "vsconsult-preview";

/**
 * Session-owned virtual preview document provider.
 *
 * Manages one stable, read-only virtual resource whose content is updated
 * in place as candidates change. The content is retrievable via the
 * `provideTextDocumentContent` contract for the registered scheme.
 */
export interface VirtualPreviewProvider {
  /** Fixed URI scheme (e.g. `"vsconsult-preview"`). */
  readonly scheme: string;

  /** Return the stable virtual URI for any candidate id. */
  virtualUri(candidateId: string): vscode.Uri;

  /** Update the virtual document content with the selected candidate. */
  updateContent(
    text: string,
    title: string,
    languageId?: string,
  ): void;

  /** Clear the stored content (called on session teardown). */
  closeContent(): void;

  /** Dispose the vscode content provider registration. */
  dispose(): void;

  /** TextDocumentContentProvider callback — returns current content. */
  provideTextDocumentContent(uri: vscode.Uri): string;

  /** Title (filename/path) of the last-updated candidate. */
  readonly title: string;

  /** LanguageId of the last-updated candidate. */
  readonly languageId: string | undefined;
}

/**
 * Creates a virtual preview provider backed by one stable virtual resource.
 *
 * The provider is registered once via `vscode.workspace.registerTextDocumentContentProvider`
 * and the stored content is updated in place across candidate changes.
 */
export function createVirtualPreview(): VirtualPreviewProvider {
  let content = "";
  let currentTitle = "";
  let currentLanguageId: string | undefined;

  const provider = {
    get scheme() {
      return SCHEME;
    },

    virtualUri(_candidateId: string): vscode.Uri {
      // One stable URI — candidate id is ignored for identity purposes.
      return vscode.Uri.parse(`${SCHEME}:session`);
    },

    updateContent(
      text: string,
      title: string,
      languageId?: string,
    ): void {
      content = text;
      currentTitle = title;
      currentLanguageId = languageId;
    },

    closeContent(): void {
      content = "";
      currentTitle = "";
      currentLanguageId = undefined;
    },

    provideTextDocumentContent(_uri: vscode.Uri): string {
      return content;
    },

    get title() {
      return currentTitle;
    },

    get languageId() {
      return currentLanguageId;
    },
  };

  // Register the provider with vscode under the fixed scheme.
  const registration = vscode.workspace.registerTextDocumentContentProvider(SCHEME, {
    provideTextDocumentContent(uri: vscode.Uri): string {
      return provider.provideTextDocumentContent(uri);
    },
  });

  return {
    scheme: SCHEME,
    virtualUri: provider.virtualUri,
    updateContent: provider.updateContent,
    closeContent: provider.closeContent,
    provideTextDocumentContent: provider.provideTextDocumentContent,
    get title() {
      return currentTitle;
    },
    get languageId() {
      return currentLanguageId;
    },
    dispose() {
      registration.dispose();
    },
  };
}
