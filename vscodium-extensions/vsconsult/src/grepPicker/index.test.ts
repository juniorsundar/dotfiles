import { describe, expect, it, vi, beforeEach } from "vitest";

import { createGrepPicker } from "./index.js";
import { createRegistry } from "../picker/registry.js";
import type { PickerContext } from "../picker/context.js";
import type { GrepCandidate } from "../picker/types.js";
import type { SourceSession } from "../picker/source.js";

const aCandidate: GrepCandidate = {
  id: "src/main.ts:42:5",
  label: "  const x = 1;",
  relativePath: "src/main.ts",
  absolutePath: "/project/src/main.ts",
  lineNumber: 42,
  column: 5,
};

describe("grep picker — picker seam", () => {
  const registry = createRegistry();

  const fakeSearchWorkspace = vi.fn(
    (_query: string, _signal: AbortSignal): SourceSession<GrepCandidate> => ({
      candidates: [aCandidate],
    }),
  );

  // Reset mocks before each test so call counts don't leak between tests.
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function fakeContext(): PickerContext & {
    openTextDocument: ReturnType<typeof vi.fn>;
    readFile: ReturnType<typeof vi.fn>;
    readPreviewContent: ReturnType<typeof vi.fn>;
    showPreview: ReturnType<typeof vi.fn>;
    closePreview: ReturnType<typeof vi.fn>;
    revealPosition: ReturnType<typeof vi.fn>;
    executeCommand: ReturnType<typeof vi.fn>;
    readOrigin: ReturnType<typeof vi.fn>;
  } {
    return {
      openTextDocument: vi.fn(async () => {}),
      readFile: vi.fn(async () => ""),
      readPreviewContent: vi.fn(async () => ({
        text: "line 42: const x = 1;",
        truncated: false,
        binary: false,
        size: 32,
      })),
      showPreview: vi.fn(async () => {}),
      closePreview: vi.fn(async () => {}),
      revealPosition: vi.fn(),
      executeCommand: vi.fn(),
      readOrigin: vi.fn(() => undefined),
      startPicker: vi.fn(async () => {}),
    };
  }

  it("has all Picker bundle parts including metadata", () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    expect(picker.id).toBe("grep");
    expect(picker.label).toBe("Grep");
    expect(picker.placeholder).toBe("Search workspace contents…");
    expect(picker.emptyState).toBe("No matches");
    expect(typeof picker.source).toBe("function");
    expect(typeof picker.narrow).toBe("function");
    expect(typeof picker.render).toBe("function");
    expect(typeof picker.accept).toBe("function");
    expect(typeof picker.preview).toBe("function");
  });

  it("is queryDriven so the host re-runs the source on every query change", () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    expect(picker.queryDriven).toBe(true);
  });

  it("registers itself with the registry", () => {
    const reg = createRegistry();
    createGrepPicker(fakeSearchWorkspace, reg);
    expect(reg.get("grep")).toBeDefined();
  });

  it("source delegates to the injected searchWorkspace", () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    const signal = new AbortController().signal;
    const session = picker.source("needle", signal);

    expect(fakeSearchWorkspace).toHaveBeenCalledWith("needle", signal);
    expect(session.candidates).toEqual([aCandidate]);
  });

  it("narrow is identity for empty query", () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    const candidates = [aCandidate];
    expect(picker.narrow("", candidates)).toBe(candidates);
  });

  it("render produces primary/secondary/tooltip from a GrepCandidate", () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    const parts = picker.render(aCandidate);

    expect(parts.primary).toBe("const x = 1;");
    expect(parts.secondary).toBe("src/main.ts:42");
    expect(parts.tooltip).toBe("/project/src/main.ts");
  });

  it("accept opens the matched file at the match position", async () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    const ctx = fakeContext();
    await picker.accept(aCandidate, ctx);

    expect(ctx.openTextDocument).toHaveBeenCalledWith(
      aCandidate.absolutePath,
      { preview: false },
    );
    expect(ctx.revealPosition).toHaveBeenCalledWith(
      aCandidate.absolutePath,
      { line: aCandidate.lineNumber - 1, character: aCandidate.column - 1 },
    );
  });

  it("preview shows bounded content scrolled to the match line", async () => {
    const picker = createGrepPicker(fakeSearchWorkspace, registry);
    const ctx = fakeContext();
    await picker.preview(aCandidate, ctx);

    expect(ctx.showPreview).toHaveBeenCalledOnce();
    expect(ctx.readPreviewContent).toHaveBeenCalledWith(
      aCandidate.absolutePath,
    );
    const callArg = ctx.showPreview.mock.calls[0][0];
    expect(callArg.reveal).toEqual({
      line: aCandidate.lineNumber - 1,
      character: aCandidate.column - 1,
    });
    expect(callArg.title).toBe(aCandidate.relativePath);
  });

  // ── Ticket 13 C11: End-to-end pipeline ─────────────────────────────
  describe("end-to-end grep picker pipeline (C11)", () => {
    it("source → narrow → render → preview → accept flows correctly", async () => {
      const ctx = fakeContext();
      const picker = createGrepPicker(fakeSearchWorkspace, registry);

      // 1. Source produces candidates for a query.
      const signal = new AbortController().signal;
      const session = picker.source("needle", signal);
      expect(fakeSearchWorkspace).toHaveBeenCalledWith("needle", signal);

      // 2. Source session yields candidates.
      const candidates = Array.isArray(session.candidates)
        ? session.candidates
        : await session.candidates;
      expect(candidates.length).toBeGreaterThan(0);

      // 3. Narrow post-filters candidates by the query.
      const narrowed = picker.narrow("const x", candidates);
      expect(narrowed.length).toBeGreaterThan(0);

      // 4. Render projects a narrowed candidate into RowParts.
      const parts = picker.render(narrowed[0]);
      expect(parts.primary).toBeTruthy();
      expect(parts.secondary).toMatch(/:\d+$/);
      expect(parts.tooltip).toBeTruthy();

      // 5. Preview reads bounded content and shows virtual preview.
      await picker.preview(narrowed[0], ctx);
      expect(ctx.readPreviewContent).toHaveBeenCalledOnce();
      expect(ctx.showPreview).toHaveBeenCalledOnce();
      const previewArg = ctx.showPreview.mock.calls[0][0];
      expect(previewArg.reveal).toBeDefined();

      // 6. Accept opens the file for real at the match position.
      await picker.accept(narrowed[0], ctx);
      expect(ctx.openTextDocument).toHaveBeenCalledWith(
        narrowed[0].absolutePath,
        { preview: false },
      );
      expect(ctx.revealPosition).toHaveBeenCalledWith(
        narrowed[0].absolutePath,
        { line: narrowed[0].lineNumber - 1, character: narrowed[0].column - 1 },
      );
    });

    it("streaming source delivers incremental batches", async () => {
      const b1: GrepCandidate = {
        ...aCandidate,
        id: "a.ts:1:1",
        label: "first match",
      };
      const b2: GrepCandidate = {
        ...aCandidate,
        id: "b.ts:2:2",
        label: "second match",
      };

      async function* stream() {
        yield [b1];
        yield [b2];
      }

      const streamingSearchWorkspace = vi.fn(
        (): SourceSession<GrepCandidate> => ({
          candidates: [],
          updates: stream(),
        }),
      );
      const r = createRegistry();
      const picker = createGrepPicker(streamingSearchWorkspace, r);

      const session = picker.source("stream", new AbortController().signal);
      expect(session.candidates).toEqual([]);
      expect(session.updates).toBeDefined();

      const batches: GrepCandidate[][] = [];
      for await (const batch of session.updates!) {
        batches.push(batch);
      }
      expect(batches).toHaveLength(2);
      expect(batches[0][0].label).toBe("first match");
      expect(batches[1][0].label).toBe("second match");
    });

    it("empty query is forwarded by the source adapter to searchWorkspace", () => {
      const picker = createGrepPicker(fakeSearchWorkspace, registry);
      const session = picker.source("", new AbortController().signal);
      expect(fakeSearchWorkspace).toHaveBeenCalledWith("", expect.any(AbortSignal));
    });
  });
});
