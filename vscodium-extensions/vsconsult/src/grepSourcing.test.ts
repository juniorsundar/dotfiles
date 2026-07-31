import { describe, expect, it, vi } from "vitest";

import type { SourceSession } from "./picker/source.js";
import type { GrepCandidate } from "./picker/types.js";
import {
  type RipgrepSpawner,
  type ChildProcessLike,
  createSearchWorkspace,
} from "./grepSourcing.js";

/**
 * A minimal fake child process whose stdout emits pre-canned lines and
 * that closes immediately after writing them.
 */
class FakeChildProcess implements ChildProcessLike {
  private dataCb: ((chunk: Buffer) => void) | undefined;
  private closeCb:
    | ((code: number | null, signal: string | null) => void)
    | undefined;

  stdout = {
    on: (
      _event: "data",
      cb: (chunk: Buffer) => void,
    ): void => {
      this.dataCb = cb;
    },
  };

  stderr = {
    on: () => {
      // no-op — stderr content is ignored in these tests
    },
  };

  on(
    event: "close",
    cb: (code: number | null, signal: string | null) => void,
  ): void {
    this.closeCb = cb;
  }

  killed = false;
  kill(): void {
    this.killed = true;
  }

  /**
   * Feed a synthetic rg --json line to the child's stdout handler.
   * The test calls this, then calls close() to signal completion.
   */
  emitLine(line: string): void {
    if (this.dataCb) this.dataCb(Buffer.from(line + "\n", "utf8"));
  }

  close(code = 0): void {
    if (this.closeCb) this.closeCb(code, null);
  }
}

describe("searchWorkspace — empty query", () => {
  it("returns an empty snapshot and never spawns", () => {
    let spawnCalled = false;
    const spawner: RipgrepSpawner = {
      rgPath: "/fake/rg",
      spawn: () => {
        spawnCalled = true;
        throw new Error("spawn must not be called for empty query");
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace");
    const session: SourceSession<GrepCandidate> = searchWorkspace(
      "",
      new AbortController().signal,
    );

    // Snapshot source: candidates is synchronously an empty array.
    expect(session.candidates).toEqual([]);
    expect(session.updates).toBeUndefined();
    expect(spawnCalled).toBe(false);
  });
});

describe("searchWorkspace — streaming parsed rg --json matches", () => {
  it("parses match objects into GrepCandidate batches streamed through updates", async () => {
    // Pre-canned rg --json lines: two matches across two files, plus a
    // non-match "begin" event that the parser must skip.
    const lines = [
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "src/main.ts" },
          lines: { text: "function greet() {" },
          line_number: 42,
          submatches: [{ match: { text: "greet" }, start: 9, end: 14 }],
        },
      }),
      JSON.stringify({
        type: "begin",
        data: { path: { text: "should-be-skipped.ts" } },
      }),
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "lib/utils.ts" },
          lines: { text: "  const x = 1;" },
          line_number: 88,
          submatches: [{ match: { text: "const" }, start: 2, end: 7 }],
        },
      }),
    ];

    const child = new FakeChildProcess();
    const spawned: { args: string[]; cwd: string }[] = [];
    const spawner: RipgrepSpawner = {
      rgPath: "/fake/rg",
      spawn: (_rgPath, args, opts) => {
        spawned.push({ args, cwd: opts.cwd });
        // Emit lines asynchronously — match order matters.
        queueMicrotask(() => {
          for (const line of lines) child.emitLine(line);
          child.close(0);
        });
        return child;
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace", [
      "**/node_modules/**",
      "**/.git/**",
    ]);
    const session: SourceSession<GrepCandidate> = searchWorkspace(
      "greet",
      new AbortController().signal,
    );

    expect(session.updates).toBeDefined();

    // Collect batches from the updates async iterable.
    const batches: GrepCandidate[][] = [];
    const iter = session.updates!;
    // Cast to AsyncGenerator to satisfy iterator protocol — our
    // wrapper returns a plain async iterable.
    for await (const batch of iter as AsyncIterable<GrepCandidate[]>) {
      batches.push(batch);
    }

    // We expect two candidates (non-match "begin" is filtered).
    // The implementation may batch them or emit one per batch — the
    // contract allows any batching; we flatten for assertion.
    const flat = batches.flat();
    expect(flat).toHaveLength(2);

    // Candidate 1: src/main.ts:42:10 — "function greet() {"
    expect(flat[0]).toEqual({
      id: "src/main.ts:42:10",
      label: "function greet() {",
      relativePath: "src/main.ts",
      absolutePath: "/workspace/src/main.ts",
      lineNumber: 42,
      column: 10,
    } satisfies GrepCandidate);

    // Candidate 2: lib/utils.ts:88:3 — "  const x = 1;"
    expect(flat[1]).toEqual({
      id: "lib/utils.ts:88:3",
      label: "  const x = 1;",
      relativePath: "lib/utils.ts",
      absolutePath: "/workspace/lib/utils.ts",
      lineNumber: 88,
      column: 3,
    } satisfies GrepCandidate);

    // The spawner was called with the correct args.
    expect(spawned).toHaveLength(1);
    expect(spawned[0].args).toContain("--json");
    expect(spawned[0].args).toContain("greet");
    // Exclude globs are passed as --glob !<pattern>.
    expect(spawned[0].args).toContain("--glob");
    expect(spawned[0].args).toContain("!**/node_modules/**");
    expect(spawned[0].args).toContain("!**/.git/**");
    expect(spawned[0].cwd).toBe("/workspace");
  });
});

