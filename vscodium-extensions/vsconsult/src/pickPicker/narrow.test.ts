import { describe, expect, it } from "vitest";

import type { PickerCandidate } from "../picker/types.js";
import { narrowPickCandidates } from "./narrow.js";

const candidates: PickerCandidate[] = [
  { id: "file", label: "File", description: "Narrow workspace files…" },
  { id: "grep", label: "Grep", description: "Search workspace contents…" },
];

describe("narrowPickCandidates", () => {
  it("narrows by label with the shared fuzzy primitive — 'fi' → File, 'gr' → Grep", () => {
    expect(narrowPickCandidates("fi", candidates).map((c) => c.id)).toEqual([
      "file",
    ]);
    expect(narrowPickCandidates("gr", candidates).map((c) => c.id)).toEqual([
      "grep",
    ]);
  });

  it("matches case-insensitively", () => {
    expect(narrowPickCandidates("FIL", candidates).map((c) => c.id)).toEqual([
      "file",
    ]);
  });

  it("matches on the label anywhere (no path/field bias) — 're' matches Grep", () => {
    expect(narrowPickCandidates("re", candidates).map((c) => c.id)).toEqual([
      "grep",
    ]);
  });

  it("returns all candidates for an empty query, preserving source order", () => {
    expect(narrowPickCandidates("", candidates).map((c) => c.id)).toEqual([
      "file",
      "grep",
    ]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(narrowPickCandidates("zzz", candidates)).toEqual([]);
  });

  it("ranks better matches first", () => {
    const ranked: PickerCandidate[] = [
      { id: "file", label: "File", description: "F…" },
      { id: "difficult", label: "Difficult", description: "D…" },
      { id: "grep", label: "Grep", description: "G…" },
    ];
    // 'File' matches 'fi' contiguously at a word start; 'Difficult' matches
    // with a gap. 'Grep' does not match at all and is excluded.
    expect(narrowPickCandidates("fi", ranked).map((c) => c.id)).toEqual([
      "file",
      "difficult",
    ]);
  });
});
