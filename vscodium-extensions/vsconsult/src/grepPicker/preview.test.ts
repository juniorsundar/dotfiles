import { describe, expect, it, vi } from "vitest";

import { previewGrepCandidate } from "./preview.js";
import type { PickerContext } from "../picker/context.js";
import type { PreviewContent } from "../host/previewContent.js";
import type { GrepCandidate } from "../picker/types.js";

const aMatch: GrepCandidate = {
  id: "src/main.ts:42:5",
  label: "  const x = 1;",
  relativePath: "src/main.ts",
  absolutePath: "/project/src/main.ts",
  lineNumber: 42,
  column: 5,
};

function fakePickerContext(): PickerContext & {
  lastPayload:
    | {
        text: string;
        title: string;
        languageId?: string;
        reveal?: { line: number; character: number };
      }
    | undefined;
  setPreviewContent: (c: PreviewContent) => void;
  setResolveLanguageId: (id: string | undefined) => void;
} {
  let lastPayload:
    | {
        text: string;
        title: string;
        languageId?: string;
        reveal?: { line: number; character: number };
      }
    | undefined;
  let nextContent: PreviewContent = {
    text: "",
    truncated: false,
    binary: false,
    size: 0,
  };
  let nextLanguageId: string | undefined;
  return {
    get lastPayload() {
      return lastPayload;
    },
    setPreviewContent(c) {
      nextContent = c;
    },
    setResolveLanguageId(id) {
      nextLanguageId = id;
    },
    openTextDocument: vi.fn(async () => {}),
    readFile: vi.fn(async () => ""),
    readPreviewContent: vi.fn(async (uri: string) => {
      // Allow tests to verify the URI passed.
      return nextContent;
    }),
    resolveLanguageId: vi.fn(async () => nextLanguageId),
    showPreview: vi.fn(
      async (p: {
        text: string;
        title: string;
        languageId?: string;
        reveal?: { line: number; character: number };
      }) => {
        lastPayload = { ...p };
      },
    ),
    closePreview: vi.fn(async () => {}),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
  };
}

describe("grep picker preview action", () => {
  it("reads bounded content for the matched file's absolutePath", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "line 41\nline 42: const x = 1;\nline 43",
      truncated: false,
      binary: false,
      size: 128,
    });

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.readPreviewContent).toHaveBeenCalledWith(
      aMatch.absolutePath,
    );
  });

  it("shows preview with reveal at the match line (0-based converts)", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "content here",
      truncated: false,
      binary: false,
      size: 16,
    });

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.showPreview).toHaveBeenCalledOnce();
    expect(ctx.lastPayload!.title).toBe(aMatch.relativePath);
    expect(ctx.lastPayload!.text).toBe("content here");
    expect(ctx.lastPayload!.reveal).toEqual({
      line: aMatch.lineNumber - 1,
      character: aMatch.column - 1,
    });
  });

  it("resolves language for normal text content", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "export function foo() {",
      truncated: false,
      binary: false,
      size: 32,
    });
    ctx.setResolveLanguageId("typescript");

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.resolveLanguageId).toHaveBeenCalledWith(aMatch.absolutePath);
    expect(ctx.lastPayload!.languageId).toBe("typescript");
  });

  it("skips language resolution for binary content", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "Binary file",
      truncated: false,
      binary: true,
      size: 4096,
    });
    ctx.setResolveLanguageId("typescript");

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("skips language resolution for truncated content", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "first chunk...",
      truncated: true,
      binary: false,
      size: 2 * 1024 * 1024,
    });
    ctx.setResolveLanguageId("plaintext");

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("skips language resolution for error content", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "ENOENT",
      truncated: false,
      binary: false,
      size: 0,
      error: "ENOENT",
    });
    ctx.setResolveLanguageId("plaintext");

    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("does not call openTextDocument (preview uses showPreview, not open)", async () => {
    const ctx = fakePickerContext();
    await previewGrepCandidate(aMatch, ctx);

    expect(ctx.openTextDocument).not.toHaveBeenCalled();
  });

  it("swallows a failing resolveLanguageId and falls back to no language", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "content",
      truncated: false,
      binary: false,
      size: 8,
    });
    ctx.resolveLanguageId = vi.fn(async () => {
      throw new Error("resolution failed");
    });

    await previewGrepCandidate(aMatch, ctx);

    // showPreview was called (no throw escaped)
    expect(ctx.showPreview).toHaveBeenCalledOnce();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  // ── Ticket 13 C9: Ctrl+P history containment ─────────────────────
  it("never creates real-file entries — preview path goes through showPreview only (C9)", async () => {
    const ctx = fakePickerContext();
    await previewGrepCandidate(aMatch, ctx);

    // The grep preview must not open a real text document. If it never
    // calls openTextDocument, Quick Open history (Ctrl+P) cannot be
    // polluted by previews.
    expect(ctx.openTextDocument).not.toHaveBeenCalled();

    // It must call showPreview (the virtual preview document path). The
    // host's virtual preview uses a vsconsult-preview:// URI scheme that
    // VS Code does not add to Quick Open history.
    expect(ctx.showPreview).toHaveBeenCalledOnce();
  });

  it("passes the reveal position so the virtual preview scrolls to the match (C9 race-safety)", async () => {
    // Race-safety and teardown-safety (ticket 09): the host guards
    // stale showPreview calls at the host layer. The grep preview
    // just passes the reveal position; the host prevents late writes.
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "line 41\nline 42\nline 43",
      truncated: false,
      binary: false,
      size: 24,
    });

    await previewGrepCandidate(
      { ...aMatch, lineNumber: 42, column: 5 },
      ctx,
    );

    expect(ctx.lastPayload!.reveal).toEqual({ line: 41, character: 4 });
  });
});
