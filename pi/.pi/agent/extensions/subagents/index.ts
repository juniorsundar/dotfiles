import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import type { Component } from "@earendil-works/pi-tui";
import { spawnSubagent, listAvailableAgents } from "./spawner";
import type { ActivityFeedLine, ActivityFeedOutput } from "./activity-feed-formatter";
import { parseAgentDefinitionFile } from "./agent-definition-parser";
import { existsSync, readFileSync } from "fs";
import { dirname, join } from "path";
import { homedir } from "os";

const DEFAULT_AGENTS_DIR = join(homedir(), ".pi", "agent", "agents");
const modelContextWindowCache = new Map<string, number | undefined>();

export interface SubagentEntryPointOptions {
  agentsDir?: string;
}

/** Resolve the model for a subagent call: args.model override > agent definition > undefined */
export function resolveModel(
  agentType: string,
  args: Record<string, unknown>,
  agentsDir: string,
): string | undefined {
  let model = args.model as string | undefined;
  if (!model) {
    try {
      const def = parseAgentDefinitionFile(agentType, agentsDir);
      model = def.model;
    } catch {
      // Agent definition may not exist — degrade gracefully
    }
  }
  return model;
}

interface LiveHeaderState {
  usage?: ActivityFeedOutput["usage"];
  toolCount?: number;
  contextWindow?: number;
}

/** Format the two-line static tool call header. */
export function formatCallHeader(
  agentType: string,
  model: string | undefined,
  executionStarted: boolean,
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
  liveState: LiveHeaderState = {},
): string {
  let line1 = theme.bold(agentType);
  if (model) {
    line1 += "  " + theme.fg("muted", model);
  }

  const liveLine = formatLiveHeaderLine(liveState);
  const line2 = liveLine
    ? theme.fg("dim", liveLine)
    : !executionStarted
      ? theme.fg("dim", "pending...")
      : theme.fg("dim", "running...");

  return `${line1}\n${line2}`;
}

function formatLiveHeaderLine(state: LiveHeaderState): string | undefined {
  if (!state.usage) return undefined;

  const tokenCount =
    (state.usage.input ?? 0) +
    (state.usage.output ?? 0) +
    (state.usage.cacheRead ?? 0) +
    (state.usage.cacheWrite ?? 0);
  const tokenText = typeof state.contextWindow === "number"
    ? `${formatTokenNumber(tokenCount)}/${formatTokenNumber(state.contextWindow)} tokens`
    : `${formatTokenNumber(tokenCount)} tokens`;
  const parts = [tokenText];
  if (typeof state.toolCount === "number") {
    parts.push(`${state.toolCount} ${state.toolCount === 1 ? "tool" : "tools"} run`);
  }
  return parts.join(" · ");
}

function formatTokenNumber(value: number): string {
  if (value >= 1_000_000) return `${formatCompact(value / 1_000_000)}M`;
  if (value >= 1_000) return `${formatCompact(value / 1_000)}K`;
  return String(value);
}

function formatCompact(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, "");
}

function resolveModelContextWindow(model: string | undefined, agentsDir: string, cwd: string | undefined): number | undefined {
  if (!model) return undefined;
  const cacheKey = `${model}\0${agentsDir}\0${cwd ?? ""}`;
  if (modelContextWindowCache.has(cacheKey)) {
    return modelContextWindowCache.get(cacheKey);
  }

  let contextWindow: number | undefined;
  for (const path of [
    join(agentsDir, "models.json"),
    join(dirname(agentsDir), "models.json"),
    ...(cwd ? [join(cwd, "models.json")] : []),
  ]) {
    try {
      if (!existsSync(path)) continue;
      const config = JSON.parse(readFileSync(path, "utf-8"));
      const providers = config?.providers;
      if (!providers || typeof providers !== "object") continue;
      for (const provider of Object.values(providers) as any[]) {
        const models = Array.isArray(provider?.models) ? provider.models : [];
        const found = models.find((entry: any) => entry?.id === model);
        if (typeof found?.contextWindow === "number") {
          contextWindow = found.contextWindow;
          break;
        }
      }
      if (typeof contextWindow === "number") break;
    } catch {
      // Unreadable or invalid model metadata — try the next known location.
    }
  }

  modelContextWindowCache.set(cacheKey, contextWindow);
  return contextWindow;
}

function sameUsage(a: ActivityFeedOutput["usage"] | undefined, b: ActivityFeedOutput["usage"] | undefined): boolean {
  return a?.input === b?.input &&
    a?.output === b?.output &&
    a?.cacheRead === b?.cacheRead &&
    a?.cacheWrite === b?.cacheWrite;
}

