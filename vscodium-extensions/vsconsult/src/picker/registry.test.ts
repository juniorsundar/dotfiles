import { describe, expect, it } from "vitest";

import type { Picker, Registry } from "./registry.js";
import { createRegistry } from "./registry.js";
import type { Source } from "./source.js";
import type { RowParts, Candidate } from "./types.js";
import type { PickerContext } from "./context.js";

/** Minimal candidate for contract tests. */
interface TestCandidate extends Candidate {
  extra?: string;
}

/** A noop Source returning empty results. */
const emptySource: Source<TestCandidate> = () => ({ candidates: [] });
const identityNarrow = (_q: string, cs: TestCandidate[]) => cs;
const noopRender = (_c: TestCandidate): RowParts => ({ primary: "" });
const noopAccept = (_c: TestCandidate, _ctx: PickerContext) => {};
const noopPreview = (_c: TestCandidate, _ctx: PickerContext) => {};

describe("Picker interface", () => {
  it("a Picker is a bundle with id, label, placeholder, emptyState, source, narrow, render, accept, preview", () => {
    const picker: Picker<TestCandidate> = {
      id: "test",
      label: "Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source: emptySource,
      narrow: identityNarrow,
      render: noopRender,
      accept: noopAccept,
      preview: noopPreview,
    };

    expect(picker.id).toBe("test");
    expect(picker.label).toBe("Test");
    expect(picker.placeholder).toBe("Search…");
    expect(picker.emptyState).toBe("Nothing found");
    expect(typeof picker.source).toBe("function");
    expect(typeof picker.narrow).toBe("function");
    expect(typeof picker.render).toBe("function");
    expect(typeof picker.accept).toBe("function");
    expect(typeof picker.preview).toBe("function");
  });
});

describe("Picker.queryDriven flag", () => {
  it("is undefined (falsy) for pre-materialized pickers by default", () => {
    const picker: Picker<TestCandidate> = {
      id: "test",
      label: "Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source: emptySource,
      narrow: identityNarrow,
      render: noopRender,
      accept: noopAccept,
      preview: noopPreview,
    };

    expect(picker.queryDriven).toBeUndefined();
  });

  it("can be set to true for query-driven pickers (live-grep, workspace-symbol)", () => {
    const picker: Picker<TestCandidate> = {
      id: "live-grep",
      label: "Live Grep",
      placeholder: "Search pattern…",
      emptyState: "No matches",
      queryDriven: true,
      source: emptySource,
      narrow: identityNarrow,
      render: noopRender,
      accept: noopAccept,
      preview: noopPreview,
    };

    expect(picker.queryDriven).toBe(true);
  });
});

describe("Registry", () => {
  it("registers and retrieves a picker by id", () => {
    const registry = createRegistry();
    const picker: Picker<TestCandidate> = {
      id: "test",
      label: "Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source: emptySource,
      narrow: identityNarrow,
      render: noopRender,
      accept: noopAccept,
      preview: noopPreview,
    };

    registry.register(picker);
    const retrieved = registry.get("test");
    expect(retrieved).toBe(picker);
  });

  it("returns undefined for an unregistered id", () => {
    const registry = createRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("overwrites a previously registered picker on duplicate id", () => {
    const registry = createRegistry();
    const first: Picker<TestCandidate> = {
      id: "dup", label: "Dup", placeholder: "…", emptyState: "none",
      source: emptySource, narrow: identityNarrow,
      render: noopRender, accept: noopAccept, preview: noopPreview,
    };
    const second: Picker<TestCandidate> = {
      id: "dup", label: "Dup", placeholder: "…", emptyState: "none",
      source: emptySource, narrow: identityNarrow,
      render: noopRender, accept: noopAccept, preview: noopPreview,
    };

    registry.register(first);
    registry.register(second);
    expect(registry.get("dup")).toBe(second);
  });
});
