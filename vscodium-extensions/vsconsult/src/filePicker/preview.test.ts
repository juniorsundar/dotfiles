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
  lastPayload: { text: string; title: string } | undefined;
  setPreviewContent: (c: PreviewContent) => void;
} {
  let lastPayload: { text: string; title: string } | undefined;
  let nextContent: PreviewContent = {
    text: "",
    truncated: false,
    binary: false,
    size: 0,
  };
  return {
    get lastPayload() {
      return lastPayload;
    },
    setPreviewContent(c) {
      nextContent = c;
    },
    openTextDocument: vi.fn(async () => {}),
    readFile: vi.fn(async () => ""),
    readPreviewContent: vi.fn(async () => nextContent),
    showPreview: vi.fn(async (p: { text: string; title: string }) => {
      lastPayload = p;
    }),
    closePreview: vi.fn(async () => {}),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
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
});