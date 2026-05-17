import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";

type Thinking = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
type Mode = {
  description: string;
  tools?: string[];
  thinking?: Thinking;
  instructions: string;
};

const SUBAGENT_TOOLS = ["Agent", "get_subagent_result", "steer_subagent"];
const READ_ONLY_SUBAGENTS = new Set(["explore", "plan", "scout"]);

const MODES: Record<string, Mode> = {
  plan: {
    description: "read-only investigation and planning",
    tools: [
      "read",
      "bash",
      "grep",
      "find",
      "ls",
      "ask_user_question",
      "web_search",
      "plan_file",
      ...SUBAGENT_TOOLS,
    ],
    thinking: "high",
    instructions:
      "MODE: PLAN. Investigate safely, ask clarifying questions, and produce a numbered plan. Do not edit files or run mutating commands. You may use read-only subagents as context offloaders.",
  },
  build: {
    description: "focused implementation",
    tools: [
      "read",
      "bash",
      "edit",
      "write",
      "grep",
      "find",
      "ls",
      "todo",
      "ask_user_question",
      "web_search",
      ...SUBAGENT_TOOLS,
    ],
    thinking: "high",
    instructions:
      "MODE: BUILD. Implement the approved scope with surgical edits. Keep changes focused, run relevant checks, and summarize results. Use subagents only to offload broad exploration or isolated experiments.",
  },
  review: {
    description: "read-only code review",
    tools: [
      "read",
      "bash",
      "grep",
      "find",
      "ls",
      "web_search",
      "ask_user_question",
      ...SUBAGENT_TOOLS,
    ],
    thinking: "high",
    instructions:
      "MODE: REVIEW. Inspect code and diffs read-only. Find correctness, security, maintainability, and test risks. Do not modify files. You may use read-only subagents as context offloaders.",
  },
  safe: {
    description: "conservative edits with confirmation-friendly behavior",
    tools: [
      "read",
      "bash",
      "edit",
      "grep",
      "find",
      "ls",
      "todo",
      "ask_user_question",
      ...SUBAGENT_TOOLS,
    ],
    thinking: "medium",
    instructions:
      "MODE: SAFE. Prefer small, reversible changes. Ask before broad refactors, dependency changes, or destructive operations. Use subagents sparingly to avoid bloating the main context.",
  },
  yolo: {
    description:
      "fast implementation, still bounded by active permission gates",
    tools: [
      "read",
      "bash",
      "edit",
      "write",
      "grep",
      "find",
      "ls",
      "todo",
      "web_search",
      ...SUBAGENT_TOOLS,
    ],
    thinking: "medium",
    instructions:
      "MODE: YOLO. Move quickly and make pragmatic changes, but do not bypass explicit user constraints or permission gates. Use subagents when they keep the main context cleaner.",
  },
};

function getSubagentType(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const type = (input as { subagent_type?: unknown }).subagent_type;
  return typeof type === "string" ? type.toLowerCase() : undefined;
}

function availableTools(pi: ExtensionAPI, wanted: string[]): string[] {
  const all = new Set(pi.getAllTools().map((tool) => tool.name));
  return wanted.filter((tool) => all.has(tool));
}

function describeModes(): string {
  return Object.entries(MODES)
    .map(([name, mode]) => `- ${name}: ${mode.description}`)
    .join("\n");
}

export default function opencodeModes(pi: ExtensionAPI) {
  let activeMode: string | undefined;
  let activeInstructions = "";
  let previousTools: string[] | undefined;

  function updateUi(ctx: ExtensionContext): void {
    ctx.ui.setStatus(
      "opencode-mode",
      activeMode ? ctx.ui.theme.fg("accent", `mode:${activeMode}`) : undefined,
    );
  }

  async function setMode(name: string, ctx: ExtensionContext): Promise<void> {
    const mode = MODES[name];
    if (!mode) {
      ctx.ui.notify(`Unknown mode: ${name}\n${describeModes()}`, "warning");
      return;
    }

    previousTools ??= pi.getActiveTools();
    if (mode.tools) pi.setActiveTools(availableTools(pi, mode.tools));
    if (mode.thinking) pi.setThinkingLevel(mode.thinking);
    activeMode = name;
    activeInstructions = mode.instructions;
    pi.appendEntry("opencode-mode", { activeMode, previousTools });
    updateUi(ctx);
    ctx.ui.notify(`Mode set to ${name}: ${mode.description}`, "info");
  }

  function clearMode(ctx: ExtensionContext): void {
    if (previousTools) pi.setActiveTools(previousTools);
    previousTools = undefined;
    activeMode = undefined;
    activeInstructions = "";
    pi.appendEntry("opencode-mode", {
      activeMode: undefined,
      previousTools: undefined,
    });
    updateUi(ctx);
    ctx.ui.notify("Mode cleared; previous tools restored.", "info");
  }

  pi.registerCommand("mode", {
    description:
      "Switch opencode-like modes: /mode plan|build|review|safe|yolo|off|status",
    handler: async (args, ctx) => {
      const name = args.trim().toLowerCase();
      if (!name || name === "status") {
        ctx.ui.notify(
          `Active mode: ${activeMode ?? "none"}\n${describeModes()}`,
          "info",
        );
        return;
      }
      if (["off", "clear", "none"].includes(name)) return clearMode(ctx);
      await setMode(name, ctx);
    },
  });

  pi.registerShortcut(Key.ctrlAlt("m"), {
    description: "Select opencode mode",
    handler: async (ctx) => {
      const choice = await ctx.ui.select("Select mode", [
        ...Object.keys(MODES),
        "off",
      ]);
      if (!choice) return;
      if (choice === "off") clearMode(ctx);
      else await setMode(choice, ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (
      (activeMode !== "plan" && activeMode !== "review") ||
      event.toolName !== "Agent"
    )
      return;

    const subagentType = getSubagentType(event.input);
    if (!subagentType || !READ_ONLY_SUBAGENTS.has(subagentType)) {
      return {
        block: true,
        reason: `Mode ${activeMode} is read-only and only allows Explore, Plan, or Scout subagents. Requested: ${subagentType ?? "unknown"}`,
      };
    }
  });

  pi.on("before_agent_start", async (event) => {
    if (!activeMode) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Active Opencode Mode\n\n${activeInstructions}\n`,
    };
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (candidate) =>
          candidate.type === "custom" &&
          candidate.customType === "opencode-mode",
      )
      .pop() as
      | { data?: { activeMode?: string; previousTools?: string[] } }
      | undefined;
    if (entry?.data?.activeMode && MODES[entry.data.activeMode]) {
      activeMode = entry.data.activeMode;
      previousTools = entry.data.previousTools;
      activeInstructions = MODES[activeMode].instructions;
      if (MODES[activeMode].tools)
        pi.setActiveTools(availableTools(pi, MODES[activeMode].tools!));
    }
    updateUi(ctx);
  });
}
