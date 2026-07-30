import { describe, expect, it, vi } from "vitest";

import { createGrepSource } from "./source.js";
import type { SourceSession } from "../picker/source.js";
import type { GrepCandidate } from "../picker/types.js";

/**
 * A fake searchWorkspace that records its (query, signal) arguments and
 * returns a pre-canned SourceSession<GrepCandidate>. Tests control what
 * the primary source yields and assert the grep source adapter forwards
 * calls verbatim.
 */
function fakeSearchWorkspace(opts?: {
  session?: SourceSession<GrepCandidate>;
}): {
  searchWorkspace: ReturnType<typeof vi.fn>;
  lastArgs: () => { query: string; signal: AbortSignal } | undefined;
} {
  const last: { query: string; signal: AbortSignal }[] = [];
  const session: SourceSession<GrepCandidate> = opts?.session ?? {
    candidates: [],
  };
  const fn = vi.fn((_query: string, _signal: AbortSignal) => {
    last.push({ query: _query, signal: _signal });
    return session;
  });
  return { searchWorkspace: fn, lastArgs: () => last[last.length - 1] };
}

const aCandidate: GrepCandidate = {
  id: "src/main.ts:42:5",
  label: "  const x = 1;",
  relativePath: "src/main.ts",
  absolutePath: "/project/src/main.ts",
  lineNumber: 42,
  column: 5,
};

describe("grep Source", () => {
  it("forwards the query and signal to the injected searchWorkspace", () => {
    const { searchWorkspace, lastArgs } = fakeSearchWorkspace();
    const source = createGrepSource(searchWorkspace);

    const signal = new AbortController().signal;
    source("hello", signal);

    expect(searchWorkspace).toHaveBeenCalledOnce();
    expect(lastArgs()!.query).toBe("hello");
    expect(lastArgs()!.signal).toBe(signal);
  });

  it("returns the SourceSession verbatim from searchWorkspace", () => {
    const session: SourceSession<GrepCandidate> = {
      candidates: [aCandidate, aCandidate],
    };
    const { searchWorkspace } = fakeSearchWorkspace({ session });
    const source = createGrepSource(searchWorkspace);

    const result = source("needle", new AbortController().signal);
    expect(result).toBe(session);
    expect(result.candidates).toHaveLength(2);
  });

  it("returns a session with only candidates when searchWorkspace returns snapshot-style", () => {
    const session: SourceSession<GrepCandidate> = {
      candidates: [aCandidate],
    };
    const { searchWorkspace } = fakeSearchWorkspace({ session });
    const source = createGrepSource(searchWorkspace);

    const result = source("test", new AbortController().signal);
    expect(result).toBe(session);
    expect(Array.isArray(result.candidates)).toBe(true);
  });

  it("passes through the updates iterable when searchWorkspace returns a stream", async () => {
    const updates = (async function* () {
      yield [aCandidate];
    })();
    const session: SourceSession<GrepCandidate> = {
      candidates: [],
      updates,
    };
    const { searchWorkspace } = fakeSearchWorkspace({ session });
    const source = createGrepSource(searchWorkspace);

    const result = source("stream", new AbortController().signal);
    expect(result).toBe(session);
    expect(result.updates).toBe(updates);

    // Collect from the stream to verify it's the real iterable.
    const batches: GrepCandidate[][] = [];
    for await (const batch of result.updates!) {
      batches.push(batch);
    }
    expect(batches).toHaveLength(1);
    expect(batches[0][0].label).toBe(aCandidate.label);
  });
});
