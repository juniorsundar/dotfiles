#!/usr/bin/env node
// Copy the current platform's ripgrep binary (resolved via @vscode/ripgrep)
// into dist/bin/rg so it ships inside the .vsix. The extension resolves rgPath
// at runtime as path.join(__dirname, "bin", "rg") — no node_modules needed.
//
// This ships only the build machine's platform binary. Cross-platform
// distribution would copy every @vscode/ripgrep-* platform package.

import { createRequire } from "node:module";
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = dirname(__dirname);
const destDir = join(projectRoot, "dist", "bin");
const destPath = join(destDir, "rg");

const require = createRequire(import.meta.url);
let rgPath;
try {
  ({ rgPath } = require("@vscode/ripgrep"));
} catch (err) {
  throw new Error(
    `Could not resolve @vscode/ripgrep. Run 'npm install' first.\n  ${err.message}`,
  );
}

await mkdir(destDir, { recursive: true });
await copyFile(rgPath, destPath);
console.log(`copied ${rgPath} -> dist/bin/rg`);