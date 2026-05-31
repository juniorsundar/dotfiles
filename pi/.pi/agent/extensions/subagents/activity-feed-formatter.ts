import type { ProgressEvent } from "./tail-progress";
import { summarizeToolArgs } from "./activity-feed-tool-formatting";

export interface ActivityFeedLine {
  type: ProgressEvent["type"];
  text: string;
  timestamp: string;
  status?: ProgressEvent["status"];
  toolCallId?: ProgressEvent["toolCallId"];
  toolName?: ProgressEvent["toolName"];
  toolArgs?: ProgressEvent["toolArgs"];
  toolResultPreview?: ProgressEvent["toolResultPreview"];
  renderMarkdown?: boolean;
}

export interface ActivityFeedView {
  text: string;
  hiddenCount: number;
  lines: ActivityFeedLine[];
}

export interface ActivityFeedOptions {
  collapsedWindow?: number;
}

export interface ActivityFeedOutput {
  collapsed: ActivityFeedView;
  expanded: ActivityFeedView;
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

const DEFAULT_COLLAPSED_WINDOW = 3;

export function formatActivityFeed(
  events: readonly ProgressEvent[],
  options: ActivityFeedOptions = {},
): ActivityFeedOutput {
  const collapsedWindow = Math.max(
    0,
    Math.trunc(options.collapsedWindow ?? DEFAULT_COLLAPSED_WINDOW),
  );
  const expandedLines = toActivityFeedLines(events);
  const collapsedLines = collapsedWindow === 0
    ? []
    : expandedLines.slice(-collapsedWindow);
  const hiddenCount = Math.max(0, expandedLines.length - collapsedLines.length);
  const collapsedTextLines = collapsedLines.map(formatLineText);
  const expandedTextLines = expandedLines.map(formatLineText);

  // Extract most recent usage event for token snapshot
  let usage: ActivityFeedOutput["usage"] | undefined;
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].type === "usage") {
      const u = events[i];
      usage = {
        input: u.input,
        output: u.output,
        cacheRead: u.cacheRead,
        cacheWrite: u.cacheWrite,
      };
      break;
    }
  }

  return {
    collapsed: {
      text: [
        ...(hiddenCount > 0 ? [formatHiddenCount(hiddenCount)] : []),
        ...collapsedTextLines,
      ].join("\n"),
      hiddenCount,
      lines: collapsedLines,
    },
    expanded: {
      text: expandedTextLines.join("\n"),
      hiddenCount: 0,
      lines: expandedLines,
    },
    usage,
  };
}

function toLine(event: ProgressEvent): ActivityFeedLine {
  return {
    type: event.type,
    text: event.text,
    timestamp: event.timestamp,
    status: event.status,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    toolArgs: event.toolArgs,
    toolResultPreview: event.toolResultPreview,
    ...(event.type === "thinking" ? { renderMarkdown: true } : {}),
  };
}

function toActivityFeedLines(events: readonly ProgressEvent[]): ActivityFeedLine[] {
  const lines: ActivityFeedLine[] = [];
  const openToolStarts = new Map<string, number[]>();

  for (const event of events) {
    const line = toLine(event);

    if (isMergeableToolStart(line)) {
      lines.push(line);
      const key = mergeKey(line);
      const indexes = openToolStarts.get(key) ?? [];
      indexes.push(lines.length - 1);
      openToolStarts.set(key, indexes);
      continue;
    }

    if (isMergeableToolCompletion(line)) {
      const key = mergeKey(line);
      const indexes = openToolStarts.get(key);
      if (indexes?.length === 1) {
        const startIndex = indexes.pop()!;
        openToolStarts.delete(key);
        const start = lines[startIndex];
        lines[startIndex] = {
          ...start,
          status: line.status,
          toolResultPreview: line.toolResultPreview,
        };
        continue;
      }
    }

    lines.push(line);
  }

  return lines;
}

function formatLineText(line: ActivityFeedLine): string {
  if (isToolBlock(line)) {
    const statusMarker = line.status === "failed"
      ? " ✗"
      : line.status === "succeeded"
      ? " ✓"
      : "";
    const header = `● ${line.toolName}${statusMarker}`;
    const params = `└ ${summarizeToolArgs(line.toolName!, line.toolArgs ?? {})}`;
    const result = line.toolResultPreview ? [`└─╼ ${line.toolResultPreview}`] : [];
    return [header, params, ...result].join("\n");
  }

  if (line.type === "thinking" && line.renderMarkdown) {
    return ["◇ thinking", line.text].join("\n");
  }

  const prefix = linePrefix(line);
  return prefix ? `${prefix} ${line.text}` : line.text;
}

function isMergeableToolStart(line: ActivityFeedLine): boolean {
  return line.type === "tool" && line.status === "started" && !!line.toolName && !!line.toolArgs;
}

function isMergeableToolCompletion(line: ActivityFeedLine): boolean {
  return line.type === "tool" &&
    (line.status === "succeeded" || line.status === "failed") &&
    !!line.toolName;
}

function mergeKey(line: ActivityFeedLine): string {
  return line.toolCallId ? `id:${line.toolCallId}` : `name:${line.toolName}`;
}

export function isToolBlock(line: ActivityFeedLine): boolean {
  return line.type === "tool" &&
    !!line.toolName &&
    !!line.toolArgs;
}

export function linePrefix(event: ActivityFeedLine): string {
  if (event.type === "tool") {
    if (event.status === "succeeded") return "ok";
    if (event.status === "failed") return "fail";
    return "tool";
  }
  if (event.type === "thinking") return "think";
  if (event.type === "assistant_text") return "say";
  if (event.type === "usage") return "usage";
  if (event.type === "lifecycle") {
    if (event.status === "completed") return "done";
    return "run";
  }
  if (event.type === "terminal") {
    if (event.status === "failed") return "fail";
    if (event.status === "completed") return "done";
    return "term";
  }
  return "";
}

export function formatHiddenCount(hiddenCount: number): string {
  return `… ${hiddenCount} older event${hiddenCount === 1 ? "" : "s"} hidden …`;
}
