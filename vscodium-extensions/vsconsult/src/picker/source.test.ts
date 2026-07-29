import { describe, expect, it } from "vitest";

import type { SourceSession, Source } from "./source.js";

describe("Source contract", () => {
  it("Source is a function that receives a query and returns a SourceSession", () => {
    // Just verify the type shape at runtime: a Source is callable with a string
    // and returns an object shaped like SourceSession
    const source: Source<{ id: string; label: string }> = (_query: string) => ({
      candidates: [{ id: "a", label: "test" }],
    });

    const session = source("test");
    expect(Array.isArray(session.candidates)).toBe(true);
    expect(session.candidates).toHaveLength(1);
    // Snapshot sources have no updates channel
    expect(session.updates).toBeUndefined();
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
    const source: Source<{ id: string; label: string }> = (_query: string) => ({
      candidates: Promise.resolve([{ id: "a", label: "delayed" }]),
    });

    const session = source("q");
    const items = await session.candidates;
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("delayed");
    expect(session.updates).toBeUndefined();
  });
});
