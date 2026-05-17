import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

const REVIEW_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "web_search",
  "ask_user_question",
  "Agent",
  "get_subagent_result",
  "steer_subagent",
]);
const READ_ONLY_SUBAGENTS = new Set(["explore", "plan", "scout"]);
const SAFE_BASH =
  /^\s*(git\s+(status|diff|show|log|branch)|rg\b|grep\b|find\b|ls\b|pwd\b|sed\s+-n\b|awk\b|head\b|tail\b|cat\b|wc\b|sort\b|uniq\b|diff\b)/i;
const UNSAFE_BASH =
  /\b(rm|mv|cp|mkdir|touch|chmod|chown|git\s+(add|commit|push|pull|merge|rebase|reset|checkout|stash)|npm\s+(install|ci)|pnpm\s+(install|add)|yarn\s+(install|add)|sudo)\b|>|>>/i;

function availableReviewTools(pi: ExtensionAPI): string[] {
  const all = pi.getAllTools().map((tool) => tool.name);
  return all.filter((tool) => REVIEW_TOOLS.has(tool));
}

function getSubagentType(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const type = (input as { subagent_type?: unknown }).subagent_type;
  return typeof type === "string" ? type.toLowerCase() : undefined;
}

export default function reviewModeExtension(pi: ExtensionAPI) {
  let enabled = false;
  let previousTools: string[] | undefined;

  function update(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      "review-mode",
      enabled ? ctx.ui.theme.fg("warning", "review") : undefined,
    );
    ctx.ui.setWidget(
      "review-mode",
      enabled ? ["🔎 REVIEW MODE: read-only"] : undefined,
    );
  }

  function enable(ctx: ExtensionContext): void {
    previousTools ??= pi.getActiveTools();
    pi.setActiveTools(availableReviewTools(pi));
    pi.setThinkingLevel("high");
    enabled = true;
    pi.appendEntry("review-mode", { enabled, previousTools });
    update(ctx);
    ctx.ui.notify("Review mode enabled: read-only diff/code review.", "info");
  }

  function disable(ctx: ExtensionContext): void {
    if (previousTools) pi.setActiveTools(previousTools);
    previousTools = undefined;
    enabled = false;
    pi.appendEntry("review-mode", { enabled, previousTools });
    update(ctx);
    ctx.ui.notify("Review mode disabled.", "info");
  }

  pi.registerCommand("review-mode", {
    description: "Toggle read-only code review mode",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (["on", "enable", "start"].includes(action)) return enable(ctx);
      if (["off", "disable", "stop"].includes(action)) return disable(ctx);
      if (enabled) disable(ctx);
      else enable(ctx);
    },
  });

  pi.registerShortcut(Key.ctrlAlt("r"), {
    description: "Toggle review mode",
    handler: async (ctx) => {
      if (enabled) disable(ctx);
      else enable(ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!enabled) return;
    if (!REVIEW_TOOLS.has(event.toolName))
      return {
        block: true,
        reason: `Review mode blocks ${event.toolName}; disable /review-mode to edit.`,
      };
    if (event.toolName === "Agent") {
      const subagentType = getSubagentType(event.input);
      if (!subagentType || !READ_ONLY_SUBAGENTS.has(subagentType)) {
        return {
          block: true,
          reason: `Review mode only allows read-only Explore, Plan, or Scout subagents. Requested: ${subagentType ?? "unknown"}`,
        };
      }
      return;
    }
    if (event.toolName !== "bash") return;
    const command =
      typeof (event.input as { command?: unknown }).command === "string"
        ? (event.input as { command: string }).command
        : "";
    if (UNSAFE_BASH.test(command) || !SAFE_BASH.test(command)) {
      return {
        block: true,
        reason: `Review mode blocks mutating or unrecognized shell command: ${command}`,
      };
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (!enabled) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Review Mode\n\nYou are in read-only code review mode. Inspect diffs and source for correctness, security, tests, maintainability, and regression risk. Do not modify files. You may use read-only Explore, Plan, or Scout subagents to offload broad inspection. Structure findings by severity and include file/line references when possible.\n`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (candidate) =>
          candidate.type === "custom" && candidate.customType === "review-mode",
      )
      .pop() as
      | { data?: { enabled?: boolean; previousTools?: string[] } }
      | undefined;
    if (entry?.data?.enabled) {
      enabled = true;
      previousTools = entry.data.previousTools;
      pi.setActiveTools(availableReviewTools(pi));
    }
    update(ctx);
  });
}
