import { describe, it, expect } from "vitest";
import { formatActivityFeed } from "./activity-feed-formatter";

function makeEvent(
  overrides: Partial<{
    type: "lifecycle" | "tool" | "assistant_text" | "thinking" | "terminal" | "usage";
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

    expect(feed.collapsed.text).toBe("run Subagent started");
    expect(feed.expanded.text).toBe("run Subagent started");
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
  it("uses a default collapsed window of 3 events", () => {
    const events = Array.from({ length: 5 }, (_, index) => ({
      type: "assistant_text" as const,
      text: `event-${index + 1}`,
      timestamp: `2026-01-01T00:00:0${index}Z`,
    }));

    const feed = formatActivityFeed(events);

    expect(feed.collapsed.hiddenCount).toBe(2);
    expect(feed.collapsed.lines.map((line) => line.text)).toEqual([
      "event-3",
      "event-4",
      "event-5",
    ]);
  });

  it("keeps a merged tool block in collapsed view when the start event is older than the raw window", () => {
    const events = [
      {
        type: "lifecycle" as const,
        text: "Subagent started",
        timestamp: "2026-01-01T00:00:00Z",
        status: "started" as const,
      },
      {
        type: "tool" as const,
        text: "read: /tmp/test.txt",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
        toolName: "read",
        toolArgs: { path: "/tmp/test.txt" },
      },
      {
        type: "assistant_text" as const,
        text: "Working...",
        timestamp: "2026-01-01T00:00:02Z",
      },
      {
        type: "thinking" as const,
        text: "Analyzing...",
        timestamp: "2026-01-01T00:00:03Z",
      },
      {
        type: "tool" as const,
        text: "read completed → file contents",
        timestamp: "2026-01-01T00:00:04Z",
        status: "succeeded" as const,
        toolName: "read",
        toolResultPreview: "file contents",
      },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.collapsed.hiddenCount).toBe(1);
    expect(feed.collapsed.text).toBe([
      "… 1 older event hidden …",
      "● read ✓",
      "└ /tmp/test.txt",
      "└─╼ file contents",
      "say Working...",
      "◇ thinking",
      "Analyzing...",
    ].join("\n"));
    expect(feed.collapsed.text).not.toContain("ok read completed");
  });

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
      "say event-3",
      "say event-4",
      "say event-5",
      "say event-6",
      "say event-7",
      "say event-8",
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
    expect(feed.collapsed.text).toBe(events.map((event) => `say ${event.text}`).join("\n"));
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
      "run Subagent started",
      "tool [read] {\"path\":\"/tmp/test.txt\"}",
      "say Scanning codebase.",
      "done Subagent completed",
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

describe("formatActivityFeed — tool block tracer bullet", () => {
  it("merges a completed tool call into one block with params and result text", () => {
    const events = [
      {
        type: "tool" as const,
        text: "read: /tmp/test.txt",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
        toolName: "read",
        toolArgs: { path: "/tmp/test.txt" },
      },
      {
        type: "tool" as const,
        text: "read completed → file contents",
        timestamp: "2026-01-01T00:00:02Z",
        status: "succeeded" as const,
        toolName: "read",
        toolResultPreview: "file contents",
      },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.collapsed.text).toBe([
      "● read ✓",
      "└ /tmp/test.txt",
      "└─╼ file contents",
    ].join("\n"));
    expect(feed.expanded.text).toBe(feed.collapsed.text);
    expect(feed.collapsed.lines).toHaveLength(1);
    expect(feed.collapsed.lines[0]).toEqual(expect.objectContaining({
      type: "tool",
      status: "succeeded",
      toolName: "read",
      toolArgs: { path: "/tmp/test.txt" },
      toolResultPreview: "file contents",
    }));
  });
});

describe("formatActivityFeed — in-progress tool blocks", () => {
  it("renders an in-progress tool call as a block without a status marker", () => {
    const events = [
      {
        type: "tool" as const,
        text: "read: /tmp/test.txt",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
        toolName: "read",
        toolArgs: { path: "/tmp/test.txt" },
      },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.collapsed.text).toBe([
      "● read",
      "└ /tmp/test.txt",
    ].join("\n"));
    expect(feed.expanded.text).toBe(feed.collapsed.text);
  });

  it("renders a failed tool call with a failure marker and error preview", () => {
    const events = [
      {
        type: "tool" as const,
        text: "read: /tmp/test.txt",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
        toolName: "read",
        toolArgs: { path: "/tmp/test.txt" },
      },
      {
        type: "tool" as const,
        text: "read failed → permission denied",
        timestamp: "2026-01-01T00:00:02Z",
        status: "failed" as const,
        toolName: "read",
        toolResultPreview: "permission denied",
      },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.collapsed.text).toBe([
      "● read ✗",
      "└ /tmp/test.txt",
      "└─╼ permission denied",
    ].join("\n"));
    expect(feed.expanded.text).toBe(feed.collapsed.text);
  });

  it("merges concurrent same-name tool calls by toolCallId without separate completion lines", () => {
    const events = [
      {
        type: "tool" as const,
        text: "bash: ls",
        timestamp: "2026-01-01T00:00:01Z",
        status: "started" as const,
        toolName: "bash",
        toolArgs: { command: "ls" },
        toolCallId: "call-1",
      },
      {
        type: "tool" as const,
        text: "bash: pwd",
        timestamp: "2026-01-01T00:00:02Z",
        status: "started" as const,
        toolName: "bash",
        toolArgs: { command: "pwd" },
        toolCallId: "call-2",
      },
      {
        type: "tool" as const,
        text: "bash completed → /tmp/project",
        timestamp: "2026-01-01T00:00:03Z",
        status: "succeeded" as const,
        toolName: "bash",
        toolResultPreview: "/tmp/project",
        toolCallId: "call-2",
      },
      {
        type: "tool" as const,
        text: "bash completed → file-a",
        timestamp: "2026-01-01T00:00:04Z",
        status: "succeeded" as const,
        toolName: "bash",
        toolResultPreview: "file-a",
        toolCallId: "call-1",
      },
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 10 });

    expect(feed.expanded.text).toBe([
      "● bash ✓",
      "└ ls",
      "└─╼ file-a",
      "● bash ✓",
      "└ pwd",
      "└─╼ /tmp/project",
    ].join("\n"));
    expect(feed.expanded.text).not.toContain("ok bash completed");
    expect(feed.expanded.lines).toHaveLength(2);
  });
});

describe("formatActivityFeed — thinking metadata", () => {
  it("marks thinking lines for markdown rendering without changing assistant_text lines", () => {
    const events = [
      makeEvent({
        type: "thinking",
        text: "- inspect `activity-feed-renderer.ts`",
        timestamp: "2026-01-01T00:00:00Z",
      }),
      makeEvent({
        type: "assistant_text",
        text: "Working...",
        timestamp: "2026-01-01T00:00:01Z",
      }),
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 10 });

    expect(feed.collapsed.lines[0]).toEqual(expect.objectContaining({
      type: "thinking",
      renderMarkdown: true,
    }));
    expect(feed.collapsed.lines[1]).toEqual(expect.objectContaining({
      type: "assistant_text",
      text: "Working...",
    }));
    expect(feed.collapsed.lines[1]).not.toHaveProperty("renderMarkdown");
    expect(feed.expanded.lines).toEqual(feed.collapsed.lines);
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

    expect(feed.collapsed.text).toBe([
      "run Subagent started",
      "tool [bash] {\"command\":\"ls -la\"}",
      "ok Tool bash succeeded",
      "fail Tool bash failed",
      "say Scanning codebase.",
      "done Subagent completed",
      "fail Subagent failed: missing agent_end",
    ].join("\n"));
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

    expect(feed.collapsed.text).toBe("ok Tool bash succeeded");
    expect(feed.collapsed.text).not.toContain('"type"');
    expect(feed.collapsed.text).not.toContain('"timestamp"');
    expect(feed.expanded.text).toBe("ok Tool bash succeeded");
  });

  it("passes tool metadata fields through unchanged on ActivityFeedLine", () => {
    const event = {
      type: "tool" as const,
      text: "bash: ls -la /tmp",
      timestamp: "2026-01-01T00:00:02Z",
      status: "started" as const,
      toolName: "bash",
      toolArgs: { command: "ls -la /tmp" },
      toolResultPreview: "file-a file-b",
    };

    const feed = formatActivityFeed([event]);

    expect(feed.collapsed.lines).toEqual([
      {
        type: "tool",
        text: "bash: ls -la /tmp",
        timestamp: "2026-01-01T00:00:02Z",
        status: "started",
        toolName: "bash",
        toolArgs: { command: "ls -la /tmp" },
        toolResultPreview: "file-a file-b",
      },
    ]);
    expect(feed.expanded.lines).toEqual(feed.collapsed.lines);
    expect(feed.collapsed.text).toBe([
      "● bash",
      "└ ls -la /tmp",
      "└─╼ file-a file-b",
    ].join("\n"));
  });
});

