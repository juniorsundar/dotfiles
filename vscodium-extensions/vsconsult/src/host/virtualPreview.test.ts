import { describe, expect, it, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock vscode — needed for vscode.TextDocumentContentProvider
// ---------------------------------------------------------------------------

vi.mock("vscode", () => {
  const commands = { executeCommand: vi.fn(async () => {}) };
  const window = {
    activeTextEditor: undefined as undefined,
    showTextDocument: vi.fn(async () => ({})),
    showInformationMessage: vi.fn(async () => ({})),
  };
  const workspace = {
    registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
  };
  const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => p }),
    parse: (s: string) => ({ fsPath: s, scheme: s.split(":")[0], toString: () => s }),
  };
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    readonly event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: T): void {
      for (const listener of this.listeners) listener(value);
    }
    dispose(): void { this.listeners.clear(); }
  }
  const ViewColumn = { Active: 1, Beside: 2 };
  return { commands, window, workspace, Uri, ViewColumn, EventEmitter, default: undefined };
});

// ---------------------------------------------------------------------------
// Imports (after mock)
// ---------------------------------------------------------------------------

import { createVirtualPreview } from "./virtualPreview.js";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createVirtualPreview", () => {
  let provider: ReturnType<typeof createVirtualPreview>;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = createVirtualPreview();
  });

  it("exposes a stable URI that does not change across content updates", () => {
    const uri1 = provider.virtualUri("file-a");
    const uri2 = provider.virtualUri("file-b");

    // The URI scheme and base must be the same — identity is stable
    expect(uri1.toString()).toBe(uri2.toString());
  });

  it("updateContent stores content retrievable via provideTextDocumentContent", () => {
    provider.updateContent("hello world", "test.ts", "typescript");

    const content = provider.provideTextDocumentContent(
      provider.virtualUri("any.ts"),
    );
    expect(content).toBe("hello world");
  });

  it("the content provider is registered with vscode under a fixed scheme", () => {
    // The provider exposes a scheme property for registration.
    expect(provider.scheme).toBe("vsconsult-preview");
  });

  it("updateContent overwrites previous content (same virtual URI reused)", () => {
    provider.updateContent("first", "file1.txt", "plaintext");
    provider.updateContent("second", "file2.txt", "plaintext");

    const content = provider.provideTextDocumentContent(
      provider.virtualUri("any.txt"),
    );
    expect(content).toBe("second");
  });

  it("notifies VSCodium to reload the stable URI after every content update", () => {
    const registrations = (vscode.workspace.registerTextDocumentContentProvider as any).mock.calls;
    expect(registrations).toHaveLength(1);
    const registeredProvider = registrations[0][1];
    const changed: string[] = [];
    registeredProvider.onDidChange((uri: vscode.Uri) => changed.push(uri.toString()));

    provider.updateContent("first", "file1.txt");
    provider.updateContent("second", "file2.txt");

    expect(changed).toEqual([
      provider.virtualUri("file1.txt").toString(),
      provider.virtualUri("file2.txt").toString(),
    ]);
  });

  it("closeContent clears the stored content", () => {
    provider.updateContent("some content", "file.txt", "plaintext");

    provider.closeContent();

    const content = provider.provideTextDocumentContent(
      provider.virtualUri("any.txt"),
    );
    expect(content).toBe("");
  });

  it("can publish a new candidate after the preview is closed", () => {
    provider.updateContent("first", "first.txt");
    provider.closeContent();
    provider.updateContent("second", "second.txt");

    expect(provider.provideTextDocumentContent(provider.virtualUri("any.txt"))).toBe("second");
  });

  it("provides the title (filename) for the last-updated candidate", () => {
    provider.updateContent("content", "src/main.ts", "typescript");

    expect(provider.title).toBe("src/main.ts");
  });

  it("provides the languageId for the last-updated candidate", () => {
    provider.updateContent("content", "style.css", "css");

    expect(provider.languageId).toBe("css");
  });

  it("does not expose a write path — edits to the virtual document do not reach any real file", () => {
    // The provider has no write-through or onSave mechanism.
    // Edits to the virtual buffer are purely in-editor state.
    const fsSpy = vi.fn();
    // Confirm no fs.writeFile or similar method exists on the provider.
    expect(provider).not.toHaveProperty("writeFile");
    expect(provider).not.toHaveProperty("onSave");
  });
});
