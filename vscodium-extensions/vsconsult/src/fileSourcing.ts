import * as path from "node:path";

import type { FileCandidate } from "./picker/types.js";

/** A file-source candidate paired with its absolute filesystem path. */
export interface FileSourceResult {
  candidate: FileCandidate;
  absPath: string;
}
import { parseGitmodulesPaths } from "./gitmodules.js";

export interface WorkspaceFolder {
  uriPath: string;
}

export interface FileSourcingWorkspace {
  folders: WorkspaceFolder[];
  findFiles: (include: string, exclude: string) => Promise<string[]>;
  readFile: (absPath: string) => Promise<string>;
  /**
   * Optional provider of exclude glob patterns, read at sourcing time.
   * When supplied, these replace the built-in baseline excludes; when
   * omitted, the built-in `defaultExcludes` apply. The provider is a
   * function so live configuration changes take effect on the next picker
   * invocation.
   */
  excludesProvider?: () => readonly string[];
}

/**
 * Normalizes a workspace-folder uriPath by stripping any trailing slash so
 * downstream path construction is consistent.
 */
function normalizeUriPath(raw: string): string {
  return raw.endsWith("/") ? raw.slice(0, -1) : raw;
}

/**
 * Strips the longest-matching workspace-folder root prefix from an absolute
 * path to produce a forward-slash-delimited relative path.
 */
function toRelativePath(absPath: string, folders: WorkspaceFolder[]): string {
  let best: string | undefined;
  for (const folder of folders) {
    const prefix = `${normalizeUriPath(folder.uriPath)}/`;
    if (absPath.startsWith(prefix)) {
      const rest = absPath.slice(prefix.length);
      if (!best || rest.length < best.length) {
        best = rest;
      }
    }
  }
  return best ?? absPath.replaceAll("\\", "/");
}

/**
 * Sources workspace-file candidates from the injected workspace capabilities.
 *
 * Applies baseline excludes merged with per-folder .gitignore and .gitmodules
 * contents. Negated `.gitignore` patterns (`!`) are ignored (excludes are
 * monotonic), and `.gitmodules` submodule paths are excluded.
 */
export async function sourceWorkspaceFiles(
  workspace: FileSourcingWorkspace,
): Promise<FileSourceResult[]> {
  const { folders, findFiles, readFile } = workspace;
  const normalizedFolders = folders.map((f) => ({
    ...f,
    uriPath: normalizeUriPath(f.uriPath),
  }));

  const excludePattern = await buildExcludePattern(normalizedFolders, readFile, workspace.excludesProvider?.() ?? defaultExcludes);
  const absPaths = await findFiles("**/*", excludePattern);

  return absPaths.map((absPath) => {
    const relativePath = toRelativePath(absPath, normalizedFolders);
    const name = path.posix.basename(relativePath);
    const directory = path.posix.dirname(relativePath);
    return {
      candidate: {
        id: absPath,
        label: name,
        directory: directory === "." ? "" : directory,
        relativePath,
      },
      absPath,
    };
  });
}

/**
 * Baseline excludes applied even when no .gitignore is present. Mirrors the
 * kinds of paths users almost never want to pick.
 */
const defaultExcludes = [
  "**/.git/**",
  "**/node_modules/**",
  "**/.direnv/**",
  "**/dist/**",
  "**/out/**",
  "**/.cache/**",
];

async function buildExcludePattern(
  folders: WorkspaceFolder[],
  readFile: (absPath: string) => Promise<string>,
  baselineExcludes: readonly string[],
): Promise<string> {
  const patterns = [...baselineExcludes];

  for (const folder of folders) {
    try {
      const content = await readFile(`${folder.uriPath}/.gitignore`); // folder.uriPath is already normalized
      for (const rawLine of content.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (line.length === 0 || line.startsWith("#") || line.startsWith("!")) {
          continue;
        }
        patterns.push(line.startsWith("/") ? `**${line}/**` : `**/${line}/**`);
        patterns.push(line.startsWith("/") ? `**${line}` : `**/${line}`);
      }
    } catch {
      // No .gitignore in this folder; defaults still apply.
    }

    try {
      const content = await readFile(`${folder.uriPath}/.gitmodules`); // folder.uriPath is already normalized
      const submodulePaths = parseGitmodulesPaths(content);
      for (const subPath of submodulePaths) {
        patterns.push(
          subPath.startsWith("/") ? `**${subPath}/**` : `**/${subPath}/**`,
        );
      }
    } catch {
      // No .gitmodules in this folder.
    }
  }

  return `{${patterns.join(",")}}`;
}
