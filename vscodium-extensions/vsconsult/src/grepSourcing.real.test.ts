import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  createSearchWorkspace,
  type RipgrepSpawner,
  type ChildProcessLike,
} from "./grepSourcing.js";

// Real-rg stdio regression guard. Spawning without explicit
// `stdio: ["ignore", "pipe", "pipe"]` produced no stdout events under
// Node 24, so the stream silently delivered nothing. This single test
// reproduces the real spawn path (real rg binary, real child_process.spawn)
// and asserts matches actually stream out of stdout.
//
// The empty-query and abort cases that used to live here are covered more
// thoroughly by the fake-child-process tests in grepSourcing.test.ts; this
// file keeps only the stdio guard because only a real child process
// reproduces the Node 24 stdio bug.
//
// Needs the rg binary at dist/bin/rg, which `npm run build:rg` copies.
// `npm run package` runs build:rg before test so the binary is present; if
// it is ever missing (e.g. running `vitest` alone on a clean tree), this
// describe block skips rather than hanging on ENOENT.
function realSpawner(): RipgrepSpawner {
  const rgPath = join(process.cwd(), "dist", "bin", "rg");
  return {
    rgPath,
    spawn: (path, args, opts) =>
      spawn(path, args, opts) as unknown as ChildProcessLike,
  };
}

const rgAvailable = existsSync(join(process.cwd(), "dist", "bin", "rg"));

describe.runIf(rgAvailable)("searchWorkspace — real rg stdio regression guard", () => {
  it("streams GrepCandidate batches from a real rg run", async () => {
    const searchWorkspace = createSearchWorkspace(realSpawner(), process.cwd());
    const ctrl = new AbortController();
    const session = searchWorkspace("activate", ctrl.signal);

    expect(session.updates).toBeDefined();
    const batches = [];
    for await (const batch of session.updates!) {
      batches.push(...batch);
    }

    expect(batches.length).toBeGreaterThan(0);
    expect(batches.some((c) => c.relativePath.includes("extension.ts"))).toBe(true);
    const first = batches[0];
    expect(first.label).toBeTruthy();
    expect(first.lineNumber).toBeGreaterThan(0);
    expect(first.absolutePath).toContain("/");
  }, 15000);
});