function formatFeedForRender(
  feed: ActivityFeedOutput,
  expanded: boolean,
  theme: { fg: (color: string, text: string) => string },
): string {
  const view = expanded ? feed.expanded : feed.collapsed;
  const lines: string[] = [];

  if (!expanded && view.hiddenCount > 0) {
    lines.push(theme.fg("dim", formatHiddenCount(view.hiddenCount)));
  }

  for (const line of view.lines) {
    lines.push(styleActivityLine(line, theme));
  }

  return lines.join("\n");
}

function styleActivityLine(
  line: ActivityFeedLine,
  theme: { fg: (color: string, text: string) => string },
): string {
  const text = `${activityLinePrefix(line)} ${line.text}`;

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

function activityLinePrefix(line: ActivityFeedLine): string {
  if (line.type === "tool") {
    if (line.status === "succeeded") return "ok";
    if (line.status === "failed") return "fail";
    return "tool";
  }
  if (line.type === "thinking") return "think";
  if (line.type === "assistant_text") return "say";
  if (line.type === "usage") return "usage";
  if (line.type === "lifecycle") return line.status === "completed" ? "done" : "run";
  if (line.type === "terminal") {
    if (line.status === "failed") return "fail";
    if (line.status === "completed") return "done";
    return "term";
  }
  return "info";
}

function formatHiddenCount(hiddenCount: number): string {
  return `… ${hiddenCount} older event${hiddenCount === 1 ? "" : "s"} hidden …`;
}

function scheduleDeferredInvalidate(context: any): void {
  const state = context.state ?? (context.state = {});
  if (state.invalidateScheduled) return;
  state.invalidateScheduled = true;
  queueMicrotask(() => {
    state.invalidateScheduled = false;
    context.invalidate();
  });
}

function buildToolDescription(agentsDir: string): string {
  const agents = listAvailableAgents(agentsDir);
  const types = agents.length > 0 ? agents.join(", ") : "(none found)";
  return `Delegate work to a subagent. Available agent types: ${types}.`;
}

/** Format wall-clock duration in milliseconds to a human-readable string (e.g. "12.3s"). */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

/** Format a number with locale-aware comma separators (e.g. 4231 → "4,231"). */
function formatCommaNumber(n: number): string {
  return n.toLocaleString("en-US");
}

/** Build the metadata block shown in the expanded final render. */
function formatMetadataBlock(
  details: { agentId: string; agentType?: string; model?: string; duration: number; usage?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number } },
  theme: { bold: (text: string) => string; fg: (color: string, text: string) => string },
): string {
  const lines: string[] = [];

  // Agent line: "type (id: suffix)" — agent type bold, id suffix muted
  const idSuffix = details.agentId.includes("-")
    ? details.agentId.slice(details.agentId.indexOf("-") + 1)
    : details.agentId;
  const agentTypeDisplay = details.agentType ?? details.agentId;
  lines.push(theme.bold(agentTypeDisplay) + theme.fg("muted", ` (id: ${idSuffix})`));

  // Model line (muted)
  if (details.model) {
    lines.push(theme.fg("muted", `model: ${details.model}`));
  }

  // Duration line
  lines.push(theme.fg("muted", `duration: ${formatDuration(details.duration)}`));

  // Tokens line
  if (details.usage) {
    const parts: string[] = [];
    if (typeof details.usage.input === "number") {
      parts.push(`${formatCommaNumber(details.usage.input)} input`);
    }
    if (typeof details.usage.output === "number") {
      parts.push(`${formatCommaNumber(details.usage.output)} output`);
    }
    if (typeof details.usage.cacheRead === "number") {
      parts.push(`${formatCommaNumber(details.usage.cacheRead)} cache read`);
    }
    if (parts.length > 0) {
      lines.push(theme.fg("muted", `tokens: ${parts.join(" · ")}`));
    }
  }

  // Separator
  lines.push(theme.fg("dim", "─────────────────────────"));

  return lines.join("\n");
}

