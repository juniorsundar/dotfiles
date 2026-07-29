import { describe, expect, it } from "vitest";

import { renderFileCandidate } from "./render.js";
import type { FileCandidate } from "../picker/types.js";

describe("renderFileCandidate", () => {
  it("produces RowParts from a FileCandidate", () => {
    const candidate: FileCandidate = {
      id: "/project/src/main.ts",
      label: "main.ts",
      name: "main.ts",
      directory: "src",
      relativePath: "src/main.ts",
    };

    const parts = renderFileCandidate(candidate);

    expect(parts.primary).toBe("main.ts");
    expect(parts.secondary).toBe("src");
  });

  it("uses empty string for root-level directory", () => {
    const candidate: FileCandidate = {
      id: "/project/README.md",
      label: "README.md",
      name: "README.md",
      directory: "",
      relativePath: "README.md",
    };

    const parts = renderFileCandidate(candidate);

    expect(parts.primary).toBe("README.md");
    expect(parts.secondary).toBe("");
  });
});
