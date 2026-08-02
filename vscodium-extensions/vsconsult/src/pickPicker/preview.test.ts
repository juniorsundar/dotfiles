import { describe, expect, it, vi } from "vitest";

import type { PickerContext } from "../picker/context.js";
import type { PickerCandidate } from "../picker/types.js";
import { previewPickCandidate } from "./preview.js";

const aPicker: PickerCandidate = {
  id: "grep",
  label: "Grep",
  description: "Search workspace contents…",
};

function fakeContext(): PickerContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openTextDocument: vi.fn(async () => {
      calls.push("openTextDocument");
    }),
    readFile: vi.fn(async () => ""),
    readPreviewContent: vi.fn(async () => {
      calls.push("readPreviewContent");
      return { text: "", truncated: false, binary: false, size: 0 };
    }),
    showPreview: vi.fn(async () => {
      calls.push("showPreview");
    }),
    closePreview: vi.fn(async () => {
      calls.push("closePreview");
    }),
    revealPosition: vi.fn(() => {
      calls.push("revealPosition");
    }),
    executeCommand: vi.fn(() => {
      calls.push("executeCommand");
      return Promise.resolve();
    }),
    readOrigin: vi.fn(() => undefined),
    startPicker: vi.fn(async () => {
      calls.push("startPicker");
    }),
  };
}

describe("previewPickCandidate", () => {
  it("is a no-op: calls no context primitive and opens no document", async () => {
    const ctx = fakeContext();
    await previewPickCandidate(aPicker, ctx);

    expect(ctx.calls).toEqual([]);
    expect(ctx.showPreview).not.toHaveBeenCalled();
    expect(ctx.openTextDocument).not.toHaveBeenCalled();
    expect(ctx.startPicker).not.toHaveBeenCalled();
  });
});
