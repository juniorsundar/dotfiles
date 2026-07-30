import { describe, expect, it } from "vitest";

import { renderGrepCandidate } from "./render.js";
import type { GrepCandidate } from "../picker/types.js";

function gc(overrides: Partial<GrepCandidate> = {}): GrepCandidate {
  return {
    id: "src/main.ts:42:5",
    label: "  const x = 1;",
    relativePath: "src/main.ts",
    absolutePath: "/project/src/main.ts",
    lineNumber: 42,
    column: 5,
    ...overrides,
  };
}

describe("renderGrepCandidate", () => {
  it("produces RowParts from a GrepCandidate", () => {
    const parts = renderGrepCandidate(gc());

    expect(parts.primary).toBe("const x = 1;");
    expect(parts.secondary).toBe("src/main.ts:42");
    expect(parts.tooltip).toBe("/project/src/main.ts");
    expect(parts.icon).toBeUndefined();
  });

  it("trims leading whitespace from the matched line for primary", () => {
    const parts = renderGrepCandidate(
      gc({ label: "\t\t  return value;" }),
    );

    expect(parts.primary).toBe("return value;");
  });

  it("preserves leading whitespace in the trimmed line for indented matches", () => {
    const parts = renderGrepCandidate(
      gc({ label: "    function foo() {" }),
    );

    // Leading indentation is stripped; the rest stays.
    expect(parts.primary).toBe("function foo() {");
  });

  it("shows relativePath and lineNumber in secondary", () => {
    const parts = renderGrepCandidate(
      gc({ relativePath: "lib/util.ts", lineNumber: 99 }),
    );

    expect(parts.secondary).toBe("lib/util.ts:99");
  });

  it("uses absolutePath as the tooltip", () => {
    const parts = renderGrepCandidate(
      gc({ absolutePath: "/home/user/work/lib/util.ts" }),
    );

    expect(parts.tooltip).toBe("/home/user/work/lib/util.ts");
  });
});
