import { describe, expect, it } from "vitest";

import { buildPickerConfig, shapeCandidateRows } from "./protocol.js";
import type { Picker } from "../picker/registry.js";
import type { Candidate, RowParts } from "../picker/types.js";

// ---------------------------------------------------------------------------
// Fake test picker (satisfies the full Picker interface)
// ---------------------------------------------------------------------------

interface TestCandidate extends Candidate {
  extra: string;
}

const fakePicker: Picker<TestCandidate> = {
  id: "test",
  label: "Test Picker",
  placeholder: "Search test items…",
  emptyState: "No test items found",
  source: () => ({ candidates: [] }),
  narrow: (_q, cs) => cs,
  render: (c: TestCandidate): RowParts => ({
    primary: c.label,
    secondary: c.extra,
  }),
  accept: () => {},
  preview: () => {},
};

// ---------------------------------------------------------------------------
// buildPickerConfig
// ---------------------------------------------------------------------------

describe("buildPickerConfig", () => {
  it("derives a PickerConfig from a picker", () => {
    const config = buildPickerConfig(fakePicker);

    expect(config).toEqual({
      id: "test",
      label: "Test Picker",
      placeholder: "Search test items…",
      emptyState: "No test items found",
    });
  });
});

// ---------------------------------------------------------------------------
// shapeCandidateRows
// ---------------------------------------------------------------------------

describe("shapeCandidateRows", () => {
  it("maps candidates to row messages via picker.render", () => {
    const candidates: TestCandidate[] = [
      { id: "1", label: "Alpha", extra: "detail A" },
      { id: "2", label: "Beta", extra: "detail B" },
    ];

    const rows = shapeCandidateRows(fakePicker, candidates);

    expect(rows).toEqual([
      { id: "1", primary: "Alpha", secondary: "detail A" },
      { id: "2", primary: "Beta", secondary: "detail B" },
    ]);
  });

  it("preserves icon and tooltip when present", () => {
    const pickerWithDetails: Picker<TestCandidate> = {
      ...fakePicker,
      render: (c: TestCandidate): RowParts => ({
        primary: c.label,
        secondary: c.extra,
        icon: "file.svg",
        tooltip: c.id,
      }),
    };

    const candidates: TestCandidate[] = [
      { id: "3", label: "Gamma", extra: "" },
    ];

    const rows = shapeCandidateRows(pickerWithDetails, candidates);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({
      id: "3",
      primary: "Gamma",
      secondary: "",
      icon: "file.svg",
      tooltip: "3",
    });
  });
});
