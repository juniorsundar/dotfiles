import { describe, it, expect, vi } from "vitest";

vi.mock("@earendil-works/pi-tui", () => {
  class Text {
    private _text: string;
    constructor(text = "", _paddingX = 0, _paddingY = 0) {
      this._text = text;
    }
    setText(text: string) {
      this._text = text;
    }
    render(_width: number): string[] {
      return this._text.split("\n");
    }
    invalidate() {}
  }

  class Markdown {
    text: string;
    constructor(text = "", _paddingX = 0, _paddingY = 0, _theme?: unknown) {
      this.text = text;
    }
    setText(text: string) {
      this.text = text;
    }
    render(_width: number): string[] {
      return this.text.split("\n");
    }
    invalidate() {}
  }

  class Container {
    children: any[] = [];
    addChild(child: any) {
      this.children.push(child);
    }
    render(width: number): string[] {
      return this.children.flatMap((child) => child.render(width));
    }
    invalidate() {}
  }

  return { Text, Markdown, Container };
});

import { renderActivityFeed } from "./activity-feed-renderer";

describe("renderActivityFeed", () => {
  it("renders a completed tool block as nested Container components", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "succeeded" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
            toolResultPreview: "file contents",
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "succeeded" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
            toolResultPreview: "file contents",
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.constructor.name).toBe("Container");
    expect(component.children).toHaveLength(1);
    expect(component.children[0].constructor.name).toBe("Container");
    expect(component.children[0].children).toHaveLength(3);
    expect(component.render(80)).toEqual([
      "● BOLD(FG_ACCENT(read)) ✓",
      "FG_DIM(└ /tmp/test.txt)",
      "FG_DIM(└─╼ file contents)",
    ]);
  });

  it("renders an in-progress tool block with a spinning character when spinnerFrame is provided", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    // spinnerFrame=0 → ◐ (first frame)
    const component: any = renderActivityFeed(feed, false, theme, 0);
    expect(component.render(80)).toEqual([
      "◐ BOLD(FG_ACCENT(read))",
      "FG_DIM(└ /tmp/test.txt)",
    ]);
  });

  it("cycles through spinner characters as spinnerFrame increments", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    expect(renderActivityFeed(feed, false, theme, 0).render(80)[0]).toContain("◐");
    expect(renderActivityFeed(feed, false, theme, 1).render(80)[0]).toContain("◓");
    expect(renderActivityFeed(feed, false, theme, 2).render(80)[0]).toContain("◑");
    expect(renderActivityFeed(feed, false, theme, 3).render(80)[0]).toContain("◒");
    expect(renderActivityFeed(feed, false, theme, 4).render(80)[0]).toContain("◐");
  });

  it("renders static bullet for completed tool even when spinnerFrame is provided", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "succeeded" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
            toolResultPreview: "file contents",
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "succeeded" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
            toolResultPreview: "file contents",
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    // Completed tool should show static bullet + checkmark, never a spinner
    const component: any = renderActivityFeed(feed, false, theme, 0);
    expect(component.render(80)).toEqual([
      "● BOLD(FG_ACCENT(read)) ✓",
      "FG_DIM(└ /tmp/test.txt)",
      "FG_DIM(└─╼ file contents)",
    ]);
  });

  it("replaces spinner with checkmark when same tool transitions from started to succeeded", () => {
    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    // First render: tool is started → expect spinner (◐)
    const startedFeed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [{
          type: "tool" as const,
          text: "read: /tmp/test.txt",
          timestamp: "2026-01-01T00:00:01Z",
          status: "started" as const,
          toolName: "read",
          toolArgs: { path: "/tmp/test.txt" },
        }],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [{
          type: "tool" as const,
          text: "read: /tmp/test.txt",
          timestamp: "2026-01-01T00:00:01Z",
          status: "started" as const,
          toolName: "read",
          toolArgs: { path: "/tmp/test.txt" },
        }],
      },
    };
    const startedComponent: any = renderActivityFeed(startedFeed, false, theme, 0);
    expect(startedComponent.render(80)[0]).toContain("◐");

    // Second render: same tool now succeeded → expect ● … ✓ (no spinner)
    const succeededFeed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [{
          type: "tool" as const,
          text: "read: /tmp/test.txt",
          timestamp: "2026-01-01T00:00:01Z",
          status: "succeeded" as const,
          toolName: "read",
          toolArgs: { path: "/tmp/test.txt" },
          toolResultPreview: "file contents",
        }],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [{
          type: "tool" as const,
          text: "read: /tmp/test.txt",
          timestamp: "2026-01-01T00:00:01Z",
          status: "succeeded" as const,
          toolName: "read",
          toolArgs: { path: "/tmp/test.txt" },
          toolResultPreview: "file contents",
        }],
      },
    };
    const succeededComponent: any = renderActivityFeed(succeededFeed, false, theme, 0);
    expect(succeededComponent.render(80)).toEqual([
      "● BOLD(FG_ACCENT(read)) ✓",
      "FG_DIM(└ /tmp/test.txt)",
      "FG_DIM(└─╼ file contents)",
    ]);
  });

  it("renders static bullet for non-tool lines when spinnerFrame is provided (no in-progress tools)", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "lifecycle" as const,
            text: "Subagent started",
            timestamp: "2026-01-01T00:00:00Z",
            status: "started" as const,
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    // No in-progress tools — spinnerFrame is ignored, static rendering unchanged
    const component: any = renderActivityFeed(feed, false, theme, 5);
    expect(component.render(80)).toEqual([
      "FG_DIM(run Subagent started)",
    ]);
  });

  it("only the most recently started in-progress tool shows spinner; others show static bullet", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "bash: ls",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "bash",
            toolArgs: { command: "ls" },
          },
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:02Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "bash: ls",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "bash",
            toolArgs: { command: "ls" },
          },
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:02Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    // spinnerFrame=0 → ◐ for the LATEST (read), ● for the earlier (bash)
    const component: any = renderActivityFeed(feed, false, theme, 0);
    expect(component.render(80)).toEqual([
      "● BOLD(FG_ACCENT(bash))",
      "FG_DIM(└ ls)",
      "◐ BOLD(FG_ACCENT(read))",
      "FG_DIM(└ /tmp/test.txt)",
    ]);
  });

  it("renders an in-progress tool block with a static bullet when no spinnerFrame is provided (backward compat)", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "tool" as const,
            text: "read: /tmp/test.txt",
            timestamp: "2026-01-01T00:00:01Z",
            status: "started" as const,
            toolName: "read",
            toolArgs: { path: "/tmp/test.txt" },
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.render(80)).toEqual([
      "● BOLD(FG_ACCENT(read))",
      "FG_DIM(└ /tmp/test.txt)",
    ]);
  });

  it("renders non-tool events as flat styled text lines", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "lifecycle" as const,
            text: "Subagent started",
            timestamp: "2026-01-01T00:00:00Z",
            status: "started" as const,
          },
          {
            type: "usage" as const,
            text: "Tokens: 100 input, 50 output",
            timestamp: "2026-01-01T00:00:01Z",
          },
          {
            type: "assistant_text" as const,
            text: "Working...",
            timestamp: "2026-01-01T00:00:02Z",
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "lifecycle" as const,
            text: "Subagent started",
            timestamp: "2026-01-01T00:00:00Z",
            status: "started" as const,
          },
          {
            type: "usage" as const,
            text: "Tokens: 100 input, 50 output",
            timestamp: "2026-01-01T00:00:01Z",
          },
          {
            type: "assistant_text" as const,
            text: "Working...",
            timestamp: "2026-01-01T00:00:02Z",
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.render(80)).toEqual([
      "FG_DIM(run Subagent started)",
      "FG_DIM(usage Tokens: 100 input, 50 output)",
      "FG_TOOLOUTPUT(say Working...)",
    ]);
  });

  it("renders a thinking event as a Container with Text header and Markdown child", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "thinking" as const,
            text: "- inspect `activity-feed-renderer.ts`",
            timestamp: "2026-01-01T00:00:00Z",
            renderMarkdown: true,
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "thinking" as const,
            text: "- inspect `activity-feed-renderer.ts`",
            timestamp: "2026-01-01T00:00:00Z",
            renderMarkdown: true,
          },
        ],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.children).toHaveLength(1);
    expect(component.children[0].constructor.name).toBe("Container");
    expect(component.children[0].children).toHaveLength(2);
    expect(component.children[0].children[0].constructor.name).toBe("Text");
    expect(component.children[0].children[1].constructor.name).toBe("Markdown");
    expect(component.render(80)).toEqual([
      "FG_MUTED(◇ thinking)",
      "- inspect `activity-feed-renderer.ts`",
    ]);
  });

  it("renders consecutive thinking events as separate markdown blocks", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "thinking" as const,
            text: "- inspect renderer",
            timestamp: "2026-01-01T00:00:00Z",
            renderMarkdown: true,
          },
          {
            type: "thinking" as const,
            text: "- verify formatter",
            timestamp: "2026-01-01T00:00:01Z",
            renderMarkdown: true,
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.children).toHaveLength(2);
    expect(component.render(80)).toEqual([
      "FG_MUTED(◇ thinking)",
      "- inspect renderer",
      "FG_MUTED(◇ thinking)",
      "- verify formatter",
    ]);
  });

  it("renders the hidden-count banner above collapsed lines", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 3,
        lines: [
          {
            type: "assistant_text" as const,
            text: "Working...",
            timestamp: "2026-01-01T00:00:02Z",
          },
        ],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [],
      },
    };

    const theme = {
      bold: (text: string) => `BOLD(${text})`,
      fg: (color: string, text: string) => `FG_${color.toUpperCase()}(${text})`,
    };

    const component: any = renderActivityFeed(feed, false, theme);

    expect(component.render(80)).toEqual([
      "FG_DIM(… 3 older events hidden …)",
      "FG_TOOLOUTPUT(say Working...)",
    ]);
  });
});
