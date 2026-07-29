import { describe, expect, it } from "vitest";

import { parseGitmodulesPaths } from "./gitmodules.js";

describe("parseGitmodulesPaths", () => {
  it("extracts path values from a .gitmodules file", () => {
    const content = `
[submodule "vendor/lib"]
    path = vendor/lib
    url = https://example.com/lib.git
[submodule "tools/cli"]
    path = tools/cli
    url = https://example.com/cli.git
`;
    expect(parseGitmodulesPaths(content)).toEqual(["vendor/lib", "tools/cli"]);
  });

  it("ignores blank lines, comments, and non-path keys", () => {
    const content = `
[submodule "x"]
# a comment
    url = https://example.com/x.git
    path = x
`;
    expect(parseGitmodulesPaths(content)).toEqual(["x"]);
  });

  it("handles an empty file as an empty list", () => {
    expect(parseGitmodulesPaths("")).toEqual([]);
  });
});