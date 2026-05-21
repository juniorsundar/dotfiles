/**
 * Plan Mode Extension
 *
 * Claude/opencode-style planning workflow for Pi:
 * - /plan or Ctrl+Alt+P enters a read-only planning mode
 * - the agent can inspect code, ask questions, and draft a numbered plan
 * - edits/writes/destructive shell commands are blocked while planning
 * - after a plan is produced, the UI asks whether to implement, refine, or stay planning
 * - implementation mode restores the previous tool set and tracks [DONE:n] markers
 */

import {
  StringEnum,
  type AssistantMessage,
  type TextContent,
} from "@earendil-works/pi-ai";
import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import {
  appendFileSync,
  existsSync,
  lstatSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Type } from "typebox";

// ── Bash command filtering ───────────────────────────────────────────────────

const DESTRUCTIVE_PATTERNS = [
  /\brm\b/i,
  /\brmdir\b/i,
  /\bmv\b/i,
  /\bcp\b/i,
  /\bmkdir\b/i,
  /\btouch\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bchgrp\b/i,
  /\bln\b/i,
  /\btee\b/i,
  /\btruncate\b/i,
  /\bdd\b/i,
  /\bshred\b/i,
  /(^|[^<])>(?!>)/,
  />>/,
  /\bnpm\s+(install|uninstall|update|ci|link|publish)/i,
  /\byarn\s+(add|remove|install|publish)/i,
  /\bpnpm\s+(add|remove|install|publish)/i,
  /\bpip\s+(install|uninstall)/i,
  /\bapt(-get)?\s+(install|remove|purge|update|upgrade)/i,
  /\bbrew\s+(install|uninstall|upgrade)/i,
  /\bgit\s+(add|commit|push|pull|merge|rebase|reset|checkout|branch\s+-[dD]|stash|cherry-pick|revert|tag|init|clone)/i,
  /\bsudo\b/i,
  /\bsu\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\bkillall\b/i,
  /\breboot\b/i,
  /\bshutdown\b/i,
  /\bsystemctl\s+(start|stop|restart|enable|disable)/i,
  /\bservice\s+\S+\s+(start|stop|restart)/i,
  /\b(vim?|nano|emacs|code|subl)\b/i,
];

const SAFE_PATTERNS = [
  /^\s*cat\b/,
  /^\s*head\b/,
  /^\s*tail\b/,
  /^\s*less\b/,
  /^\s*more\b/,
  /^\s*grep\b/,
  /^\s*find\b/,
  /^\s*ls\b/,
  /^\s*pwd\b/,
  /^\s*echo\b/,
  /^\s*printf\b/,
  /^\s*wc\b/,
  /^\s*sort\b/,
  /^\s*uniq\b/,
  /^\s*diff\b/,
  /^\s*file\b/,
  /^\s*stat\b/,
  /^\s*du\b/,
  /^\s*df\b/,
  /^\s*tree\b/,
  /^\s*which\b/,
  /^\s*whereis\b/,
  /^\s*type\b/,
  /^\s*env\b/,
  /^\s*printenv\b/,
  /^\s*uname\b/,
  /^\s*whoami\b/,
  /^\s*id\b/,
  /^\s*date\b/,
  /^\s*cal\b/,
  /^\s*uptime\b/,
  /^\s*ps\b/,
  /^\s*top\b/,
  /^\s*htop\b/,
  /^\s*free\b/,
  /^\s*git\s+(status|log|diff|show|branch|remote|config\s+--get)/i,
  /^\s*git\s+ls-/i,
  /^\s*npm\s+(list|ls|view|info|search|outdated|audit)/i,
  /^\s*yarn\s+(list|info|why|audit)/i,
  /^\s*node\s+--version/i,
  /^\s*python\s+--version/i,
  /^\s*curl\s/i,
  /^\s*wget\s+-O\s*-/i,
  /^\s*jq\b/,
  /^\s*sed\s+-n/i,
  /^\s*awk\b/,
  /^\s*rg\b/,
  /^\s*fd\b/,
  /^\s*bat\b/,
  /^\s*eza\b/,
];

function isSafeCommand(command: string): boolean {
  const isDestructive = DESTRUCTIVE_PATTERNS.some((pattern) =>
    pattern.test(command),
  );
  const isSafe = SAFE_PATTERNS.some((pattern) => pattern.test(command));
  return !isDestructive && isSafe;
}

// ── Plan step extraction ────────────────────────────────────────────────────

interface TodoItem {
  step: number;
  text: string;
  completed: boolean;
}

