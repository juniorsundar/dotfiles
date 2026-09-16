/**
 * direnv environment loader for the OpenCode V2 plugin API.
 *
 * Port of `@simonwjackson/opencode-direnv` (which only implements the V1 plugin
 * API and cannot run in V2).
 *
 * Behaviour:
 * - On load, finds the nearest `.envrc` from the project directory up to the git
 *   root.
 * - Runs `direnv export json` in the directory that owns the `.envrc`.
 * - Injects the exported variables into every spawned shell command through the
 *   `shell.create.before` hook, and into `process.env` for other child processes.
 * - Skips silently when `direnv` or `.envrc` is absent, and warns when the
 *   `.envrc` is blocked (needs `direnv allow`).
 *
 * V2 exposes no server-side toast (toasts belong to CLI/TUI plugins), so status
 * is reported with `console.log`/`console.warn`, which land in the server log.
 */

import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Stable plugin id: identifies this plugin in status and diagnostics. */
const ID = "direnv";

/** Resolve the git root for `directory`, or null when it is not a repository. */
async function findGitRoot(directory) {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "--show-toplevel"], {
      cwd: directory,
    });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** Walk up from `startDir` to `stopAt` looking for a `.envrc`. */
function findEnvrc(startDir, stopAt) {
  const boundary = stopAt || "/";
  let current = startDir;

  while (true) {
    const candidate = join(current, ".envrc");
    if (existsSync(candidate)) return candidate;

    if (current === boundary || current === "/") return null;

    const parent = dirname(current);
    // Guard against an infinite loop at the filesystem root.
    if (parent === current) return null;

    current = parent;
  }
}

/** Load the direnv environment for `directory`. Never throws. */
async function loadDirenv(directory) {
  const gitRoot = await findGitRoot(directory);
  const envrcPath = findEnvrc(directory, gitRoot);

  if (!envrcPath) return { envVars: null, blocked: false, envrcPath: null };

  try {
    const { stdout } = await execFileAsync("direnv", ["export", "json"], {
      cwd: dirname(envrcPath),
      maxBuffer: 10 * 1024 * 1024,
    });
    const text = stdout.trim();
    return {
      envVars: text ? JSON.parse(text) : null,
      blocked: false,
      envrcPath,
    };
  } catch (error) {
    const stderr =
      error && typeof error.stderr === "string" ? error.stderr : "";
    return { envVars: null, blocked: stderr.includes("is blocked"), envrcPath };
  }
}

export default {
  id: ID,

  async setup(ctx) {
    const directory = ctx.location.directory;

    let envVars = null;
    try {
      const result = await loadDirenv(directory);

      if (result.blocked) {
        console.warn(
          `direnv: ${result.envrcPath} is blocked. Run \`direnv allow\` to enable it.`,
        );
      } else if (result.envVars) {
        envVars = result.envVars;
        // Child processes (LSP, MCP servers, ...) inherit these too.
        Object.assign(process.env, envVars);
        console.log(`direnv: loaded environment from ${result.envrcPath}`);
      }
    } catch (error) {
      console.warn(`direnv: failed to load environment: ${error?.message ?? error}`);
    }

    if (!envVars) return;

    // `shell.create.before` is the V2 replacement for the V1 `shell.env` hook.
    // The callback must stay synchronous, so the environment is resolved above.
    await ctx.shell.hook("create.before", (event) => {
      for (const [key, value] of Object.entries(envVars)) {
        if (typeof value === "string") event.env[key] = value;
      }
    });
  },
};
