import { describe, expect, it } from "vitest";

import { narrowGrepCandidates } from "./narrow.js";
import type { GrepCandidate } from "../picker/types.js";

function gc(
  id: string,
  label: string,
  relativePath = "src/main.ts",
): GrepCandidate {
  return {
    id,
    label,
    relativePath,
    absolutePath: `/project/${relativePath}`,
    lineNumber: 1,
    column: 1,
  };
}

describe("narrowGrepCandidates", () => {
  it("returns all candidates for an empty query (identity)", () => {
    const candidates = [
      gc("1", "const x = 1;"),
      gc("2", "let y = 2;"),
      gc("3", "return z;"),
    ];

    const result = narrowGrepCandidates("", candidates);
    expect(result).toEqual(candidates);
  });

  it("post-filters candidates whose label contains the query", () => {
    const candidates = [
      gc("1", "function foo() {", "src/a.ts"),
      gc("2", "const bar = 1;", "src/b.ts"),
      gc("3", "  fooBar(x);", "src/c.ts"),
    ];

    // "foo" matches "function foo() {" and "  fooBar(x);" but not "const bar"
    const result = narrowGrepCandidates("foo", candidates);
    expect(result).toHaveLength(2);
    // Both candidates contain "foo", so both appear.
    const labels = result.map((c) => c.label);
    expect(labels).toContain("function foo() {");
    expect(labels).toContain("  fooBar(x);");
  });

  it("sorts best-first by word-boundary fuzzy score on the label", () => {
    const candidates = [
      gc("1", "prefixFoo", "src/a.ts"),       // "foo" inside a word — low score
      gc("2", "foo(x, y)", "src/b.ts"),        // "foo" at a word boundary — high score
      gc("3", "const foo = 42", "src/c.ts"),   // "foo" at a word boundary — high score
    ];

    const result = narrowGrepCandidates("foo", candidates);

    expect(result).toHaveLength(3);
    // Best matches (word-boundary) come first; exact order among boundary
    // matches depends on length/compactness within the tie.
    // "prefixFoo" (no boundary) must rank last.
    expect(result[2].label).toBe("prefixFoo");
  });

  it("has no path bias — only the label matters", () => {
    // Two candidates with the same label but different paths.
    const candidates = [
      gc("1", "const x = 1;", "src/alpha.ts"),
      gc("2", "const x = 1;", "test/beta.ts"),
    ];

    // Identical labels → identical scores → alphabetical tiebreak by
    // label. Path does not influence the score.
    const result = narrowGrepCandidates("const x", candidates);
    expect(result).toHaveLength(2);
    // Both match equally; stable sort preserves input order.
  });

  it("returns empty when no candidate's label matches", () => {
    const candidates = [
      gc("1", "import { foo } from 'bar';"),
    ];

    const result = narrowGrepCandidates("zzz", candidates);
    expect(result).toHaveLength(0);
  });

  it("preserves candidate objects (does not mutate)", () => {
    const candidates = [
      gc("1", "hello world"),
    ];

    const result = narrowGrepCandidates("hello", candidates);
    expect(result[0]).toBe(candidates[0]);
  });
});
