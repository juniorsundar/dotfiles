import type { ProgressEvent } from "./tail-progress";

export interface ActivityFeedLine {
  type: ProgressEvent["type"];
  text: string;
  timestamp: string;
  status?: ProgressEvent["status"];
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

const DEFAULT_COLLAPSED_WINDOW = 6;

export function formatActivityFeed(
  events: readonly ProgressEvent[],
  options: ActivityFeedOptions = {},
): ActivityFeedOutput {
  const collapsedWindow = Math.max(
    0,
    Math.trunc(options.collapsedWindow ?? DEFAULT_COLLAPSED_WINDOW),
  );
  const collapsedEvents = collapsedWindow === 0
    ? []
    : events.slice(-collapsedWindow);
  const hiddenCount = Math.max(0, events.length - collapsedEvents.length);
  const collapsedLines = collapsedEvents.map(toLine);
  const expandedLines = events.map(toLine);
  const collapsedTextLines = collapsedEvents.map(formatLineText);
  const expandedTextLines = events.map(formatLineText);

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
  };
}

function formatLineText(event: ProgressEvent): string {
  const prefix = linePrefix(event);
  return prefix ? `${prefix} ${event.text}` : event.text;
}

function linePrefix(event: ProgressEvent): string {
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

function formatHiddenCount(hiddenCount: number): string {
  return `… ${hiddenCount} older event${hiddenCount === 1 ? "" : "s"} hidden …`;
}
