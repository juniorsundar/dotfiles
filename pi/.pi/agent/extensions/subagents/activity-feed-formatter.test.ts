import { describe, it, expect } from "vitest";
import { formatActivityFeed } from "./activity-feed-formatter";

function makeEvent(
  overrides: Partial<{
    type: "lifecycle" | "tool" | "assistant_text" | "terminal";
    text: string;
    timestamp: string;
    status: "started" | "succeeded" | "failed" | "completed";
  }> = {},
) {
  return {
    type: "assistant_text" as const,
    text: "default event",
    timestamp: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("formatActivityFeed — tracer bullet", () => {
  it("returns collapsed and expanded text for a single lifecycle event", () => {
    const event = {
      type: "lifecycle" as const,
      text: "Subagent started",
      timestamp: "2026-01-01T00:00:00Z",
      status: "started" as const,
    };

    const feed = formatActivityFeed([event]);

    expect(feed.collapsed.text).toBe("Subagent started");
    expect(feed.expanded.text).toBe("Subagent started");
    expect(feed.collapsed.hiddenCount).toBe(0);
    expect(feed.expanded.hiddenCount).toBe(0);
    expect(feed.collapsed.lines).toEqual([
      expect.objectContaining({
        type: "lifecycle",
        status: "started",
        text: "Subagent started",
      }),
    ]);
  });
});

describe("formatActivityFeed — collapsed history", () => {
  it("keeps a bounded recent history and indicates hidden older events", () => {
    const events = Array.from({ length: 8 }, (_, index) => ({
      type: "assistant_text" as const,
      text: `event-${index + 1}`,
      timestamp: `2026-01-01T00:00:0${index}Z`,
    }));

    const feed = formatActivityFeed(events, { collapsedWindow: 6 });

    expect(feed.collapsed.hiddenCount).toBe(2);
    expect(feed.collapsed.lines.map((line) => line.text)).toEqual([
      "event-3",
      "event-4",
      "event-5",
      "event-6",
      "event-7",
      "event-8",
    ]);
    expect(feed.collapsed.text).toBe([
      "… 2 older events hidden …",
      "event-3",
      "event-4",
      "event-5",
      "event-6",
      "event-7",
      "event-8",
    ].join("\n"));
  });

  it("shows all collapsed lines without a hidden-count banner when the history fits", () => {
    const events = Array.from({ length: 6 }, (_, index) => ({
      type: "assistant_text" as const,
      text: `event-${index + 1}`,
      timestamp: `2026-01-01T00:00:0${index}Z`,
    }));

    const feed = formatActivityFeed(events, { collapsedWindow: 6 });

    expect(feed.collapsed.hiddenCount).toBe(0);
    expect(feed.collapsed.text).toBe(events.map((event) => event.text).join("\n"));
    expect(feed.collapsed.lines.map((line) => line.text)).toEqual(
      events.map((event) => event.text),
    );
  });
});

describe("formatActivityFeed — expanded history", () => {
  it("keeps the full filtered progress stream in chronological order", () => {
    const events = [
      {
        type: "lifecycle" as const,
        text: "Subagent started",
        timestamp: "2026-01-01T00:00:00Z",
        status: "started" as const,
      },
      {
        type: "tool" as const,
        text: "[read] {\"path\":\"/tmp/test.txt\"}",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
      },
      {
        type: "assistant_text" as const,
        text: "Scanning codebase.",
        timestamp: "2026-01-01T00:00:02Z",
      },
      {
        type: "terminal" as const,
        text: "Subagent completed",
        timestamp: "2026-01-01T00:00:03Z",
        status: "completed" as const,
      },
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 2 });

    expect(feed.expanded.hiddenCount).toBe(0);
    expect(feed.expanded.text).toBe([
      "Subagent started",
      "[read] {\"path\":\"/tmp/test.txt\"}",
      "Scanning codebase.",
      "Subagent completed",
    ].join("\n"));
    expect(feed.expanded.lines).toEqual([
      {
        type: "lifecycle",
        text: "Subagent started",
        timestamp: "2026-01-01T00:00:00Z",
        status: "started",
      },
      {
        type: "tool",
        text: "[read] {\"path\":\"/tmp/test.txt\"}",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started",
      },
      {
        type: "assistant_text",
        text: "Scanning codebase.",
        timestamp: "2026-01-01T00:00:02Z",
        status: undefined,
      },
      {
        type: "terminal",
        text: "Subagent completed",
        timestamp: "2026-01-01T00:00:03Z",
        status: "completed",
      },
    ]);
  });
});

describe("formatActivityFeed — event categories", () => {
  it("preserves readable user-facing text and structured metadata for each progress-event category", () => {
    const events = [
      makeEvent({
        type: "lifecycle",
        text: "Subagent started",
        status: "started",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeEvent({
        type: "tool",
        text: "[bash] {\"command\":\"ls -la\"}",
        status: "started",
        timestamp: "2026-01-01T00:00:01Z",
      }),
      makeEvent({
        type: "tool",
        text: "Tool bash succeeded",
        status: "succeeded",
        timestamp: "2026-01-01T00:00:02Z",
      }),
      makeEvent({
        type: "tool",
        text: "Tool bash failed",
        status: "failed",
        timestamp: "2026-01-01T00:00:03Z",
      }),
      makeEvent({
        type: "assistant_text",
        text: "Scanning codebase.",
        timestamp: "2026-01-01T00:00:04Z",
      }),
      makeEvent({
        type: "terminal",
        text: "Subagent completed",
        status: "completed",
        timestamp: "2026-01-01T00:00:05Z",
      }),
      makeEvent({
        type: "terminal",
        text: "Subagent failed: missing agent_end",
        status: "failed",
        timestamp: "2026-01-01T00:00:06Z",
      }),
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 10 });

    expect(feed.collapsed.text).toBe(events.map((event) => event.text).join("\n"));
    expect(feed.collapsed.lines).toEqual(events);
  });

  it("keeps plain-text fallback focused on event text instead of serializing internals", () => {
    const event = makeEvent({
      type: "tool",
      text: "Tool bash succeeded",
      status: "succeeded",
      timestamp: "2026-01-01T00:00:02Z",
    });

    const feed = formatActivityFeed([event]);

    expect(feed.collapsed.text).toBe("Tool bash succeeded");
    expect(feed.collapsed.text).not.toContain('"type"');
    expect(feed.collapsed.text).not.toContain('"timestamp"');
    expect(feed.expanded.text).toBe("Tool bash succeeded");
  });
});

describe("formatActivityFeed — edge cases", () => {
  it("returns empty collapsed and expanded views for an empty history", () => {
    const feed = formatActivityFeed([]);

    expect(feed.collapsed).toEqual({ text: "", hiddenCount: 0, lines: [] });
    expect(feed.expanded).toEqual({ text: "", hiddenCount: 0, lines: [] });
  });

  it("respects a custom collapsed window", () => {
    const events = [
      makeEvent({ text: "event-1", timestamp: "2026-01-01T00:00:00Z" }),
      makeEvent({ text: "event-2", timestamp: "2026-01-01T00:00:01Z" }),
      makeEvent({ text: "event-3", timestamp: "2026-01-01T00:00:02Z" }),
      makeEvent({ text: "event-4", timestamp: "2026-01-01T00:00:03Z" }),
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 3 });

    expect(feed.collapsed.hiddenCount).toBe(1);
    expect(feed.collapsed.text).toBe([
      "… 1 older event hidden …",
      "event-2",
      "event-3",
      "event-4",
    ].join("\n"));
    expect(feed.collapsed.lines.map((line) => line.text)).toEqual([
      "event-2",
      "event-3",
      "event-4",
    ]);
  });

  it("allows a zero collapsed window to hide all event lines while keeping the hidden count", () => {
    const events = [
      makeEvent({ text: "event-1", timestamp: "2026-01-01T00:00:00Z" }),
      makeEvent({ text: "event-2", timestamp: "2026-01-01T00:00:01Z" }),
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 0 });

    expect(feed.collapsed).toEqual({
      text: "… 2 older events hidden …",
      hiddenCount: 2,
      lines: [],
    });
    expect(feed.expanded.text).toBe("event-1\nevent-2");
  });
});
