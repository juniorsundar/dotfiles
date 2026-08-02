import { describe, expect, it, vi } from "vitest";

import type { PickerContext } from "../picker/context.js";
import type { PreviewContent } from "../host/previewContent.js";
import { previewFileCandidate } from "./preview.js";
import type { FileCandidate } from "../picker/types.js";

// ---------------------------------------------------------------------------
// Host-level behavioral coverage (ticket 08 criterion 7).
//
// These tests exercise the file picker's public preview action through the
// PickerContext seam — the path a user hits — and assert the displayed
// showPreview payload reflects the content policy. They verify behavior
// (what the user sees), not implementation details.
// ---------------------------------------------------------------------------

const aFileCandidate = (
  relativePath: string,
  id = `/project/${relativePath}`,
): FileCandidate => ({
  id,
  label: relativePath.split("/").pop()!,
  directory: relativePath.includes("/")
    ? relativePath.slice(0, relativePath.lastIndexOf("/"))
    : "",
  relativePath,
});

function fakePickerContext(): PickerContext & {
  lastPayload: { text: string; title: string; languageId?: string } | undefined;
  setPreviewContent: (c: PreviewContent) => void;
  setResolveLanguageId: (id: string | undefined) => void;
} {
  let lastPayload: { text: string; title: string; languageId?: string } | undefined;
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
    readPreviewContent: vi.fn(async () => nextContent),
    resolveLanguageId: vi.fn(async () => nextLanguageId),
    showPreview: vi.fn(async (p: { text: string; title: string; languageId?: string }) => {
      lastPayload = p;
    }),
    closePreview: vi.fn(async () => {}),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
    startPicker: vi.fn(async () => {}),
  };
}

