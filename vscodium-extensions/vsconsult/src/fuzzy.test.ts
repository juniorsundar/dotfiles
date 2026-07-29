import { describe, expect, it } from "vitest";

import { rank, score } from "./fuzzy.js";

describe("fuzzy: score — general subsequence scorer", () => {
  it("returns undefined when query characters do not appear in sequence", () => {
    expect(score("xyz", "hello world")).toBeUndefined();
    expect(score("ab", "ba")).toBeUndefined();
  });

  it("returns 0 for an empty query regardless of text", () => {
    expect(score("", "")).toBe(0);
    expect(score("", "hello world")).toBe(0);
  });

  it("returns a positive score when all query characters match in sequence", () => {
    const s = score("hwd", "hello world")!;
    expect(s).toBeGreaterThan(0);
  });

  it("scores contiguous matches higher than dispersed matches", () => {
    const contiguous = score("hel", "hello world")!;
    const dispersed = score("hwd", "hello world")!;
    expect(contiguous).toBeGreaterThan(dispersed);
  });

  it("scores matches at word boundaries higher than inside a word", () => {
    // "w" at the start of "world" (after space) vs "o" inside "hello"
    const atBoundary = score("wo", "hello world")!;
    const insideWord = score("lo", "hello world")!;
    expect(atBoundary).toBeGreaterThan(insideWord);
  });

  it("scores matches close together higher than spread apart", () => {
    const close = score("hw", "hello world")!;
    const spread = score("hd", "hello world")!;
    expect(close).toBeGreaterThan(spread);
  });

  it("ignores whitespace in the query", () => {
    const noSpaces = score("hw", "hello world")!;
    const withSpaces = score("h  w", "hello world")!;
    expect(withSpaces).toBe(noSpaces);
  });

  it("is case-insensitive", () => {
    const lower = score("hw", "Hello World")!;
    const upper = score("HW", "Hello World")!;
    expect(lower).toBe(upper);
  });

  it("matches characters at the very start of text", () => {
    const s = score("he", "hello world")!;
    expect(s).toBeGreaterThan(0);
  });

  it("returns a positive integer for any valid match", () => {
    const s = score("ts", "this is a test sentence")!;
    expect(Number.isInteger(s)).toBe(true);
  });
});

describe("fuzzy: rank — generic rank helper", () => {
  interface Labeled {
    label: string;
  }

  const items: Labeled[] = [
    { label: "alpha/beta/gamma" },
    { label: "beta/alpha" },
    { label: "gamma/beta/alpha" },
    { label: "none" },
  ];

  it("returns items whose textOf matches the query, ranked by descending score", () => {
    const result = rank("alpha", items, (item) => item.label);
    // "alpha/beta/gamma" has "alpha" at the start (boundary bonus), should rank highest
    // "beta/alpha" has "alpha" dispersed further, should rank lower
    // "gamma/beta/alpha" has "alpha" even further dispersed, should rank lower still
    // "none" does not match at all, should be excluded
    expect(result).toHaveLength(3);
    expect(result[0].label).toBe("alpha/beta/gamma");
    expect(result[1].label).toBe("beta/alpha");
    expect(result[2].label).toBe("gamma/beta/alpha");
  });

  it("retains original item identity (reference equality)", () => {
    const result = rank("alpha", items, (item) => item.label);
    expect(result[0]).toBe(items[0]);
    expect(result[1]).toBe(items[1]);
    expect(result[2]).toBe(items[2]);
  });

  it("preserves original order for items with equal scores", () => {
    // Items with identical text for the query to match
    const equalItems = [
      { label: "abc", id: 1 },
      { label: "abc", id: 2 },
      { label: "abc", id: 3 },
    ];
    const result = rank("abc", equalItems, (item) => item.label);
    expect(result.map((item) => item.id)).toEqual([1, 2, 3]);
  });

  it("returns an empty array when no items match", () => {
    const result = rank("xyz", items, (item) => item.label);
    expect(result).toHaveLength(0);
  });

  it("returns all items in original order for an empty query (score = 0)", () => {
    const result = rank("", items, (item) => item.label);
    expect(result).toHaveLength(items.length);
    expect(result.map((item) => item.label)).toEqual([
      "alpha/beta/gamma",
      "beta/alpha",
      "gamma/beta/alpha",
      "none",
    ]);
  });

  it("works with a projection that extracts a different field", () => {
    const objects = [
      { title: "hello world", value: 1 },
      { title: "goodbye world", value: 2 },
    ];
    const result = rank("hello", objects, (item) => item.title);
    expect(result).toHaveLength(1);
    expect(result[0].value).toBe(1);
  });
});