function cleanStepText(text: string): string {
  let cleaned = text
    .replace(/\*{1,2}([^*]+)\*{1,2}/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(
      /^(Use|Run|Execute|Create|Write|Read|Check|Verify|Update|Modify|Add|Remove|Delete|Install)\s+(the\s+)?/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length > 0)
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  if (cleaned.length > 72) cleaned = `${cleaned.slice(0, 69)}...`;
  return cleaned;
}

function extractTodoItems(message: string): TodoItem[] {
  const items: TodoItem[] = [];
  const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
  if (!headerMatch) return items;

  const planSection = message.slice(
    message.indexOf(headerMatch[0]) + headerMatch[0].length,
  );
  const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^\n]+)/gm;

  for (const match of planSection.matchAll(numberedPattern)) {
    const text = match[2]
      .trim()
      .replace(/\*{1,2}$/, "")
      .trim();
    if (
      text.length > 5 &&
      !text.startsWith("`") &&
      !text.startsWith("/") &&
      !text.startsWith("-")
    ) {
      const cleaned = cleanStepText(text);
      if (cleaned.length > 3)
        items.push({ step: items.length + 1, text: cleaned, completed: false });
    }
  }
  return items;
}

function markCompletedSteps(text: string, items: TodoItem[]): number {
  let completed = 0;
  for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
    const step = Number(match[1]);
    const item = Number.isFinite(step)
      ? items.find((candidate) => candidate.step === step)
      : undefined;
    if (item && !item.completed) {
      item.completed = true;
      completed++;
    }
  }
  return completed;
}

// ── Type guards ──────────────────────────────────────────────────────────────

type MessageLike = { role: string; content?: unknown };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAssistantMessage(message: MessageLike): message is AssistantMessage {
  return message.role === "assistant" && Array.isArray(message.content);
}

function getTextContent(message: AssistantMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}

// ── Tool set discovery ──────────────────────────────────────────────────────

const PLAN_FILE_NAME = "PLAN.md";
const PLAN_FILE_TOOL = "plan_file";
const PLAN_FILE_ACTIONS = ["read", "write", "append"] as const;

const PLAN_FILE_PARAMS = Type.Object({
  action: StringEnum(PLAN_FILE_ACTIONS, {
    description: "Operation to perform on ./PLAN.md.",
  }),
  content: Type.Optional(
    Type.String({
      description:
        "Markdown content to write or append. Required for write and append.",
    }),
  ),
});

// bash is included, but individual commands are filtered by isSafeCommand().
const PLAN_CORE_TOOLS = new Set([
  "read",
  "bash",
  "grep",
  "find",
  "ls",
  "web_search",
  "web_fetch",
  PLAN_FILE_TOOL,
  "questionnaire",
  "ask_user_question",
  "Agent",
  "get_subagent_result",
  "steer_subagent",
]);
const READ_ONLY_SUBAGENTS = new Set(["explore", "plan", "scout"]);

function isPlanToolName(name: string): boolean {
  return (
    PLAN_CORE_TOOLS.has(name) ||
    name.startsWith("get_") ||
    name.startsWith("list_") ||
    name.startsWith("read_") ||
    name.startsWith("search_") ||
    name.startsWith("find_")
  );
}

function getSubagentType(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const type = (input as { subagent_type?: unknown }).subagent_type;
  return typeof type === "string" ? type.toLowerCase() : undefined;
}

function availablePlanModeTools(pi: ExtensionAPI): string[] {
  return pi
    .getAllTools()
    .map((tool) => tool.name)
    .filter(isPlanToolName);
}

function getPlanFilePath(cwd: string): string {
  return join(cwd, PLAN_FILE_NAME);
}

function assertSafePlanFile(filePath: string): void {
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    throw new Error(
      `Refusing to write ${PLAN_FILE_NAME}: symbolic links are not allowed in plan mode.`,
    );
  }
}

function requirePlanFileContent(
  action: "write" | "append",
  content: string | undefined,
): string {
  if (typeof content !== "string")
    throw new Error(`${action} requires a content string.`);
  return content;
}

