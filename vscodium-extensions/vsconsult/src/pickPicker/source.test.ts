import { describe, expect, it } from "vitest";

import type { Picker } from "../picker/registry.js";
import { createRegistry, type Registry } from "../picker/registry.js";
import type { Source } from "../picker/source.js";
import type { PickerContext } from "../picker/context.js";
import type { RowParts, Candidate } from "../picker/types.js";
import { createPickSource } from "./source.js";

interface TestCandidate extends Candidate {
  extra?: string;
}

const emptySource: Source<TestCandidate> = () => ({ candidates: [] });
const identityNarrow = (_q: string, cs: TestCandidate[]) => cs;
const noopRender = (_c: TestCandidate): RowParts => ({ primary: "" });
const noopAccept = (_c: TestCandidate, _ctx: PickerContext) => {};
const noopPreview = (_c: TestCandidate, _ctx: PickerContext) => {};

function registerPicker(
  registry: Registry,
  id: string,
  label: string,
  placeholder: string,
): Picker<TestCandidate> {
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
  return picker;
}

describe("createPickSource", () => {
  it("is a snapshot source: query-agnostic and no updates channel", async () => {
    const registry = createRegistry();
    registerPicker(registry, "file", "File", "Narrow workspace files…");
    registerPicker(registry, "grep", "Grep", "Search workspace contents…");
    const source = createPickSource(registry, "pick");

    // Any query (or empty) yields the same snapshot.
    const session = source("", new AbortController().signal);
    expect(session.updates).toBeUndefined();
    const candidates = await session.candidates;
    expect(candidates).toHaveLength(2);
  });

  it("excludes the chooser's own id", async () => {
    const registry = createRegistry();
    registerPicker(registry, "pick", "Pick", "Choose a picker…");
    registerPicker(registry, "file", "File", "Narrow workspace files…");
    const source = createPickSource(registry, "pick");

    const candidates = await source("", new AbortController().signal).candidates;
    expect(candidates.map((c) => c.id)).toEqual(["file"]);
  });

  it("sorts alphabetically by label independent of registration order", async () => {
    const registry = createRegistry();
    registerPicker(registry, "zebra", "Zebra", "Z…");
    registerPicker(registry, "grep", "Grep", "G…");
    registerPicker(registry, "file", "File", "F…");
    registerPicker(registry, "pick", "Pick", "P…");
    const source = createPickSource(registry, "pick");

    const candidates = await source("", new AbortController().signal).candidates;
    expect(candidates.map((c) => c.label)).toEqual(["File", "Grep", "Zebra"]);
  });

  it("maps PickerCandidate fields from the registered picker", async () => {
    const registry = createRegistry();
    registerPicker(registry, "pick", "Pick", "Choose a picker…");
    registerPicker(registry, "file", "File", "Narrow workspace files…");
    const source = createPickSource(registry, "pick");

    const candidates = await source("", new AbortController().signal).candidates;
    expect(candidates[0]).toEqual({
      id: "file",
      label: "File",
      description: "Narrow workspace files…",
    });
  });

  it("returns an empty snapshot when only the chooser is registered", async () => {
    const registry = createRegistry();
    registerPicker(registry, "pick", "Pick", "Choose a picker…");
    const source = createPickSource(registry, "pick");

    const candidates = await source("", new AbortController().signal).candidates;
    expect(candidates).toEqual([]);
  });
});
