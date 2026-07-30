import { describe, expect, it, vi } from "vitest";

import type { PickerContext } from "../picker/context.js";
import { acceptFileCandidate } from "./accept.js";
import { previewFileCandidate } from "./preview.js";
import type { FileCandidate } from "../picker/types.js";

const aFile: FileCandidate = {
  id: "/project/src/main.ts",
  label: "main.ts",
  directory: "src",
  relativePath: "src/main.ts",
};

function fakeContext(): PickerContext & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    openTextDocument: vi.fn(async (uri: string) => {
      calls.push(`open:${uri}`);
    }),
    readFile: vi.fn(async () => ""),
    showPreview: vi.fn(async () => {
      calls.push("showPreview");
    }),
    closePreview: vi.fn(async () => {
      calls.push("closePreview");
    }),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
  };
}

describe("acceptFileCandidate", () => {
  it("opens the document at the candidate's id (absPath)", async () => {
    const ctx = fakeContext();
    await acceptFileCandidate(aFile, ctx);

    expect(ctx.openTextDocument).toHaveBeenCalledOnce();
    expect(ctx.openTextDocument).toHaveBeenCalledWith(aFile.id);
  });

  it("does not perform lifecycle (no restore, no panel logic)", async () => {
    const ctx = fakeContext();
    await acceptFileCandidate(aFile, ctx);

    // Accept only calls openTextDocument — no lifecycle
    expect(ctx.calls).toEqual([`open:${aFile.id}`]);
  });
});

describe("previewFileCandidate", () => {
  it("calls showPreview with the file content, not openTextDocument", async () => {
    const ctx = fakeContext();
    await previewFileCandidate(aFile, ctx);

    expect(ctx.showPreview).toHaveBeenCalledOnce();
    expect(ctx.openTextDocument).not.toHaveBeenCalled();
  });

  it("does not perform lifecycle (only showPreview)", async () => {
    const ctx = fakeContext();
    await previewFileCandidate(aFile, ctx);

    expect(ctx.calls).toEqual(["showPreview"]);
  });
});
