import { describe, expect, it, vi } from "vitest";

import type { PickerContext } from "../picker/context.js";
import type { PickerCandidate } from "../picker/types.js";
import { acceptPickCandidate } from "./accept.js";

const aPicker: PickerCandidate = {
  id: "grep",
  label: "Grep",
  description: "Search workspace contents…",
};

function fakeContext(): PickerContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openTextDocument: vi.fn(async (uri: string) => {
      calls.push(`open:${uri}`);
    }),
    readFile: vi.fn(async () => ""),
    readPreviewContent: vi.fn(async () => ({
      text: "",
      truncated: false,
      binary: false,
      size: 0,
    })),
    showPreview: vi.fn(async () => {
      calls.push("showPreview");
    }),
    closePreview: vi.fn(async () => {
      calls.push("closePreview");
    }),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
    startPicker: vi.fn(async (id: string) => {
      calls.push(`startPicker:${id}`);
    }),
  };
}

describe("acceptPickCandidate", () => {
  it("starts the chosen picker via context.startPicker(candidate.id)", async () => {
    const ctx = fakeContext();
    await acceptPickCandidate(aPicker, ctx);

    expect(ctx.startPicker).toHaveBeenCalledOnce();
    expect(ctx.startPicker).toHaveBeenCalledWith("grep");
  });

  it("calls no other context primitive (no lifecycle, no document open)", async () => {
    const ctx = fakeContext();
    await acceptPickCandidate(aPicker, ctx);

    expect(ctx.calls).toEqual(["startPicker:grep"]);
  });
});