describe("formatActivityFeed — usage extraction", () => {
  it("output includes usage when events contain a usage event", () => {
    const events = [
      makeEvent({ type: "lifecycle", text: "started", timestamp: "2026-01-01T00:00:00Z", status: "started" }),
      { type: "usage" as const, text: "Tokens: 100 input, 50 output", timestamp: "2026-01-01T00:00:01Z", input: 100, output: 50 },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.usage).toEqual({ input: 100, output: 50 });
    expect(feed.usage?.cacheRead).toBeUndefined();
    expect(feed.usage?.cacheWrite).toBeUndefined();
  });

  it("extracts the most recent usage event, superseding earlier ones", () => {
    const events = [
      { type: "usage" as const, text: "Tokens: 10 in", timestamp: "2026-01-01T00:00:00Z", input: 10 },
      makeEvent({ type: "assistant_text", text: "working", timestamp: "2026-01-01T00:00:01Z" }),
      { type: "usage" as const, text: "Tokens: 200 input, 75 output", timestamp: "2026-01-01T00:00:02Z", input: 200, output: 75 },
    ];

    const feed = formatActivityFeed(events);

    expect(feed.usage?.input).toBe(200);
    expect(feed.usage?.output).toBe(75);
    expect(feed.usage?.cacheRead).toBeUndefined();
  });

  it("leaves usage undefined when no usage events are present", () => {
    const events = [
      makeEvent({ type: "lifecycle", text: "started", timestamp: "2026-01-01T00:00:00Z", status: "started" }),
      makeEvent({ type: "terminal", text: "done", timestamp: "2026-01-01T00:00:01Z", status: "completed" }),
    ];

    const feed = formatActivityFeed(events);

    expect(feed.usage).toBeUndefined();
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
      "say event-2",
      "say event-3",
      "say event-4",
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
    expect(feed.expanded.text).toBe("say event-1\nsay event-2");
  });
});

