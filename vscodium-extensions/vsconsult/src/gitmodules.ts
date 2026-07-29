/**
 * Extracts `path = ...` values from a .gitmodules file. Each path points at a
 * submodule checkout relative to the repository root.
 */
export function parseGitmodulesPaths(content: string): string[] {
  const paths: string[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    const match = /^path\s*=\s*(.+)$/i.exec(line);
    if (match) {
      paths.push(match[1].trim());
    }
  }
  return paths;
}