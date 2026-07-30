import { describe, expect, it } from "vitest";

import type { SourceSession, Source } from "./source.js";

describe("Source contract", () => {
  it("Source is a function that receives a query and signal, and returns a SourceSession", () => {
    const source: Source<{ id: string; label: string }> = (
      _query: string,
      _signal: AbortSignal,
    ) => ({
      candidates: [{ id: "a", label: "test" }],
    });

    const session = source("test", new AbortController().signal);
    expect(Array.isArray(session.candidates)).toBe(true);
    expect(session.candidates).toHaveLength(1);
    // Snapshot sources have no updates channel
    expect(session.updates).toBeUndefined();
  });

  it("stream source can carry an AsyncIterable updates channel", () => {
    async function* gen(): AsyncGenerator<{ id: string; label: string }[]> {
      yield [{ id: "1", label: "batch1" }];
      yield [{ id: "2", label: "batch2" }];
    }

    const source: Source<{ id: string; label: string }> = (
      _query: string,
      _signal: AbortSignal,
    ) => ({
      candidates: [],
      updates: gen(),
    });

    const session = source("test", new AbortController().signal);
    expect(session.candidates).toEqual([]);
    expect(session.updates).toBeDefined();
  });
});

describe("SourceSession", () => {
  it("snapshot session has candidates and no updates channel", () => {
    const session: SourceSession<{ id: string; label: string }> = {
      candidates: [{ id: "abc", label: "hello" }],
    };

    expect(session.candidates).toHaveLength(1);
    expect(session.updates).toBeUndefined();
  });

  it("works with async candidates (Promise branch)", async () => {
    const source: Source<{ id: string; label: string }> = (
      _query: string,
      _signal: AbortSignal,
    ) => ({
      candidates: Promise.resolve([{ id: "a", label: "delayed" }]),
    });

    const session = source("q", new AbortController().signal);
    const items = await session.candidates;
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("delayed");
    expect(session.updates).toBeUndefined();
  });
});
