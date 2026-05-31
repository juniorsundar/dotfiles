import { Container, Markdown, Text } from "@earendil-works/pi-tui";
import type { Component, MarkdownTheme } from "@earendil-works/pi-tui";
import {
  formatHiddenCount,
  isToolBlock,
  linePrefix,
  type ActivityFeedLine,
  type ActivityFeedOutput,
} from "./activity-feed-formatter";
import { summarizeToolArgs } from "./activity-feed-tool-formatting";

const SPINNER_CHARS = ["◐", "◓", "◑", "◒"];

export function renderActivityFeed(
  feed: ActivityFeedOutput,
  expanded: boolean,
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
  spinnerFrame?: number,
): Component {
  const view = expanded ? feed.expanded : feed.collapsed;
  const children: Component[] = [];

  if (!expanded && view.hiddenCount > 0) {
    children.push(new Text(theme.fg("dim", formatHiddenCount(view.hiddenCount)), 0, 0));
  }

  // Determine the last in-progress tool line for spinner targeting
  let latestInProgressIndex = -1;
  if (spinnerFrame !== undefined) {
    for (let i = view.lines.length - 1; i >= 0; i--) {
      if (isToolBlock(view.lines[i]) && view.lines[i]!.status === "started") {
        latestInProgressIndex = i;
        break;
      }
    }
  }

  const spinnerChar = spinnerFrame !== undefined
    ? SPINNER_CHARS[Math.abs(Math.trunc(spinnerFrame)) % SPINNER_CHARS.length]
    : undefined;

  for (let i = 0; i < view.lines.length; i++) {
    children.push(renderLine(view.lines[i], theme, i === latestInProgressIndex ? spinnerChar : undefined));
  }

  return asContainer(children);
}

function renderLine(
  line: ActivityFeedLine,
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
  spinnerChar?: string,
): Component {
  if (isToolBlock(line)) {
    return asContainer([
      new Text(renderToolHeader(line, theme, spinnerChar), 0, 0),
      new Text(theme.fg("dim", `└ ${summarizeToolArgs(line.toolName!, line.toolArgs ?? {})}`), 0, 0),
      ...(line.toolResultPreview
        ? [new Text(theme.fg("dim", `└─╼ ${line.toolResultPreview}`), 0, 0)]
        : []),
    ]);
  }

  if (line.type === "thinking" && line.renderMarkdown) {
    return asContainer([
      new Text(theme.fg("muted", "◇ thinking"), 0, 0),
      new Markdown(line.text, 0, 0, createMarkdownTheme(theme)),
    ]);
  }

  return new Text(styleFlatLine(line, theme), 0, 0);
}

function asContainer(children: Component[]): Container {
  const container = new Container();
  for (const child of children) {
    container.addChild(child);
  }
  return container;
}

function createMarkdownTheme(
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
): MarkdownTheme {
  return {
    heading: (text) => theme.bold(text),
    link: (text) => theme.fg("accent", text),
    linkUrl: (text) => theme.fg("dim", text),
    code: (text) => theme.fg("toolOutput", text),
    codeBlock: (text) => theme.fg("toolOutput", text),
    codeBlockBorder: (text) => theme.fg("dim", text),
    quote: (text) => theme.fg("muted", text),
    quoteBorder: (text) => theme.fg("muted", text),
    hr: (text) => theme.fg("dim", text),
    listBullet: (text) => theme.fg("muted", text),
    bold: (text) => theme.bold(text),
    italic: (text) => text,
    strikethrough: (text) => text,
    underline: (text) => text,
  };
}

function renderToolHeader(
  line: ActivityFeedLine,
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
  spinnerChar?: string,
): string {
  const status = line.status === "failed"
    ? " ✗"
    : line.status === "succeeded"
    ? " ✓"
    : "";
  const bullet = spinnerChar ?? "●";
  const name = theme.bold(theme.fg("accent", line.toolName!));
  return `${bullet} ${name}${status}`;
}

function styleFlatLine(
  line: ActivityFeedLine,
  theme: { fg: (color: string, text: string) => string },
): string {
  const prefix = linePrefix(line);
  const text = prefix ? `${prefix} ${line.text}` : line.text;

  if (line.type === "tool") {
    if (line.status === "failed") return theme.fg("error", text);
    if (line.status === "succeeded") return theme.fg("success", text);
    return theme.fg("accent", text);
  }
  if (line.type === "thinking") return theme.fg("muted", text);
  if (line.type === "assistant_text") return theme.fg("toolOutput", text);
  if (line.type === "usage") return theme.fg("dim", text);
  if (line.type === "lifecycle" || line.type === "terminal") {
    if (line.status === "failed") return theme.fg("error", text);
    if (line.status === "completed") return theme.fg("success", text);
    return theme.fg("dim", text);
  }
  return text;
}
