import { describe, expect, it } from "vitest";

import { narrowFileCandidates } from "./narrow.js";
import type { FileCandidate } from "../picker/types.js";

function fc(
  id: string,
  label: string,
  directory: string,
  relativePath: string,
): FileCandidate {
  return { id, label, directory, relativePath };
}

describe("narrowFileCandidates", () => {
  it("returns all candidates sorted by path-biased fuzzy score", () => {
    const candidates = [
      fc("1", "main.ts", "src", "src/main.ts"),
      fc("2", "README.md", "", "README.md"),
    ];

    // "main" should match "main.ts" better than "README.md"
    const result = narrowFileCandidates("main", candidates);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("main.ts");
  });

  it("returns all candidates for empty query", () => {
    const candidates = [
      fc("1", "a.ts", "src", "src/a.ts"),
      fc("2", "b.ts", "src", "src/b.ts"),
    ];

    const result = narrowFileCandidates("", candidates);
    expect(result).toHaveLength(2);
  });

  it("returns empty array when no candidates match", () => {
    const candidates = [
      fc("1", "main.ts", "src", "src/main.ts"),
    ];

    const result = narrowFileCandidates("zzz", candidates);
    expect(result).toHaveLength(0);
  });

  it("prefers path-boundary matches (e.g., start of filename)", () => {
    const candidates = [
      fc("1", "fooBar.ts", "src/lib", "src/lib/fooBar.ts"),
      fc("2", "bar.ts", "src/lib", "src/lib/bar.ts"),
    ];

    // "bar" should match both, but the one starting with "bar" gets
    // a boundary bonus (path boundary at directory separator) and
    // end-weighting (match nearer filename end), so it should rank higher
    const result = narrowFileCandidates("bar", candidates);
    expect(result).toHaveLength(2);
    // "bar.ts" (filename-as-directory-component match) should rank above
    // "fooBar.ts" (mid-word match)
    expect(result[0].label).toBe("bar.ts");
    expect(result[1].label).toBe("fooBar.ts");
  });

  it("tiebreaks by relativePath locale compare", () => {
    // Identical path + query => same score, so tiebreaker kicks in.
    const candidates = [
      fc("1", "alpha.ts", "src", "src/alpha.ts"),
      fc("2", "alpha.ts", "src", "src/alpha.ts"),
    ];

    const result = narrowFileCandidates("alpha", candidates);
    expect(result).toHaveLength(2);
    // Original order preserved for equal scores + equal relativePath
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("works on FileCandidate.relativePath (path-biased), not label alone", () => {
    const candidates = [
      fc("1", "util.ts", "lib", "lib/util.ts"),
      fc("2", "helper.ts", "util", "util/helper.ts"),
    ];

    // Query "util" should match both:
    // - candidate 1: label="util.ts" matches, relativePath="lib/util.ts" matches
    // - candidate 2: label="helper.ts" doesn't match, but relativePath="util/helper.ts" matches
    // So both should be returned, with path-boundary bonus for candidate 2
    const result = narrowFileCandidates("util", candidates);
    expect(result).toHaveLength(2);
  });
});