function registerPlanFileTool(pi: ExtensionAPI): void {
  pi.registerTool({
    name: PLAN_FILE_TOOL,
    label: "Plan File",
    description:
      "Read, create, replace, or append to ./PLAN.md only. Use this in plan mode to preserve planning context across reloads.",
    promptSnippet: "Read or update only ./PLAN.md for persistent plan context",
    promptGuidelines: [
      "Use plan_file in plan mode to create or update ./PLAN.md when a plan is created or refined so context survives reloads.",
      "The plan_file tool is scoped only to ./PLAN.md; do not use it for general file edits.",
    ],
    parameters: PLAN_FILE_PARAMS,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const filePath = getPlanFilePath(ctx.cwd);
      assertSafePlanFile(filePath);

      const existedBefore = existsSync(filePath);

      if (params.action === "read") {
        if (!existedBefore) {
          return {
            content: [
              { type: "text", text: `${PLAN_FILE_NAME} does not exist yet.` },
            ],
            details: {
              action: params.action,
              path: PLAN_FILE_NAME,
              exists: false,
            },
          };
        }

        const content = readFileSync(filePath, "utf8");
        return {
          content: [{ type: "text", text: `${PLAN_FILE_NAME}:\n\n${content}` }],
          details: {
            action: params.action,
            path: PLAN_FILE_NAME,
            exists: true,
            bytes: Buffer.byteLength(content, "utf8"),
          },
        };
      }

      if (params.action === "write") {
        const content = requirePlanFileContent(params.action, params.content);
        writeFileSync(filePath, content, "utf8");
        return {
          content: [
            {
              type: "text",
              text: `${existedBefore ? "Updated" : "Created"} ${PLAN_FILE_NAME} (${Buffer.byteLength(content, "utf8")} bytes).`,
            },
          ],
          details: {
            action: params.action,
            path: PLAN_FILE_NAME,
            created: !existedBefore,
            bytes: Buffer.byteLength(content, "utf8"),
          },
        };
      }

      const content = requirePlanFileContent(params.action, params.content);
      const needsSeparator =
        existedBefore &&
        readFileSync(filePath, "utf8").length > 0 &&
        content.length > 0 &&
        !content.startsWith("\n");
      const appended = `${needsSeparator ? "\n" : ""}${content}`;
      appendFileSync(filePath, appended, "utf8");
      return {
        content: [
          {
            type: "text",
            text: `${existedBefore ? "Appended to" : "Created"} ${PLAN_FILE_NAME} (${Buffer.byteLength(appended, "utf8")} bytes appended).`,
          },
        ],
        details: {
          action: params.action,
          path: PLAN_FILE_NAME,
          created: !existedBefore,
          bytesAppended: Buffer.byteLength(appended, "utf8"),
        },
      };
    },
  });
}