export default function subagentEntryPoint(
  pi: ExtensionAPI,
  options?: SubagentEntryPointOptions,
) {
  const agentsDir = options?.agentsDir ?? DEFAULT_AGENTS_DIR;

  pi.registerTool({
    name: "subagent",
    label: "Subagent",
    description: buildToolDescription(agentsDir),
    parameters: {
      type: "object",
      properties: {
        agent_type: {
          type: "string",
          description: "Type of subagent to spawn (scout, worker, etc.)",
        },
        prompt: {
          type: "string",
          description: "Task or prompt for the subagent",
        },
        model: {
          type: "string",
          description: "Optional model override for the subagent",
        },
        thinking: {
          type: "string",
          description: "Optional thinking level override for the subagent",
        },
      },
      required: ["agent_type", "prompt"],
      additionalProperties: false,
    },
    async execute(_toolCallId, params, signal, onUpdate, ctx) {
      const { agent_type, prompt, model, thinking } = params as {
        agent_type: string;
        prompt: string;
        model?: string;
        thinking?: string;
      };

      try {
        const result = await spawnSubagent({
          agentType: agent_type,
          task: prompt,
          agentsDir,
          workDir: ctx.cwd,
          signal,
          onProgress: onUpdate
            ? (feed) => {
                try {
                  onUpdate({
                    content: [{ type: "text" as const, text: feed.collapsed.text }],
                    details: feed,
                  });
                } catch {
                  // Progress delivery is best-effort; ignore UI rendering errors
                }
              }
            : undefined,
          overrides: {
            ...(model ? { model } : {}),
            ...(thinking ? { thinking } : {}),
          },
        });

        return {
          content: [{ type: "text", text: result.output }],
          details: {
            agentId: result.agentId,
            agentType: result.agentType,
            model: result.model,
            duration: result.duration,
            usage: result.usage,
            activityFeed: result.activityFeed,
          },
        };
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text", text: message }],
          details: { error: true },
        };
      }
    },

    renderCall(args: Record<string, unknown>, theme: any, context: any): Component {
      const text: Text =
        context.lastComponent instanceof Text
          ? context.lastComponent
          : new Text("", 0, 0);

      const agentType = (args.agent_type as string) || "...";
      const model = resolveModel(agentType, args, agentsDir);
      const contextWindow = resolveModelContextWindow(model, agentsDir, context.cwd);
      const header = formatCallHeader(agentType, model, !!context.executionStarted, {
        bold: theme.bold.bind(theme),
        fg: theme.fg.bind(theme),
      }, { ...(context.state ?? {}), contextWindow });

      text.setText(header);
      return text;
    },

    renderResult(result: any, options: any, theme: any, context: any): Component {
      const text: Text =
        context.lastComponent instanceof Text
          ? context.lastComponent
          : new Text("", 0, 0);

      if (options?.isPartial) {
        const details = result?.details as ActivityFeedOutput | undefined;
        const usage = details?.usage;
        const toolCount = details?.expanded?.lines?.filter((line) => line.type === "tool").length;
        const state = context.state ?? (context.state = {});
        let changed = false;

        if (usage && !sameUsage(state.usage, usage)) {
          state.usage = usage;
          changed = true;
        }
        if (typeof toolCount === "number" && state.toolCount !== toolCount) {
          state.toolCount = toolCount;
          changed = true;
        }
        if (changed) {
          scheduleDeferredInvalidate(context);
        }
      }

      const outputText = Array.isArray(result?.content)
        ? result.content
            .filter((part: any) => part?.type === "text" && typeof part.text === "string")
            .map((part: any) => part.text)
            .join("\n")
        : "";

      if (options?.isPartial && result?.details?.collapsed && result?.details?.expanded) {
        const renderedFeed = formatFeedForRender(
          result.details as ActivityFeedOutput,
          Boolean(options?.expanded),
          { fg: theme.fg.bind(theme) },
        );
        text.setText(renderedFeed || outputText);
        return text;
      }

      // For final (non-partial) results with metadata, render metadata block + separator + output
      if (!options?.isPartial && result?.details && typeof result.details.duration === "number") {
        const metadataBlock = formatMetadataBlock(result.details, {
          bold: theme.bold.bind(theme),
          fg: theme.fg.bind(theme),
        });

        const feed = result.details.activityFeed;
        const feedValid = feed && typeof feed === "object" && "expanded" in feed && "collapsed" in feed;
        if (options?.expanded && feedValid) {
          const renderedFeed = formatFeedForRender(feed as ActivityFeedOutput, true, { fg: theme.fg.bind(theme) });
          const separatorDim = theme.fg("dim", "─────────────────────────");
          text.setText(`${metadataBlock}
${renderedFeed}
${separatorDim}
${outputText}`);
        } else {
          text.setText(`${metadataBlock}
${outputText}`);
        }
      } else {
        text.setText(outputText);
      }
      return text;
    },
  });

  // Warn on startup if legacy @tintinweb/pi-subagents is still in settings.json
  pi.on("session_start", async (_event, ctx) => {
    const settingsPath = join(ctx.cwd, "settings.json");
    if (!existsSync(settingsPath)) return;

    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw);
      const packages: unknown[] =
        Array.isArray(settings.packages) ? settings.packages : [];
      const hasLegacy = packages.some(
        (pkg) =>
          typeof pkg === "string" && pkg.includes("@tintinweb/pi-subagents"),
      );
      if (hasLegacy) {
        console.warn(
          "[pi-subagents] @tintinweb/pi-subagents detected in settings.json. " +
            "Remove it before proceeding — this workspace now uses the built-in subagent runtime.",
        );
      }
    } catch {
      // Settings file unreadable or invalid JSON — silently skip
    }
  });
}
