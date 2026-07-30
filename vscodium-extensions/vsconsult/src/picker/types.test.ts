import { describe, expect, it } from "vitest";

import type { Candidate, FileCandidate } from "./types.js";

describe("Candidate contract", () => {
  it("has id and label", () => {
    const candidate: Candidate = { id: "abc", label: "test" };
    expect(candidate).toHaveProperty("id");
    expect(candidate).toHaveProperty("label");
  });
});

describe("FileCandidate", () => {
  it("extends Candidate with directory and relativePath", () => {
    const candidate: FileCandidate = {
      id: "/repo/src/main.ts",
      label: "main.ts",
      directory: "src",
      relativePath: "src/main.ts",
    };
    expect(candidate.id).toBe("/repo/src/main.ts");
    expect(candidate.label).toBe("main.ts");
    expect(candidate.directory).toBe("src");
    expect(candidate.relativePath).toBe("src/main.ts");
  });
});
