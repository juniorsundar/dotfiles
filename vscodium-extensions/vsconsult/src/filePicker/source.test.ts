import { describe, expect, it } from "vitest";

import { createFileSource } from "./source.js";
import type { FileSourcingWorkspace } from "../fileSourcing.js";

describe("file Source", () => {
  it("returns a snapshot SourceSession with candidates and no updates", async () => {
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async () => [
        "/home/user/project/src/main.ts",
        "/home/user/project/package.json",
      ],
      readFile: async () => "",
    };

    const fileSource = createFileSource(workspace);
    const session = fileSource("");

    // Must be a promise-based session (sourceWorkspaceFiles is async)
    const candidates = await session.candidates;
    expect(candidates).toHaveLength(2);
    expect(candidates[0].label).toBe("main.ts");
    expect(candidates[0].name).toBe("main.ts");
    expect(candidates[0].directory).toBe("src");
    expect(candidates[0].relativePath).toBe("src/main.ts");
    expect(candidates[1].label).toBe("package.json");
    expect(candidates[1].directory).toBe("");
    expect(session.updates).toBeUndefined();
  });

  it("ignores the query (file picker is a snapshot source)", async () => {
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async () => ["/home/user/project/src/main.ts"],
      readFile: async () => "",
    };

    const fileSource = createFileSource(workspace);
    const sessionA = fileSource("");
    const sessionB = fileSource("some-query");

    const candidatesA = await sessionA.candidates;
    const candidatesB = await sessionB.candidates;
    expect(candidatesA).toEqual(candidatesB);
  });

  it("applies gitignore excludes and still returns candidates", async () => {
    let capturedExclude: string | undefined;
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include: string, exclude: string) => {
        capturedExclude = exclude;
        return ["/home/user/project/keep.ts"];
      },
      readFile: async (absPath: string) => {
        if (absPath.endsWith(".gitignore")) {
          return "vendor/\nnode_modules/";
        }
        return "";
      },
    };

    const fileSource = createFileSource(workspace);
    const session = fileSource("");
    const candidates = await session.candidates;

    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe("keep.ts");
    // The exclude pattern includes gitignore-derived patterns
    expect(capturedExclude).toBeDefined();
    expect(capturedExclude).toContain("**/node_modules");
  });
});
