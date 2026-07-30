import { describe, expect, it, beforeEach, vi } from "vitest";

import { createFilePicker } from "./index.js";
import { createRegistry } from "../picker/registry.js";
import type { PickerContext } from "../picker/context.js";
import type { FileSourcingWorkspace } from "../fileSourcing.js";

describe("file picker — picker seam", () => {
  /** A fake workspace with two files. */
  const workspace: FileSourcingWorkspace = {
    folders: [{ uriPath: "/home/user/project" }],
    findFiles: async () => [
      "/home/user/project/src/alpha.ts",
      "/home/user/project/src/beta.js",
      "/home/user/project/README.md",
    ],
    readFile: async () => "",
  };

  /** PickerContext with a spy on openTextDocument. */
  const opened: string[] = [];
  const previewOpened: string[] = [];
  const fakeContext: PickerContext = {
    openTextDocument: vi.fn(async (uri: string, options?: { preview?: boolean }) => {
      if (options?.preview) {
        previewOpened.push(uri);
      } else {
        opened.push(uri);
      }
    }),
    revealPosition: vi.fn(),
    executeCommand: vi.fn(),
    readOrigin: vi.fn(() => undefined),
  };

  const registry = createRegistry();

  beforeEach(() => {
    opened.length = 0;
    previewOpened.length = 0;
  });

  it("has all Picker bundle parts including metadata", () => {
    const picker = createFilePicker(workspace, registry);
    expect(picker.id).toBe("file");
    expect(picker.label).toBe("File");
    expect(picker.placeholder).toBe("Narrow workspace files…");
    expect(picker.emptyState).toBe("No matching workspace files");
    expect(typeof picker.source).toBe("function");
    expect(typeof picker.narrow).toBe("function");
    expect(typeof picker.render).toBe("function");
    expect(typeof picker.accept).toBe("function");
    expect(typeof picker.preview).toBe("function");
  });

  it("sources -> narrows -> renders -> accepts end-to-end", async () => {
    const picker = createFilePicker(workspace, registry);

    // Source — snapshot session, all candidates
    const session = picker.source("", new AbortController().signal);
    const allCandidates = await session.candidates;
    expect(allCandidates).toHaveLength(3);
    expect(allCandidates[0].label).toBe("alpha.ts");
    expect(allCandidates[0].relativePath).toBe("src/alpha.ts");

    // Narrow — filter and rank by query
    const narrowed = picker.narrow("alpha", allCandidates);
    expect(narrowed).toHaveLength(1);
    expect(narrowed[0].label).toBe("alpha.ts");

    // Render — project to RowParts
    const parts = picker.render(narrowed[0]);
    expect(parts.primary).toBe("alpha.ts");
    expect(parts.secondary).toBe("src");

    // Accept — open the document, no lifecycle
    await picker.accept(narrowed[0], fakeContext);
    expect(opened).toEqual([narrowed[0].id]);
    // Context was only called for openTextDocument
    expect(fakeContext.openTextDocument).toHaveBeenCalledOnce();
    expect(fakeContext.revealPosition).not.toHaveBeenCalled();
    expect(fakeContext.executeCommand).not.toHaveBeenCalled();
  });

  it("preview opens with preview flag", async () => {
    const picker = createFilePicker(workspace, registry);
    const session = picker.source("", new AbortController().signal);
    const allCandidates = await session.candidates;
    const narrowed = picker.narrow("beta", allCandidates);

    await picker.preview(narrowed[0], fakeContext);
    expect(previewOpened).toEqual([narrowed[0].id]);
    expect(opened).toEqual([]);
  });

  it("is registered in the registry at assembly time", () => {
    const r = createRegistry();
    const picker = createFilePicker(workspace, r);
    const retrieved = r.get("file");
    expect(retrieved).toBe(picker);
  });
});
