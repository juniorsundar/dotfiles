import { describe, expect, it } from "vitest";

import { type FileSourcingWorkspace, sourceWorkspaceFiles } from "./fileSourcing.js";
import type { FileCandidate } from "./picker/types.js";

describe("sourceWorkspaceFiles", () => {
  it("produces candidates from workspace files with no excludes", async () => {
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include: string, _exclude: string) => [
        "/home/user/project/src/main.ts",
        "/home/user/project/package.json",
      ],
      readFile: async () => "",
    };

    const results = await sourceWorkspaceFiles(workspace);

    expect(results).toEqual([
      {
        candidate: {
          id: "/home/user/project/src/main.ts",
          label: "main.ts",
          directory: "src",
          relativePath: "src/main.ts",
        } satisfies FileCandidate,
        absPath: "/home/user/project/src/main.ts",
      },
      {
        candidate: {
          id: "/home/user/project/package.json",
          label: "package.json",
          directory: "",
          relativePath: "package.json",
        } satisfies FileCandidate,
        absPath: "/home/user/project/package.json",
      },
    ]);
  });

  it("applies baseline excludes merged with .gitignore, ignoring negated patterns", async () => {
    let capturedExclude: string | undefined;
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include: string, exclude: string) => {
        capturedExclude = exclude;
        return [];
      },
      readFile: async (absPath: string) => {
        if (absPath.endsWith(".gitignore")) {
          return [
            "",
            "# dependencies",
            "vendor/",
            "",
            "!/some/include",
          ].join("\n");
        }
        return "";
      },
    };

    await sourceWorkspaceFiles(workspace);

    expect(capturedExclude).toBeDefined();

    // All 6 baseline excludes are always present
    for (const pattern of [
      "**/.git/**",
      "**/node_modules/**",
      "**/.direnv/**",
      "**/dist/**",
      "**/out/**",
      "**/.cache/**",
    ]) {
      expect(capturedExclude!).toContain(pattern);
    }

    // .gitignore non-negated patterns merged (preserving trailing-slash structure
    // exactly as the original extension.ts does)
    expect(capturedExclude!).toContain("**/vendor//**");
    expect(capturedExclude!).toContain("**/vendor/");

    // .gitignore negated pattern (!/some/include) is excluded
    expect(capturedExclude!).not.toContain("some/include");
  });

  it("excludes .gitmodules submodule paths", async () => {
    let capturedExclude: string | undefined;
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include: string, exclude: string) => {
        capturedExclude = exclude;
        return [];
      },
      readFile: async (absPath: string) => {
        if (absPath.endsWith(".gitmodules")) {
          return [
            '[submodule "vendor/lib"]',
            "\tpath = vendor/lib",
            "\turl = https://example.com/lib.git",
            '[submodule "tools/cli"]',
            "\tpath = tools/cli",
            "\turl = https://example.com/cli.git",
          ].join("\n");
        }
        return "";
      },
    };

    await sourceWorkspaceFiles(workspace);

    expect(capturedExclude).toBeDefined();
    expect(capturedExclude!).toContain("**/vendor/lib/**");
    expect(capturedExclude!).toContain("**/tools/cli/**");
  });
});

describe("sourceWorkspaceFiles — custom excludes provider", () => {
  it("uses the provider's patterns instead of the built-in baseline excludes", async () => {
    let capturedExclude: string | undefined;
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include, exclude) => {
        capturedExclude = exclude;
        return [];
      },
      readFile: async () => "",
      excludesProvider: () => ["**/target/**", "**/.venv/**"],
    };

    await sourceWorkspaceFiles(workspace);

    expect(capturedExclude).toBeDefined();
    expect(capturedExclude).toContain("**/target/**");
    expect(capturedExclude).toContain("**/.venv/**");
    // Built-in baseline excludes are replaced, not merged, when a provider is set.
    expect(capturedExclude).not.toContain("**/node_modules/**");
    expect(capturedExclude).not.toContain("**/.git/**");
  });

  it("falls back to built-in baseline excludes when no provider is supplied", async () => {
    let capturedExclude: string | undefined;
    const workspace: FileSourcingWorkspace = {
      folders: [{ uriPath: "/home/user/project" }],
      findFiles: async (_include, exclude) => {
        capturedExclude = exclude;
        return [];
      },
      readFile: async () => "",
    };

    await sourceWorkspaceFiles(workspace);

    expect(capturedExclude).toContain("**/node_modules/**");
    expect(capturedExclude).toContain("**/.git/**");
  });
});