// ── Extension ───────────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
  registerPlanFileTool(pi);

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  let planModeEnabled = false;
  let executionMode = false;
  let todoItems: TodoItem[] = [];
  let previousActiveTools: string[] | undefined;

  function persistState(): void {
    pi.appendEntry("plan-mode", {
      enabled: planModeEnabled,
      todos: todoItems,
      executing: executionMode,
      previousActiveTools,
    });
  }

  function setPlanTools(): void {
    previousActiveTools ??= pi.getActiveTools();
    pi.setActiveTools(availablePlanModeTools(pi));
  }

  function restorePreviousTools(): void {
    if (!previousActiveTools) return;
    pi.setActiveTools(previousActiveTools);
    previousActiveTools = undefined;
  }

  function updateStatus(ctx: ExtensionContext): void {
    if (executionMode && todoItems.length > 0) {
      const completed = todoItems.filter((todo) => todo.completed).length;
      ctx.ui.setStatus(
        "plan-mode",
        ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`),
      );
    } else if (planModeEnabled) {
      ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }

    // Do not render a separate plan todo widget. rpiv-todo already owns
    // visible todo UI, while plan mode only keeps internal progress state.
    ctx.ui.setWidget("plan-todos", undefined);

    if (executionMode && todoItems.length > 0) {
      ctx.ui.setWidget("plan-mode", undefined);
    } else if (planModeEnabled) {
      ctx.ui.setWidget("plan-mode", ["🔍 PLAN MODE: read-only until approved"]);
    } else {
      ctx.ui.setWidget("plan-mode", undefined);
    }
  }

  function enterPlanMode(ctx: ExtensionContext): void {
    planModeEnabled = true;
    executionMode = false;
    todoItems = [];
    setPlanTools();
    ctx.ui.notify(
      "Plan mode enabled. I can inspect and draft a plan, but cannot edit until you approve it.",
      "info",
    );
    updateStatus(ctx);
    persistState();
  }

  function exitPlanMode(ctx: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = false;
    todoItems = [];
    restorePreviousTools();
    ctx.ui.notify("Plan mode disabled. Previous tool access restored.", "info");
    updateStatus(ctx);
    persistState();
  }

  function startExecution(ctx: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = todoItems.length > 0;
    restorePreviousTools();
    updateStatus(ctx);
    persistState();
  }

  pi.registerCommand("plan", {
    description: "Toggle plan mode, or use /plan on|off|status",
    handler: async (args, ctx) => {
      const mode = args.trim().toLowerCase();
      if (["on", "start", "enable"].includes(mode)) return enterPlanMode(ctx);
      if (["off", "stop", "disable", "exit"].includes(mode))
        return exitPlanMode(ctx);
      if (mode === "status") {
        const state = executionMode
          ? "executing"
          : planModeEnabled
            ? "planning"
            : "off";
        ctx.ui.notify(
          `Plan mode: ${state}. Steps: ${todoItems.length}.`,
          "info",
        );
        return;
      }

      if (planModeEnabled || executionMode) exitPlanMode(ctx);
      else enterPlanMode(ctx);
    },
  });

  pi.registerShortcut(Key.ctrlAlt("p"), {
    description: "Toggle plan mode",
    handler: async (ctx) => {
      if (planModeEnabled || executionMode) exitPlanMode(ctx);
      else enterPlanMode(ctx);
    },
  });

  pi.on("tool_call", async (event) => {
    if (!planModeEnabled) return;

    if (!isPlanToolName(event.toolName)) {
      return {
        block: true,
        reason: `Plan mode: ${event.toolName} is not available until the plan is approved.`,
      };
    }

    if (event.toolName === "Agent") {
      const subagentType = getSubagentType(event.input);
      if (!subagentType || !READ_ONLY_SUBAGENTS.has(subagentType)) {
        return {
          block: true,
          reason: `Plan mode only allows read-only Explore, Plan, or Scout subagents. Requested: ${subagentType ?? "unknown"}`,
        };
      }
      return;
    }

    if (event.toolName !== "bash") return;

    const command =
      isRecord(event.input) && typeof event.input.command === "string"
        ? event.input.command
        : "";
    if (!isSafeCommand(command)) {
      return {
        block: true,
        reason: `Plan mode: shell command blocked because it is not read-only/allowlisted.\nCommand: ${command}`,
      };
    }
  });

  pi.on("context", async (event) => {
    if (planModeEnabled || executionMode) return;

    return {
      messages: event.messages.filter((message) => {
        const msg = message as unknown as Record<string, unknown>;
        if (
          msg.customType === "plan-mode-context" ||
          msg.customType === "plan-execution-context"
        )
          return false;

        if (message.role !== "user") return true;
        if (typeof message.content === "string")
          return !message.content.includes("[PLAN MODE ACTIVE]");
        if (!Array.isArray(message.content)) return true;

        return !message.content.some((contentBlock) => {
          if (typeof contentBlock !== "object" || contentBlock === null)
            return false;
          const block = contentBlock as unknown as Record<string, unknown>;
          return (
            block.type === "text" &&
            typeof block.text === "string" &&
            block.text.includes("[PLAN MODE ACTIVE]")
          );
        });
      }),
    };
  });

  pi.on("before_agent_start", async (_event, ctx) => {
    if (planModeEnabled) {
      const planFileStatus = existsSync(getPlanFilePath(ctx.cwd))
        ? "exists"
        : "does not exist yet";
      const tools = availablePlanModeTools(pi).join(", ");
      return {
        message: {
          customType: "plan-mode-context",
          content: `[PLAN MODE ACTIVE]
You are in Claude/opencode-style plan mode.

Behavior:
- Investigate the codebase and ask concise clarifying questions if needed.
- Do not implement, edit files, install packages, or run mutating shell commands.
- Produce a concrete numbered plan and wait for user approval before execution.
- Prefer a "Plan:" header with numbered steps so Pi can track progress.

Available planning tools: ${tools || "read-only tools"}
Restrictions:
- edit/write are disabled.
- bash is restricted to read-only allowlisted commands.
- Subagents are allowed only for read-only context offloading: Explore, Plan, or Scout.
- The only planning write is plan_file, scoped to ./PLAN.md.

Plan persistence:
- ./PLAN.md status: ${planFileStatus}
- Use plan_file when useful to save or refine the proposed plan.

Required response shape when ready:
Plan:
1. First implementation step
2. Second implementation step
...

Do not start executing the plan in this response.`,
          display: false,
        },
      };
    }

    if (executionMode && todoItems.length > 0) {
      const remaining = todoItems.filter((todo) => !todo.completed);
      const todoList = remaining
        .map((todo) => `${todo.step}. ${todo.text}`)
        .join("\n");
      return {
        message: {
          customType: "plan-execution-context",
          content: `[EXECUTING APPROVED PLAN]

Execute the approved plan one step at a time.
Remaining steps:
${todoList}

After completing each step, include the matching [DONE:n] marker in your response.`,
          display: false,
        },
      };
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!executionMode || todoItems.length === 0) return;
    if (!isAssistantMessage(event.message as MessageLike)) return;

    const text = getTextContent(event.message as AssistantMessage);
    if (markCompletedSteps(text, todoItems) > 0) updateStatus(ctx);
    persistState();
  });

  pi.on("agent_end", async (event, ctx) => {
    if (executionMode && todoItems.length > 0) {
      if (todoItems.every((todo) => todo.completed)) {
        const completedList = todoItems
          .map((todo) => `~~${todo.text}~~`)
          .join("\n");
        pi.sendMessage(
          {
            customType: "plan-complete",
            content: `**Plan Complete!** ✓\n\n${completedList}`,
            display: true,
          },
          { triggerTurn: false },
        );
        executionMode = false;
        todoItems = [];
        updateStatus(ctx);
        persistState();
      }
      return;
    }

    if (!planModeEnabled || !ctx.hasUI) return;

    const lastAssistant = [...event.messages]
      .reverse()
      .find((message) => isAssistantMessage(message as MessageLike));
    if (lastAssistant) {
      const extracted = extractTodoItems(
        getTextContent(lastAssistant as AssistantMessage),
      );
      if (extracted.length > 0) todoItems = extracted;
    }

    if (todoItems.length > 0) {
      const todoListText = todoItems
        .map((todo, index) => `${index + 1}. ☐ ${todo.text}`)
        .join("\n");
      pi.sendMessage(
        {
          customType: "plan-todo-list",
          content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`,
          display: true,
        },
        { triggerTurn: false },
      );
    }

    persistState();

    const choice = await ctx.ui.select("Plan mode - what next?", [
      todoItems.length > 0
        ? "Approve and execute plan"
        : "Exit plan mode and execute",
      "Stay in plan mode",
      "Refine the plan",
      "Exit plan mode without executing",
    ]);

    if (
      choice?.startsWith("Approve") ||
      choice?.startsWith("Exit plan mode and execute")
    ) {
      startExecution(ctx);
      const execMessage =
        todoItems.length > 0
          ? `The user approved the plan. Execute it now, starting with step 1: ${todoItems[0].text}`
          : "The user approved exiting plan mode. Execute the plan you just proposed.";
      pi.sendMessage(
        {
          customType: "plan-mode-execute",
          content: execMessage,
          display: true,
        },
        { triggerTurn: true },
      );
    } else if (choice === "Refine the plan") {
      const refinement = await ctx.ui.editor("Refine the plan:", "");
      if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
    } else if (choice === "Exit plan mode without executing") {
      exitPlanMode(ctx);
    } else {
      updateStatus(ctx);
      persistState();
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    if (pi.getFlag("plan") === true) planModeEnabled = true;

    const entries = ctx.sessionManager.getEntries();
    const planModeEntry = entries
      .filter(
        (entry) => entry.type === "custom" && entry.customType === "plan-mode",
      )
      .pop() as
      | {
          data?: {
            enabled?: boolean;
            todos?: TodoItem[];
            executing?: boolean;
            previousActiveTools?: string[];
          };
        }
      | undefined;

    if (planModeEntry?.data) {
      planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
      todoItems = planModeEntry.data.todos ?? todoItems;
      executionMode = planModeEntry.data.executing ?? executionMode;
      previousActiveTools =
        planModeEntry.data.previousActiveTools ?? previousActiveTools;
    }

    // Compatibility with older local versions of this extension.
    const legacyEntry = entries
      .filter(
        (entry) =>
          entry.type === "custom" && entry.customType === "plan-mode-toggle",
      )
      .pop() as { data?: { active?: boolean } } | undefined;
    if (!planModeEntry?.data && legacyEntry?.data)
      planModeEnabled = legacyEntry.data.active ?? planModeEnabled;

    if (executionMode && todoItems.length > 0) {
      let executeIndex = -1;
      for (let i = entries.length - 1; i >= 0; i--) {
        const entry = entries[i] as { type: string; customType?: string };
        if (entry.customType === "plan-mode-execute") {
          executeIndex = i;
          break;
        }
      }

      const messages: AssistantMessage[] = [];
      for (let i = executeIndex + 1; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.type === "message" && "message" in entry) {
          const message = (entry as { message: unknown }).message;
          if (isAssistantMessage(message as MessageLike))
            messages.push(message as AssistantMessage);
        }
      }
      markCompletedSteps(messages.map(getTextContent).join("\n"), todoItems);
    }

    if (planModeEnabled) setPlanTools();
    updateStatus(ctx);
  });
}