describe("file picker preview action — behavioral payload", () => {
  it("appends the truncation notice to the displayed body for a large file", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "A".repeat(512 * 1024),
      truncated: true,
      binary: false,
      size: 1024 * 1024 + 4096,
      truncationNotice: "… [truncated — showing first 524288 bytes of 1052672]",
    });

    await previewFileCandidate(aFileCandidate("huge.txt"), ctx);

    expect(ctx.showPreview).toHaveBeenCalledOnce();
    expect(ctx.lastPayload!.title).toBe("huge.txt");
    // The truncation notice is composed into the body the user sees.
    expect(ctx.lastPayload!.text).toMatch(/truncat/i);
    expect(ctx.lastPayload!.text).toContain("524288");
  });

  it("uses the binary fallback as the body, not raw bytes", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "Binary file — no text preview available.\nPath: /project/asset.bin\nSize: 4096 bytes",
      truncated: false,
      binary: true,
      size: 4096,
    });

    await previewFileCandidate(aFileCandidate("asset.bin"), ctx);

    expect(ctx.lastPayload!.text).toMatch(/binary/i);
    expect(ctx.lastPayload!.text).not.toContain("\x00");
  });

  it("uses the error message as the body when a read fails, without throwing", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "ENOENT: no such file",
      truncated: false,
      binary: false,
      size: 0,
      error: "ENOENT: no such file",
    });

    await expect(
      previewFileCandidate(aFileCandidate("missing.txt"), ctx),
    ).resolves.toBeUndefined();
    expect(ctx.lastPayload!.text).toContain("no such file");
  });

  it("displays the content verbatim for an ordinary small file", async () => {
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "export function add(a, b) { return a + b; }\n",
      truncated: false,
      binary: false,
      size: 40,
    });

    await previewFileCandidate(aFileCandidate("src/add.ts"), ctx);

    expect(ctx.lastPayload!.text).toBe("export function add(a, b) { return a + b; }\n");
  });

  it("still shows a truncation marker when truncated is set but no notice is provided", async () => {
    // Guards the silent-fallthrough: a truncated result must never look
    // like the complete file, even if the notice is missing.
    const ctx = fakePickerContext();
    ctx.setPreviewContent({
      text: "A".repeat(512 * 1024),
      truncated: true,
      binary: false,
      size: 1024 * 1024 + 4096,
    });

    await previewFileCandidate(aFileCandidate("huge2.txt"), ctx);

    expect(ctx.lastPayload!.text).toMatch(/truncat/i);
  });

  // ---------------------------------------------------------------------
  // Ticket 10 — language mode tests
  // ---------------------------------------------------------------------

  it("passes the resolved languageId to showPreview for a known normal file", async () => {
    // Criterion 1: a .ts file gets TypeScript highlighting.
    const ctx = fakePickerContext();
    ctx.setResolveLanguageId("typescript");
    ctx.setPreviewContent({
      text: "const x: number = 1;\n",
      truncated: false,
      binary: false,
      size: 22,
    });

    await previewFileCandidate(aFileCandidate("src/main.ts"), ctx);

    // The picker action called resolveLanguageId with the candidate's absolute path.
    expect(ctx.resolveLanguageId).toHaveBeenCalledWith("/project/src/main.ts");
    // The resolved id was forwarded to showPreview.
    expect(ctx.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ languageId: "typescript" }),
    );
  });

  it("skips language resolution for binary content — undamaged preview", async () => {
    // Criterion 2 (safe fallback): binary candidates use plain text.
    const ctx = fakePickerContext();
    ctx.setResolveLanguageId("should-not-be-called");
    ctx.setPreviewContent({
      text: "Binary file — no text preview available.\nPath: /project/asset.bin\nSize: 4096 bytes",
      truncated: false,
      binary: true,
      size: 4096,
    });

    await previewFileCandidate(aFileCandidate("asset.bin"), ctx);

    // resolveLanguageId must NOT be called — binary content skips resolution.
    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    // The payload must not carry a languageId (plaintext fallback).
    expect(ctx.showPreview).toHaveBeenCalledWith(
      expect.objectContaining({ title: "asset.bin" }),
    );
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("skips language resolution for a truncated preview — plaintext fallback", async () => {
    // Criterion 2 (safe fallback): large/truncated files skip language to avoid
    // loading the full file via openTextDocument. They use plain text.
    const ctx = fakePickerContext();
    ctx.setResolveLanguageId("should-not-be-called");
    ctx.setPreviewContent({
      text: "A".repeat(512 * 1024),
      truncated: true,
      binary: false,
      size: 1024 * 1024 + 4096,
    });

    await previewFileCandidate(aFileCandidate("huge.ts"), ctx);

    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("skips language resolution for an error preview — preview survives", async () => {
    // A stat/read/decode failure must not break previewing.
    const ctx = fakePickerContext();
    ctx.setResolveLanguageId("should-not-be-called");
    ctx.setPreviewContent({
      text: "ENOENT: no such file",
      truncated: false,
      binary: false,
      size: 0,
      error: "ENOENT: no such file",
    });

    await previewFileCandidate(aFileCandidate("missing.ts"), ctx);

    // Avoids a pointless openTextDocument on a non-existent path.
    expect(ctx.resolveLanguageId).not.toHaveBeenCalled();
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("passes undefined languageId when resolveLanguageId returns undefined", async () => {
    // VSCodium has no language association for the candidate; the resolver
    // returns undefined. The picker forwards undefined — plaintext fallback.
    const ctx = fakePickerContext();
    ctx.setResolveLanguageId(undefined);
    ctx.setPreviewContent({
      text: "some unknown format\n",
      truncated: false,
      binary: false,
      size: 19,
    });

    await previewFileCandidate(aFileCandidate("config.xyz"), ctx);

    // resolveLanguageId WAS called — we asked, VSCodium said "no association".
    expect(ctx.resolveLanguageId).toHaveBeenCalledWith("/project/config.xyz");
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });

  it("does not break when resolveLanguageId throws — preview survives", async () => {
    const ctx = fakePickerContext();
    // Simulate a misbehaving resolver.
    vi.mocked(ctx.resolveLanguageId!).mockRejectedValueOnce(new Error("boom"));
    ctx.setPreviewContent({
      text: "const x = 1;\n",
      truncated: false,
      binary: false,
      size: 13,
    });

    await expect(
      previewFileCandidate(aFileCandidate("main.ts"), ctx),
    ).resolves.toBeUndefined();

    // The preview was still shown — languageId is undefined (safe fallback).
    expect(ctx.lastPayload!.text).toContain("const x");
    expect(ctx.lastPayload!.languageId).toBeUndefined();
  });
});