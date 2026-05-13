/**
 * Plan Mode Extension
 *
 * Read-only exploration mode for safe code analysis.
 * When enabled, only read-only tools and safe bash commands are available.
 *
 * Features:
 * - /plan command or Ctrl+Alt+P to toggle
 * - /todos command to show plan progress
 * - Bash restricted to allowlisted read-only commands
 * - Controlled PLAN.md persistence via the plan_file tool
 * - Extracts numbered plan steps from "Plan:" sections
 * - [DONE:n] markers to complete steps during execution
 * - Progress tracking widget during execution
 * - Context filtering removes stale plan-mode messages when off
 * - Session persistence: state survives restarts and resumes
 */

import { StringEnum, type AssistantMessage, type TextContent } from "@earendil-works/pi-ai";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { appendFileSync, existsSync, lstatSync, readFileSync, writeFileSync } from "node:fs";
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
	const isDestructive = DESTRUCTIVE_PATTERNS.some((p) => p.test(command));
	const isSafe = SAFE_PATTERNS.some((p) => p.test(command));
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

	if (cleaned.length > 0) {
		cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
	}
	if (cleaned.length > 50) {
		cleaned = `${cleaned.slice(0, 47)}...`;
	}
	return cleaned;
}

function extractTodoItems(message: string): TodoItem[] {
	const items: TodoItem[] = [];
	const headerMatch = message.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
	if (!headerMatch) return items;

	const planSection = message.slice(message.indexOf(headerMatch[0]) + headerMatch[0].length);
	const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^*\n]+)/gm;

	for (const match of planSection.matchAll(numberedPattern)) {
		const text = match[2].trim().replace(/\*{1,2}$/, "").trim();
		if (text.length > 5 && !text.startsWith("`") && !text.startsWith("/") && !text.startsWith("-")) {
			const cleaned = cleanStepText(text);
			if (cleaned.length > 3) {
				items.push({ step: items.length + 1, text: cleaned, completed: false });
			}
		}
	}
	return items;
}

function extractDoneSteps(message: string): number[] {
	const steps: number[] = [];
	for (const match of message.matchAll(/\[DONE:(\d+)\]/gi)) {
		const step = Number(match[1]);
		if (Number.isFinite(step)) steps.push(step);
	}
	return steps;
}

function markCompletedSteps(text: string, items: TodoItem[]): number {
	const doneSteps = extractDoneSteps(text);
	for (const step of doneSteps) {
		const item = items.find((t) => t.step === step);
		if (item) item.completed = true;
	}
	return doneSteps.length;
}

// ── Type guards ──────────────────────────────────────────────────────────────

type MessageLike = { role: string; content?: unknown };

function isAssistantMessage(m: MessageLike): m is AssistantMessage {
	return m.role === "assistant" && Array.isArray(m.content);
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
		Type.String({ description: "Markdown content to write or append. Required for write and append." }),
	),
});

// Core tools allowed in plan mode. bash is included but individual commands
// are filtered by isSafeCommand() in the tool_call handler.
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
]);

/** Return plan-mode tools that are actually registered in this pi runtime. */
function availablePlanModeTools(pi: ExtensionAPI): string[] {
	return pi
		.getAllTools()
		.map((tool) => tool.name)
		.filter(
			(name) =>
				PLAN_CORE_TOOLS.has(name) ||
				name.startsWith("get_") ||
				name.startsWith("list_") ||
				name.startsWith("read_") ||
				name.startsWith("search_") ||
				name.startsWith("find_"),
		);
}

function getPlanFilePath(cwd: string): string {
	return join(cwd, PLAN_FILE_NAME);
}

function assertSafePlanFile(filePath: string): void {
	if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
		throw new Error(`Refusing to write ${PLAN_FILE_NAME}: symbolic links are not allowed in plan mode.`);
	}
}

