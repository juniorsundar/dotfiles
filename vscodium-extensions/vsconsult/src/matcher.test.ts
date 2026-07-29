import { describe, expect, it } from "vitest";

import { type Candidate, rankCandidates, scorePath } from "./matcher.js";

const candidates: Candidate[] = [
  {
    id: "src/picker/provider.ts",
    name: "provider.ts",
    directory: "src/picker",
    relativePath: "src/picker/provider.ts",
  },
  {
    id: "test/picker.test.ts",
    name: "picker.test.ts",
    directory: "test",
    relativePath: "test/picker.test.ts",
  },
  {
    id: "src/extension.ts",
    name: "extension.ts",
    directory: "src",
    relativePath: "src/extension.ts",
  },
];

describe("scorePath", () => {
  it("matches fuzzy query fragments across the full relative path", () => {
    expect(scorePath("pkr ts", "src/picker/provider.ts")).toBeTypeOf("number");
    expect(scorePath("pkr ts", "src/extension.ts")).toBeUndefined();
  });

  it("accepts an empty query", () => {
    expect(scorePath("", "src/picker/provider.ts")).toBe(0);
  });
});

describe("rankCandidates", () => {
  it("narrows candidates and returns the strongest match first", () => {
    const ranked = rankCandidates("picker test", candidates);

    expect(ranked.map(({ relativePath }) => relativePath)).toEqual([
      "test/picker.test.ts",
    ]);
  });

  it("uses relative path order for a deterministic empty-query list", () => {
    const ranked = rankCandidates("", candidates);

    expect(ranked.map(({ relativePath }) => relativePath)).toEqual([
      "src/extension.ts",
      "src/picker/provider.ts",
      "test/picker.test.ts",
    ]);
  });
});