describe("formatActivityFeed — thinking block text output", () => {
  it("renders consecutive thinking events as separate blocks while keeping tool and assistant styles distinct", () => {
    const events = [
      {
        type: "thinking" as const,
        text: "- inspect renderer",
        timestamp: "2026-01-01T00:00:00Z",
      },
      {
        type: "thinking" as const,
        text: "- verify formatter",
        timestamp: "2026-01-01T00:00:01Z",
      },
      {
        type: "tool" as const,
        text: "read: /tmp/test.txt",
        timestamp: "2026-01-01T00:00:02Z",
        status: "started" as const,
        toolName: "read",
        toolArgs: { path: "/tmp/test.txt" },
      },
      {
        type: "tool" as const,
        text: "read completed → file contents",
        timestamp: "2026-01-01T00:00:03Z",
        status: "succeeded" as const,
        toolName: "read",
        toolResultPreview: "file contents",
      },
      {
        type: "assistant_text" as const,
        text: "Working...",
        timestamp: "2026-01-01T00:00:04Z",
      },
    ];

    const feed = formatActivityFeed(events, { collapsedWindow: 10 });

    expect(feed.collapsed.text).toBe([
      "◇ thinking",
      "- inspect renderer",
      "◇ thinking",
      "- verify formatter",
      "● read ✓",
      "└ /tmp/test.txt",
      "└─╼ file contents",
      "say Working...",
    ].join("\n"));
    expect(feed.expanded.text).toBe(feed.collapsed.text);
  });
});

describe("formatActivityFeed — no assistant_text events", () => {
  it("renders a feed with only tool, thinking, and lifecycle events without errors", () => {
    const events = [
      { type: "lifecycle" as const, text: "Subagent started", timestamp: "2026-01-01T00:00:00Z", status: "started" as const },
      { type: "tool" as const, text: "bash completed \u2192 ok", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
      { type: "thinking" as const, text: "Analyzing...", timestamp: "2026-01-01T00:00:02Z" },
      { type: "lifecycle" as const, text: "Subagent completed", timestamp: "2026-01-01T00:00:03Z", status: "completed" as const },
    ];
    const feed = formatActivityFeed(events, { collapsedWindow: 10 });
    expect(feed.collapsed.text).toBe([
      "run Subagent started",
      "ok bash completed \u2192 ok",
      "◇ thinking",
      "Analyzing...",
      "done Subagent completed",
    ].join("\n"));
    expect(feed.expanded.text).toBe(feed.collapsed.text);
    expect(feed.collapsed.lines).toHaveLength(4);
    expect(feed.expanded.lines).toHaveLength(4);
  });

  it("renders a feed with usage but no assistant_text", () => {
    const events = [
      { type: "lifecycle" as const, text: "started", timestamp: "2026-01-01T00:00:00Z", status: "started" as const },
      { type: "tool" as const, text: "read completed", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
      { type: "usage" as const, text: "Tokens: 100 input, 50 output", timestamp: "2026-01-01T00:00:02Z", input: 100, output: 50 },
    ];
    const feed = formatActivityFeed(events);
    expect(feed.collapsed.text).toBe([
      "run started",
      "ok read completed",
      "usage Tokens: 100 input, 50 output",
    ].join("\n"));
    expect(feed.usage).toEqual({ input: 100, output: 50 });
  });
});

describe("formatActivityFeed — legacy assistant_text events", () => {
  it("renders legacy Progress Files that contain assistant_text events", () => {
    const events = [
      { type: "lifecycle" as const, text: "Subagent started", timestamp: "2026-01-01T00:00:00Z", status: "started" as const },
      { type: "assistant_text" as const, text: "Hello world.", timestamp: "2026-01-01T00:00:01Z" },
      { type: "tool" as const, text: "bash completed", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" as const },
      { type: "assistant_text" as const, text: "Done.", timestamp: "2026-01-01T00:00:03Z" },
      { type: "lifecycle" as const, text: "Subagent completed", timestamp: "2026-01-01T00:00:04Z", status: "completed" as const },
    ];
    const feed = formatActivityFeed(events, { collapsedWindow: 10 });
    expect(feed.collapsed.text).toBe([
      "run Subagent started",
      "say Hello world.",
      "ok bash completed",
      "say Done.",
      "done Subagent completed",
    ].join("\n"));
    expect(feed.collapsed.lines).toHaveLength(5);
  });
});
