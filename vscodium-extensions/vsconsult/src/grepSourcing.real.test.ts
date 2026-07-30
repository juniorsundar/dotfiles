import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { join } from "node:path";
import {
  createSearchWorkspace,
  type RipgrepSpawner,
  type ChildProcessLike,
} from "./grepSourcing.js";

// Integration test with the REAL rg binary and real child_process.spawn.
// Reproduces the runtime path the extension uses (Node 24). This is the
// regression guard for the stdio fix: spawning without explicit
// `stdio: ["ignore", "pipe", "pipe"]` produced no stdout events under
// Node 24, so the stream silently delivered nothing.
function realSpawner(): RipgrepSpawner {
  const rgPath = join(process.cwd(), "dist", "bin", "rg");
  return {
    rgPath,
    spawn: (path, args, opts) =>
      spawn(path, args, opts) as unknown as ChildProcessLike,
  };
}

describe("searchWorkspace — real rg integration (stdio regression guard)", () => {
  it("streams GrepCandidate batches from a real rg run", async () => {
    const searchWorkspace = createSearchWorkspace(realSpawner(), process.cwd(), 30);
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

  it("empty query returns an empty snapshot and never spawns", () => {
    let spawned = false;
    const spawner: RipgrepSpawner = {
      rgPath: join(process.cwd(), "dist", "bin", "rg"),
      spawn: () => {
        spawned = true;
        return {} as unknown as ChildProcessLike;
      },
    };
    const searchWorkspace = createSearchWorkspace(spawner, process.cwd(), 30);
    const session = searchWorkspace("", new AbortController().signal);
    expect(session.candidates).toEqual([]);
    expect(session.updates).toBeUndefined();
    expect(spawned).toBe(false);
  });

  it("aborts an in-flight run without throwing", async () => {
    const searchWorkspace = createSearchWorkspace(realSpawner(), process.cwd(), 30);
    const ctrl = new AbortController();
    const session = searchWorkspace("a", ctrl.signal);
    // Abort before the debounce window elapses so rg is killed early.
    ctrl.abort();

    const batches = [];
    for await (const batch of session.updates!) {
      batches.push(...batch);
    }
    expect(ctrl.signal.aborted).toBe(true);
  }, 15000);
});