function requirePlanFileContent(action: "write" | "append", content: string | undefined): string {
	if (typeof content !== "string") {
		throw new Error(`${action} requires a content string.`);
	}
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
						content: [{ type: "text", text: `${PLAN_FILE_NAME} does not exist yet.` }],
						details: { action: params.action, path: PLAN_FILE_NAME, exists: false },
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
	// ---- `--plan` CLI flag ----------------------------------------------------
	pi.registerFlag("plan", {
		description: "Start in plan mode (read-only exploration)",
		type: "boolean",
		default: false,
	});

	// ---- State ----------------------------------------------------------------
	let planModeEnabled = false;
	let executionMode = false;
	let todoItems: TodoItem[] = [];
	let previousActiveTools: string[] | undefined;

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
			const completed = todoItems.filter((t) => t.completed).length;
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("accent", `📋 ${completed}/${todoItems.length}`));
		} else if (planModeEnabled) {
			ctx.ui.setStatus("plan-mode", ctx.ui.theme.fg("warning", "⏸ plan"));
		} else {
			ctx.ui.setStatus("plan-mode", undefined);
		}

		if (executionMode && todoItems.length > 0) {
			const lines = todoItems.map((item) => {
				if (item.completed) {
					return ctx.ui.theme.fg("success", "☑ ") + ctx.ui.theme.fg("muted", ctx.ui.theme.strikethrough(item.text));
				}
				return `${ctx.ui.theme.fg("muted", "☐ ")}${item.text}`;
			});
			ctx.ui.setWidget("plan-todos", lines);
			ctx.ui.setWidget("plan-mode", undefined);
		} else if (planModeEnabled) {
			ctx.ui.setWidget("plan-mode", ["🔍 PLAN MODE"]);
			ctx.ui.setWidget("plan-todos", undefined);
		} else {
			ctx.ui.setWidget("plan-mode", undefined);
			ctx.ui.setWidget("plan-todos", undefined);
		}
	}

	function persistState(): void {
		pi.appendEntry("plan-mode", {
			enabled: planModeEnabled,
			todos: todoItems,
			executing: executionMode,
		});
	}

	function togglePlanMode(ctx: ExtensionContext): void {
		planModeEnabled = !planModeEnabled;
		executionMode = false;
		todoItems = [];

		if (planModeEnabled) {
			setPlanTools();
			ctx.ui.notify("Plan mode enabled. Read-only tools + safe bash + PLAN.md persistence only.");
		} else {
			restorePreviousTools();
			ctx.ui.notify("Plan mode disabled. Full access restored.");
		}
		updateStatus(ctx);
		persistState();
	}

	pi.registerCommand("plan", {
		description: "Toggle plan mode (read-only exploration)",
		handler: async (_args, ctx) => togglePlanMode(ctx),
	});

	pi.registerCommand("todos", {
		description: "Show current plan todo list",
		handler: async (_args, ctx) => {
			if (todoItems.length === 0) {
				ctx.ui.notify("No todos. Create a plan first with /plan", "info");
				return;
			}
			const list = todoItems.map((item, i) => `${i + 1}. ${item.completed ? "✓" : "○"} ${item.text}`).join("\n");
			ctx.ui.notify(`Plan Progress:\n${list}`, "info");
		},
	});

	pi.registerShortcut(Key.ctrlAlt("p"), {
		description: "Toggle plan mode",
		handler: async (ctx) => togglePlanMode(ctx),
	});

	pi.on("tool_call", async (event) => {
		if (!planModeEnabled || event.toolName !== "bash") return;

		const command = event.input.command as string;
		if (!isSafeCommand(command)) {
			return {
				block: true,
				reason: `Plan mode: command blocked (not allowlisted). Use /plan to disable plan mode first.\nCommand: ${command}`,
			};
		}
	});

	pi.on("context", async (event) => {
		if (planModeEnabled || executionMode) return;

		return {
			messages: event.messages.filter((m) => {
				const msg = m as Record<string, unknown>;
				if (msg.customType === "plan-mode-context") return false;
				if (msg.customType === "plan-execution-context") return false;

				if (m.role === "user") {
					if (typeof m.content === "string") {
						return !m.content.includes("[PLAN MODE ACTIVE]");
					}
					if (Array.isArray(m.content)) {
						return !(m.content as Array<unknown>).some((c) => {
							if (typeof c !== "object" || c === null) return false;
							const block = c as Record<string, unknown>;
							return block.type === "text" && typeof block.text === "string" && block.text.includes("[PLAN MODE ACTIVE]");
						});
					}
				}

				return true;
			}),
		};
	});

	pi.on("before_agent_start", async (_event, ctx) => {
		if (planModeEnabled) {
			const planFileStatus = existsSync(getPlanFilePath(ctx.cwd)) ? "exists" : "does not exist yet";
			return {
				message: {
					customType: "plan-mode-context",
					content: `[PLAN MODE ACTIVE]
You are in plan mode - a read-only exploration mode for safe code analysis.

Restrictions:
- You can only use: read, bash, grep, find, ls, questionnaire-style tools, read-only extension tools, and plan_file for ./PLAN.md
- You CANNOT use: edit, write (general file modifications are disabled)
- Bash is restricted to an allowlist of read-only commands (cat, ls, git status, etc.)
- The only allowed write in plan mode is via plan_file, scoped to ./PLAN.md

Plan persistence:
- ./PLAN.md status: ${planFileStatus}
- Use plan_file to read, create, replace, or append to ./PLAN.md when a plan is created or refined so context survives /reload or a restart.

Create a detailed numbered plan under a "Plan:" header:

Plan:
1. First step description
2. Second step description
...

Do NOT attempt to make changes - just describe what you would do.`,
					display: false,
				},
			};
		}

		if (executionMode && todoItems.length > 0) {
			const remaining = todoItems.filter((t) => !t.completed);
			const todoList = remaining.map((t) => `${t.step}. ${t.text}`).join("\n");
			return {
				message: {
					customType: "plan-execution-context",
					content: `[EXECUTING PLAN - Full tool access enabled]

Remaining steps:
${todoList}

Execute each step in order.
After completing a step, include a [DONE:n] tag in your response.`,
					display: false,
				},
			};
		}
	});

	pi.on("turn_end", async (event, ctx) => {
		if (!executionMode || todoItems.length === 0) return;
		if (!isAssistantMessage(event.message)) return;

		const text = getTextContent(event.message);
		if (markCompletedSteps(text, todoItems) > 0) {
			updateStatus(ctx);
		}
		persistState();
	});

	pi.on("agent_end", async (event, ctx) => {
		if (executionMode && todoItems.length > 0) {
			if (todoItems.every((t) => t.completed)) {
				const completedList = todoItems.map((t) => `~~${t.text}~~`).join("\n");
				pi.sendMessage(
					{ customType: "plan-complete", content: `**Plan Complete!** ✓\n\n${completedList}`, display: true },
					{ triggerTurn: false },
				);
				executionMode = false;
				todoItems = [];
				restorePreviousTools();
				updateStatus(ctx);
				persistState();
			}
			return;
		}

		if (!planModeEnabled || !ctx.hasUI) return;

		const lastAssistant = [...event.messages].reverse().find((m) => isAssistantMessage(m));
		if (lastAssistant) {
			const extracted = extractTodoItems(getTextContent(lastAssistant));
			if (extracted.length > 0) {
				todoItems = extracted;
			}
		}

		if (todoItems.length > 0) {
			const todoListText = todoItems.map((t, i) => `${i + 1}. ☐ ${t.text}`).join("\n");
			pi.sendMessage(
				{ customType: "plan-todo-list", content: `**Plan Steps (${todoItems.length}):**\n\n${todoListText}`, display: true },
				{ triggerTurn: false },
			);
		}

		const choice = await ctx.ui.select("Plan mode - what next?", [
			todoItems.length > 0 ? "Execute the plan (track progress)" : "Execute the plan",
			"Stay in plan mode",
			"Refine the plan",
		]);

		if (choice?.startsWith("Execute")) {
			planModeEnabled = false;
			executionMode = todoItems.length > 0;
			restorePreviousTools();
			updateStatus(ctx);

			const execMessage = todoItems.length > 0
				? `Execute the plan. Start with: ${todoItems[0].text}`
				: "Execute the plan you just created.";
			pi.sendMessage(
				{ customType: "plan-mode-execute", content: execMessage, display: true },
				{ triggerTurn: true },
			);
			persistState();
		} else if (choice === "Refine the plan") {
			const refinement = await ctx.ui.editor("Refine the plan:", "");
			if (refinement?.trim()) {
				pi.sendUserMessage(refinement.trim());
			}
		}
	});

	pi.on("session_start", async (_event, ctx) => {
		if (pi.getFlag("plan") === true) {
			planModeEnabled = true;
		}

		const entries = ctx.sessionManager.getEntries();

		const planModeEntry = entries
			.filter((e) => e.type === "custom" && e.customType === "plan-mode")
			.pop() as { data?: { enabled?: boolean; todos?: TodoItem[]; executing?: boolean } } | undefined;

		if (planModeEntry?.data) {
			planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
			todoItems = planModeEntry.data.todos ?? todoItems;
			executionMode = planModeEntry.data.executing ?? executionMode;
		}

		// Compatibility with the previous simpler version of this extension.
		const legacyEntry = entries
			.filter((e) => e.type === "custom" && e.customType === "plan-mode-toggle")
			.pop() as { data?: { active?: boolean } } | undefined;
		if (!planModeEntry?.data && legacyEntry?.data) {
			planModeEnabled = legacyEntry.data.active ?? planModeEnabled;
		}

		const isResume = planModeEntry !== undefined;
		if (isResume && executionMode && todoItems.length > 0) {
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
					const msg = (entry as { message: unknown }).message;
					if (isAssistantMessage(msg as MessageLike)) {
						messages.push(msg as AssistantMessage);
					}
				}
			}
			const allText = messages.map(getTextContent).join("\n");
			markCompletedSteps(allText, todoItems);
		}

		if (planModeEnabled) {
			setPlanTools();
		}
		updateStatus(ctx);
	});
}
