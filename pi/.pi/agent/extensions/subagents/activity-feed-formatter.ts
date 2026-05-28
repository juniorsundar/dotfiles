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

  return {
    collapsed: {
      text: [
        ...(hiddenCount > 0 ? [formatHiddenCount(hiddenCount)] : []),
        ...collapsedLines.map((line) => line.text),
      ].join("\n"),
      hiddenCount,
      lines: collapsedLines,
    },
    expanded: {
      text: expandedLines.map((line) => line.text).join("\n"),
      hiddenCount: 0,
      lines: expandedLines,
    },
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

function formatHiddenCount(hiddenCount: number): string {
  return `… ${hiddenCount} older event${hiddenCount === 1 ? "" : "s"} hidden …`;
}
