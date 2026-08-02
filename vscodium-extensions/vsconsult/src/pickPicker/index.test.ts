import { describe, expect, it, vi } from "vitest";

import { createPickPicker } from "./index.js";
import { createRegistry, type Registry, type Picker } from "../picker/registry.js";
import type { PickerContext } from "../picker/context.js";
import type { Source } from "../picker/source.js";
import type { RowParts, Candidate } from "../picker/types.js";

interface TestCandidate extends Candidate {
  extra?: string;
}

const emptySource: Source<TestCandidate> = () => ({ candidates: [] });
const identityNarrow = (_q: string, cs: TestCandidate[]) => cs;
const noopRender = (_c: TestCandidate): RowParts => ({ primary: "" });
const noopAccept = (_c: TestCandidate, _ctx: PickerContext) => {};
const noopPreview = (_c: TestCandidate, _ctx: PickerContext) => {};

/** Registers a stub picker directly so the chooser has others to list. */
function registerStub(
  registry: Registry,
  id: string,
  label: string,
  placeholder: string,
): void {
  const picker: Picker<TestCandidate> = {
    id,
    label,
    placeholder,
    emptyState: "None",
    source: emptySource,
    narrow: identityNarrow,
    render: noopRender,
    accept: noopAccept,
    preview: noopPreview,
  };
  registry.register(picker);
}

const started: string[] = [];
const fakeContext: PickerContext = {
  openTextDocument: vi.fn(async () => {}),
  readFile: vi.fn(async () => ""),
  readPreviewContent: vi.fn(async () => ({
    text: "",
    truncated: false,
    binary: false,
    size: 0,
  })),
  showPreview: vi.fn(async () => {}),
  closePreview: vi.fn(async () => {}),
  revealPosition: vi.fn(),
  executeCommand: vi.fn(),
  readOrigin: vi.fn(() => undefined),
  startPicker: vi.fn(async (id: string) => {
    started.push(id);
  }),
};

describe("pick picker — picker seam", () => {
  it("has all Picker bundle parts including metadata", () => {
    const registry = createRegistry();
    const picker = createPickPicker(registry);
    expect(picker.id).toBe("pick");
    expect(picker.label).toBe("Pick");
    expect(picker.placeholder).toBe("Choose a picker…");
    expect(picker.emptyState).toBe("No matching picker");
    expect(picker.queryDriven).toBeUndefined();
    expect(typeof picker.source).toBe("function");
    expect(typeof picker.narrow).toBe("function");
    expect(typeof picker.render).toBe("function");
    expect(typeof picker.accept).toBe("function");
    expect(typeof picker.preview).toBe("function");
  });

  it("is registered in the registry at assembly time", () => {
    const registry = createRegistry();
    const picker = createPickPicker(registry);
    expect(registry.get("pick")).toBe(picker);
  });

  it("sources the other registered pickers minus itself, sorted alphabetically", async () => {
    const registry = createRegistry();
    registerStub(registry, "grep", "Grep", "Search workspace contents…");
    registerStub(registry, "pick", "Pick", "Choose a picker…");
    registerStub(registry, "file", "File", "Narrow workspace files…");
    const picker = createPickPicker(registry);

    const session = picker.source("", new AbortController().signal);
    expect(session.updates).toBeUndefined();
    const candidates = await session.candidates;

    expect(candidates.map((c) => c.label)).toEqual(["File", "Grep"]);
    expect(candidates[0]).toEqual({
      id: "file",
      label: "File",
      description: "Narrow workspace files…",
    });
  });

  it("narrows with the shared fuzzy primitive and renders row parts", async () => {
    const registry = createRegistry();
    registerStub(registry, "pick", "Pick", "Choose a picker…");
    registerStub(registry, "grep", "Grep", "Search workspace contents…");
    registerStub(registry, "file", "File", "Narrow workspace files…");
    const picker = createPickPicker(registry);

    const candidates = await picker
      .source("", new AbortController().signal)
      .candidates;

    const narrowed = picker.narrow("fi", candidates);
    expect(narrowed.map((c) => c.id)).toEqual(["file"]);

    const parts = picker.render(narrowed[0]);
    expect(parts).toEqual({
      primary: "File",
      secondary: "Narrow workspace files…",
      tooltip: "file",
    });
  });

  it("accept starts the chosen picker via context.startPicker(candidate.id)", async () => {
    const registry = createRegistry();
    registerStub(registry, "pick", "Pick", "Choose a picker…");
    registerStub(registry, "grep", "Grep", "Search workspace contents…");
    registerStub(registry, "file", "File", "Narrow workspace files…");
    const picker = createPickPicker(registry);

    const candidates = await picker
      .source("", new AbortController().signal)
      .candidates;
    started.length = 0;
    vi.clearAllMocks();

    await picker.accept(candidates[0], fakeContext);
    expect(fakeContext.startPicker).toHaveBeenCalledOnce();
    expect(fakeContext.startPicker).toHaveBeenCalledWith(candidates[0].id);
    expect(started).toEqual([candidates[0].id]);
  });

  it("preview is a no-op: no context primitive is called", async () => {
    const registry = createRegistry();
    registerStub(registry, "pick", "Pick", "Choose a picker…");
    registerStub(registry, "file", "File", "Narrow workspace files…");
    const picker = createPickPicker(registry);
    const candidates = await picker
      .source("", new AbortController().signal)
      .candidates;
    expect(candidates).toHaveLength(1);

    started.length = 0;
    vi.clearAllMocks();

    await picker.preview(candidates[0], fakeContext);
    expect(fakeContext.showPreview).not.toHaveBeenCalled();
    expect(fakeContext.openTextDocument).not.toHaveBeenCalled();
    expect(fakeContext.startPicker).not.toHaveBeenCalled();
  });
});
