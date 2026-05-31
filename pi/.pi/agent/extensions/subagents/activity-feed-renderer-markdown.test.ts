import { execSync } from "node:child_process";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, it, expect, vi } from "vitest";

vi.mock("@earendil-works/pi-tui", async () => {
  const globalNodeModules = execSync("npm root -g", { encoding: "utf8" }).trim();
  const piTuiModuleUrl = pathToFileURL(
    join(
      globalNodeModules,
      "@earendil-works/pi-coding-agent",
      "node_modules",
      "@earendil-works",
      "pi-tui",
      "dist",
      "index.js",
    ),
  ).href;

  return await import(piTuiModuleUrl);
});

import { renderActivityFeed } from "./activity-feed-renderer";

describe("renderActivityFeed — real markdown rendering", () => {
  it("renders markdown constructs in expanded thinking blocks", () => {
    const feed = {
      collapsed: {
        text: "",
        hiddenCount: 0,
        lines: [],
      },
      expanded: {
        text: "",
        hiddenCount: 0,
        lines: [
          {
            type: "thinking" as const,
            text: "## Plan\n- inspect `activity-feed-renderer.ts` with **care**",
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

    const component = renderActivityFeed(feed, true, theme);
    const lines = component.render(80).map((line) => line.trimEnd());

    expect(lines).toEqual([
      "FG_MUTED(◇ thinking)",
      "BOLD(BOLD(Plan))",
      "",
      "FG_MUTED(- )inspect FG_TOOLOUTPUT(activity-feed-renderer.ts) with BOLD(care)",
    ]);
  });
});
