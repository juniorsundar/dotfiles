import { describe, expect, it } from "vitest";

import type { Candidate, FileCandidate, GrepCandidate } from "./types.js";

describe("Candidate contract", () => {
  it("has id and label", () => {
    const candidate: Candidate = { id: "abc", label: "test" };
    expect(candidate).toHaveProperty("id");
    expect(candidate).toHaveProperty("label");
  });
});

describe("FileCandidate", () => {
  it("has id, label, relativePath, absolutePath, lineNumber, and column", () => {
    const candidate: GrepCandidate = {
      id: "src/main.ts:42:5",
      label: "function greet() {",
      relativePath: "src/main.ts",
      absolutePath: "/home/user/project/src/main.ts",
      lineNumber: 42,
      column: 5,
    };
    expect(candidate.id).toBe("src/main.ts:42:5");
    expect(candidate.label).toBe("function greet() {");
    expect(candidate.relativePath).toBe("src/main.ts");
    expect(candidate.absolutePath).toBe("/home/user/project/src/main.ts");
    expect(candidate.lineNumber).toBe(42);
    expect(candidate.column).toBe(5);
  });

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
