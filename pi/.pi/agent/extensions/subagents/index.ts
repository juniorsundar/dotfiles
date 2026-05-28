import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { spawnSubagent, listAvailableAgents } from "./spawner";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_AGENTS_DIR = join(homedir(), ".pi", "agent", "agents");

export interface SubagentEntryPointOptions {
  agentsDir?: string;
}

function buildToolDescription(agentsDir: string): string {
  const agents = listAvailableAgents(agentsDir);
  const types = agents.length > 0 ? agents.join(", ") : "(none found)";
  return `Delegate work to a subagent. Available agent types: ${types}.`;
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
          details: { agentId: result.agentId },
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