describe("searchWorkspace — abort propagation", () => {
  it("kills the child process and stops yielding batches on abort", async () => {
    const child = new FakeChildProcess();

    const spawner: RipgrepSpawner = {
      rgPath: "/fake/rg",
      spawn: (_rgPath, _args, _opts) => {
        // Emit one line asynchronously, then do NOT close — the
        // stream stays open so the test can abort mid-stream.
        queueMicrotask(() => {
          child.emitLine(
            JSON.stringify({
              type: "match",
              data: {
                path: { text: "src/main.ts" },
                lines: { text: "line1" },
                line_number: 1,
                submatches: [{ match: { text: "x" }, start: 0, end: 1 }],
              },
            }),
          );
        });
        return child;
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace");
    const ac = new AbortController();
    const session = searchWorkspace("query", ac.signal);

    expect(session.updates).toBeDefined();

    // Collect batches.
    const batches: GrepCandidate[][] = [];
    const collected = (async () => {
      for await (const batch of session.updates! as AsyncIterable<GrepCandidate[]>) {
        batches.push(batch);
      }
    })();

    // With debounce 0, the first batch arrives after the microtask
    // spawn emits.
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(batches).toHaveLength(1);
    expect(child.killed).toBe(false);

    // Emit a second batch synchronously — it will be enqueued.
    // Then abort immediately. The queued batch must be discarded.
    child.emitLine(
      JSON.stringify({
        type: "match",
        data: {
          path: { text: "src/main.ts" },
          lines: { text: "line2" },
          line_number: 2,
          submatches: [{ match: { text: "y" }, start: 0, end: 1 }],
        },
      }),
    );
    ac.abort();
    await new Promise<void>((r) => setTimeout(r, 20));

    expect(child.killed).toBe(true);

    // The stream should complete after abort.
    await collected;
    // Only the first batch — the second was queued then discarded.
    expect(batches).toHaveLength(1);
  });
});

describe("searchWorkspace — no debounce (preempt immediately)", () => {
  it("spawns immediately on every call — no debounce coalescing", async () => {
    // Preemption is owned by the host (it aborts the previous run's
    // signal before calling the source). The source therefore spawns
    // rg right away on every call rather than waiting out a debounce
    // window while stale results linger.
    const spawnedQueries: string[] = [];
    const spawner: RipgrepSpawner = {
      rgPath: "/fake/rg",
      spawn: (_rgPath, args, _opts) => {
        spawnedQueries.push(args[args.length - 1]);
        const child = new FakeChildProcess();
        queueMicrotask(() => child.close(0));
        return child;
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace");

    // Rapid keystrokes — three queries in quick succession. Each spawns
    // its own child as soon as its updates iterator is consumed (no timer
    // to advance). Consume all three.
    const s1 = searchWorkspace("a", new AbortController().signal);
    const s2 = searchWorkspace("ab", new AbortController().signal);
    const s3 = searchWorkspace("abc", new AbortController().signal);

    const drain = async (s: ReturnType<typeof searchWorkspace>) => {
      for await (const _batch of s.updates! as AsyncIterable<GrepCandidate[]>) {
        void _batch;
      }
    };
    await Promise.all([drain(s1), drain(s2), drain(s3)]);

    // Each call spawned its own child immediately — no coalescing.
    expect(spawnedQueries).toHaveLength(3);
    expect(spawnedQueries).toEqual(["a", "ab", "abc"]);
  });
});

describe("searchWorkspace — binary not found", () => {
  it("errors when rgPath is unavailable, never spawns", () => {
    const spawner: RipgrepSpawner = {
      rgPath: null as unknown as string, // binary unavailable
      spawn: () => {
        throw new Error("must not spawn");
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace");

    expect(() =>
      searchWorkspace("query", new AbortController().signal),
    ).toThrow(/ripgrep/);
  });

  it("still returns empty snapshot for empty query even when binary is missing", () => {
    const spawner: RipgrepSpawner = {
      rgPath: null as unknown as string,
      spawn: () => {
        throw new Error("must not spawn");
      },
    };

    const searchWorkspace = createSearchWorkspace(spawner, "/workspace");
    const session = searchWorkspace("", new AbortController().signal);

    expect(session.candidates).toEqual([]);
    expect(session.updates).toBeUndefined();
  });
});
