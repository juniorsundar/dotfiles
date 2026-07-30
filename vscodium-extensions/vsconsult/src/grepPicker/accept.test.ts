import { describe, expect, it, vi } from "vitest";

import { acceptGrepCandidate } from "./accept.js";
import type { PickerContext } from "../picker/context.js";
import type { GrepCandidate } from "../picker/types.js";

const aMatch: GrepCandidate = {
  id: "src/main.ts:42:5",
  label: "  const x = 1;",
  relativePath: "src/main.ts",
  absolutePath: "/project/src/main.ts",
  lineNumber: 42,
  column: 5,
};

function fakeContext(): PickerContext & {
  calls: string[];
  openedDoc: { uri: string; preview: boolean } | undefined;
  revealedPos: { uri: string; line: number; character: number } | undefined;
} {
  const calls: string[] = [];
  let openedDoc: { uri: string; preview: boolean } | undefined;
  let revealedPos:
    | { uri: string; line: number; character: number }
    | undefined;

  return {
    calls,
    get openedDoc() {
      return openedDoc;
    },
    get revealedPos() {
      return revealedPos;
    },
    openTextDocument: vi.fn(async (uri: string, options?: { preview?: boolean }) => {
      calls.push(`open:${uri}`);
      openedDoc = { uri, preview: options?.preview ?? false };
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
    revealPosition: vi.fn(
      (uri: string, position: { line: number; character: number }) => {
        calls.push(`reveal:${uri}`);
        revealedPos = { uri, line: position.line, character: position.character };
      },
    ),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
  };
}

describe("acceptGrepCandidate", () => {
  it("opens the file with preview: false and reveals at the match line and column", async () => {
    const ctx = fakeContext();
    await acceptGrepCandidate(aMatch, ctx);

    expect(ctx.openTextDocument).toHaveBeenCalledOnce();
    expect(ctx.openTextDocument).toHaveBeenCalledWith(
      aMatch.absolutePath,
      { preview: false },
    );

    expect(ctx.revealPosition).toHaveBeenCalledOnce();
    expect(ctx.revealPosition).toHaveBeenCalledWith(
      aMatch.absolutePath,
      { line: 41, character: 4 },
    );
  });

  it("uses the same absolutePath for both openTextDocument and revealPosition", async () => {
    const ctx = fakeContext();
    const match = { ...aMatch, absolutePath: "/other/file.ts" };
    await acceptGrepCandidate(match, ctx);

    expect(ctx.openedDoc!.uri).toBe("/other/file.ts");
    expect(ctx.revealedPos!.uri).toBe("/other/file.ts");
  });

  it("does not perform lifecycle (no restore, no panel logic)", async () => {
    const ctx = fakeContext();
    await acceptGrepCandidate(aMatch, ctx);

    // Only openTextDocument and revealPosition — host owns lifecycle.
    expect(ctx.calls).toEqual([
      `open:${aMatch.absolutePath}`,
      `reveal:${aMatch.absolutePath}`,
    ]);
  });

  it("converts 1-based line/column to 0-based editor coordinates", async () => {
    const ctx = fakeContext();
    const match: GrepCandidate = {
      ...aMatch,
      lineNumber: 1,
      column: 1,
    };
    await acceptGrepCandidate(match, ctx);

    expect(ctx.revealedPos!.line).toBe(0);
    expect(ctx.revealedPos!.character).toBe(0);
  });
});
