/**
 * Plan Mode Extension — v2
 *
 * A question-first, phased planning workflow for Pi:
 *
 * 1. /plan enters scoping mode — agent investigates and asks clarifying questions
 * 2. Once all ambiguity is resolved, agent drafts a phased plan in PLAN.md
 * 3. User reviews/approves the plan
 * 4. Execution proceeds phase-by-phase with review verification between phases
 *
 * PLAN.md format:
 *   # Plan: [Title]
 *   > Status: scoping | ready | executing | complete
 *
 *   ## Decisions
 *   - **Topic**: Decision
 *
 *   ## Phase 1: [Name] → `path/to/files`
 *   - [1.1] Step description
 *   - [1.2] Step description
 *   🔍 **Review**: What to verify
 *
 * Progress tracking:
 *   Use the shared todo tool as the visible source of truth for phases/steps.
 *   PLAN.md remains the durable plan document.
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

// ── PLAN.md Parsing ──────────────────────────────────────────────────────────

type PlanStatus = "scoping" | "ready" | "executing" | "complete";

interface ParsedStep {
  id: string; // e.g. "1.1", "2.3"
  phase: number;
  step: number;
  text: string;
}

interface ParsedPhase {
  number: number;
  name: string;
  locations: string[];
  steps: ParsedStep[];
  review: string;
}

interface ParsedPlan {
  title: string;
  status: PlanStatus;
  decisions: string[];
  phases: ParsedPhase[];
  allSteps: ParsedStep[];
}

function parsePlanMd(content: string): ParsedPlan | null {
  if (!content || content.trim().length === 0) return null;

  const titleMatch = content.match(/^#\s+Plan:\s+(.+)$/m);
  const statusMatch = content.match(/^>\s*Status:\s*(\w+)/m);

  const title = titleMatch?.[1]?.trim() ?? "Untitled";
  const status = (statusMatch?.[1]?.trim() as PlanStatus) ?? "scoping";

  // Extract decisions from ## Decisions section
  const decisions: string[] = [];
  const decisionsMatch = content.match(
    /##\s+Decisions\s*\n([\s\S]*?)(?=\n## |$)/,
  );
  if (decisionsMatch) {
    for (const line of decisionsMatch[1].split("\n")) {
      const trimmed = line.trim();
      if (trimmed.startsWith("-")) {
        decisions.push(trimmed.replace(/^-\s*/, ""));
      }
    }
  }

  // Extract phases
  const phases: ParsedPhase[] = [];
  const allSteps: ParsedStep[] = [];
  const phaseRegex =
    /##\s+Phase\s+(\d+):\s+(.+?)(?:\s*[→→]\s*(.+?))?\s*$/gm;

  let match: RegExpExecArray | null;
  while ((match = phaseRegex.exec(content)) !== null) {
    const phaseNum = parseInt(match[1]);
    const phaseName = match[2].trim();
    const locationStr = match[3] ?? "";
    const locations = locationStr
      .split(",")
      .map((s: string) => s.trim().replace(/`/g, ""))
      .filter((s: string) => s.length > 0);

    // Find content from this phase header to the next ## header or end
    const phaseStart = match.index + match[0].length;
    const nextSection = content.indexOf("\n## ", phaseStart);
    const phaseContent = content.slice(
      phaseStart,
      nextSection === -1 ? undefined : nextSection,
    );

    const steps: ParsedStep[] = [];
    let review = "";

    for (const line of phaseContent.split("\n")) {
      const stepMatch = line.match(
        /^\s*-\s*\[(\d+)\.(\d+)\]\s*(.+)$/,
      );
      if (stepMatch) {
        const step: ParsedStep = {
          id: `${stepMatch[1]}.${stepMatch[2]}`,
          phase: parseInt(stepMatch[1]),
          step: parseInt(stepMatch[2]),
          text: stepMatch[3].trim(),
        };
        steps.push(step);
        allSteps.push(step);
      }
      const reviewMatch = line.match(
        /^\s*🔍\s*\*{0,2}Review\*{0,2}:\s*(.+)$/,
      );
      if (reviewMatch) {
        review = reviewMatch[1].trim().replace(/\*{0,2}$/, "");
      }
    }

    // Fallback: also parse old-style integer steps (e.g. "1." instead of "1.1")
    if (steps.length === 0) {
      for (const line of phaseContent.split("\n")) {
        const oldStepMatch = line.match(/^\s*(\d+)[.)]\s+\*{0,2}([^\n]+)/);
        if (oldStepMatch) {
          const text = oldStepMatch[2].trim().replace(/\*{1,2}$/, "").trim();
          if (text.length > 5) {
            const step: ParsedStep = {
              id: `${phaseNum}.${steps.length + 1}`,
              phase: phaseNum,
              step: steps.length + 1,
              text,
            };
            steps.push(step);
            allSteps.push(step);
          }
        }
      }
    }

    phases.push({ number: phaseNum, name: phaseName, locations, steps, review });
  }

  // Fallback for old-style plans without phase headers
  if (phases.length === 0) {
    const headerMatch = content.match(/\*{0,2}Plan:\*{0,2}\s*\n/i);
    if (headerMatch) {
      const planSection = content.slice(
        content.indexOf(headerMatch[0]) + headerMatch[0].length,
      );
      const numberedPattern = /^\s*(\d+)[.)]\s+\*{0,2}([^\n]+)/gm;
      const steps: ParsedStep[] = [];
      let numMatch: RegExpExecArray | null;
      while ((numMatch = numberedPattern.exec(planSection)) !== null) {
        const text = numMatch[2].trim().replace(/\*{1,2}$/, "").trim();
        if (
          text.length > 5 &&
          !text.startsWith("`") &&
          !text.startsWith("/") &&
          !text.startsWith("-")
        ) {
          const step: ParsedStep = {
            id: `1.${steps.length + 1}`,
            phase: 1,
            step: steps.length + 1,
            text: text.length > 72 ? `${text.slice(0, 69)}...` : text,
          };
          steps.push(step);
        }
      }
      if (steps.length > 0) {
        phases.push({
          number: 1,
          name: "Implementation",
          locations: [],
          steps,
          review: "",
        });
        allSteps.push(...steps);
      }
    }
  }

  return { title, status, decisions, phases, allSteps };
}

// ── Progress Tracking ────────────────────────────────────────────────────────

interface StepProgress {
  id: string;
  completed: boolean;
}

interface PhaseProgress {
  number: number;
  completed: boolean;
}

interface PlanProgress {
  steps: StepProgress[];
  phases: PhaseProgress[];
}

function markCompletedSteps(text: string, steps: StepProgress[]): number {
  let completed = 0;
  for (const match of text.matchAll(/\[DONE:(\d+\.\d+)\]/gi)) {
    const id = match[1];
    const step = steps.find((s) => s.id === id);
    if (step && !step.completed) {
      step.completed = true;
      completed++;
    }
  }
  // Fallback: old-style [DONE:N] markers
  for (const match of text.matchAll(/\[DONE:(\d+)\]/gi)) {
    const stepNum = parseInt(match[1]);
    const step = steps.find(
      (s) => s.phase === 1 && s.step === stepNum && !s.completed,
    );
    if (step) {
      step.completed = true;
      completed++;
    }
  }
  return completed;
}

function markCompletedPhases(text: string, phases: PhaseProgress[]): number {
  let completed = 0;
  for (const match of text.matchAll(/\[PHASE_DONE:(\d+)\]/gi)) {
    const phaseNum = parseInt(match[1]);
    const phase = phases.find((p) => p.number === phaseNum);
    if (phase && !phase.completed) {
      phase.completed = true;
      completed++;
    }
  }
  return completed;
}

function getPhaseForStep(steps: ParsedStep[], stepId: string): number | null {
  const step = steps.find((s) => s.id === stepId);
  return step?.phase ?? null;
}

function isFirstUncompletedPhase(
  phases: ParsedPhase[],
  progress: PlanProgress,
  phaseNum: number,
): boolean {
  for (const phase of phases) {
    const progressPhase = progress.phases.find(
      (p) => p.number === phase.number,
    );
    const completed = progressPhase?.completed ?? false;
    if (!completed) return phase.number === phaseNum;
  }
  return false;
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
  "todo",
  "subagent",
]);
const PLANNING_SUBAGENTS = new Set(["scout", "planner"]);

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
  const type = (input as { agent_type?: unknown }).agent_type;
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
      `PLAN.md must follow this format:\n\n# Plan: [Title]\n> Status: scoping | ready | executing | complete\n\n## Decisions\n- **Topic**: Decision\n\n## Phase N: [Name] → \`path/to/files\`\n- [N.1] Step description\n- [N.2] Step description\n🔍 **Review**: Criteria to verify after this phase\n\nSet status to "scoping" while asking questions, "ready" when the plan is ready for approval, "executing" during implementation, and "complete" when done.`,
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
              {
                type: "text",
                text: `${PLAN_FILE_NAME} does not exist yet. Create it using plan_file with action=write.`,
              },
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

// ── System Prompts ───────────────────────────────────────────────────────────

function scopingPrompt(tools: string, planFileStatus: string): string {
  return `[PLAN MODE — SCOPING STAGE]
You are in plan mode. Your PRIMARY job is to clarify scope BEFORE writing any implementation plan.

## Mandatory Process

### Step 1: Investigate
Use read-only tools to understand the codebase, the request, and existing patterns.

### Step 2: Ask exhaustively
Use ask_user_question to ask clarifying questions. You MUST ask at least one round of questions before drafting a plan.

Ask about:
- **Scope boundaries**: What is explicitly in scope? What is out of scope?
- **Edge cases**: How should errors and unusual inputs be handled?
- **Style & patterns**: Are there existing patterns or conventions to follow?
- **Priority & ordering**: Which aspects matter most? What should be done first?
- **Performance & constraints**: Any performance requirements or constraints?
- **Compatibility**: What must remain backward-compatible?
- **Testing**: What level of test coverage is expected?

Ask up to 4 questions at a time. Keep asking rounds until ALL ambiguity is resolved.

### Step 3: Draft the plan
Only when all questions are answered, write a structured phased plan to PLAN.md using plan_file.

PLAN.md format:
\`\`\`markdown
# Plan: [Title]
> Status: scoping

## Decisions
- **Scope**: [what's included/excluded and why]
- **Approach**: [chosen implementation approach]
- **Patterns**: [existing patterns to follow]
- **Priority**: [ordering rationale]

## Phase 1: [Descriptive Name] → \`path/to/file1.ts\`, \`path/to/file2.ts\`
- [1.1] Concrete, actionable step
- [1.2] Another step
🔍 **Review**: [specific criteria to verify this phase is correct]

## Phase N: Integration & Verification → \`path/to/test.ts\`
- [N.1] Final integration steps
🔍 **Review**: Run full test suite, verify all requirements met
\`\`\`

Each phase MUST:
1. Specify WHERE changes will be made (file paths after →)
2. Contain concrete, actionable steps with [N.M] numbering
3. End with 🔍 **Review**: criteria for verifying the phase

Use plan_file action=write to create/update the plan. Set status to "ready" once the plan is final.

Available planning tools: ${tools}

Restrictions:
- edit/write are disabled
- bash is restricted to read-only allowlisted commands
- Subagents: only scout or planner for read-only planning work
- plan_file is the only file-write tool, scoped to ./PLAN.md
- todo is available for visible phase/step tracking; use it instead of plan-mode widgets

Plan persistence:
- ./PLAN.md status: ${planFileStatus}
- Use plan_file to save progress so context survives reloads.`;
}

function executionPrompt(
  phases: ParsedPhase[],
  _progress: PlanProgress,
  planTitle: string,
): string {
  const phaseSummary = phases
    .map((phase) => {
      const steps = phase.steps
        .map((step) => `  - [${step.id}] ${step.text}`)
        .join("\n");
      return [
        `## Phase ${phase.number}: ${phase.name}`,
        `Files: ${phase.locations.length > 0 ? phase.locations.join(", ") : "see PLAN.md"}`,
        steps || "  - No concrete steps parsed; read PLAN.md for details.",
        `Review: ${phase.review || "(no specific review criteria)"}`,
      ].join("\n");
    })
    .join("\n\n");

  return `[EXECUTING APPROVED PLAN]

Plan: ${planTitle}

Use the todo tool as the visible source of truth for phase/step progress:
- If todos for this plan are not already present, create them from PLAN.md before editing.
- Prefer one todo per phase for small plans, or one todo per concrete step for detailed plans.
- Keep exactly one todo in_progress at a time.
- Mark each todo completed immediately after its work and review criteria are satisfied.
- When all work is done, update PLAN.md to \`> Status: complete\` with plan_file.

Do not emit [DONE:x.y] or [PHASE_DONE:x] progress markers; update the todo list instead.

Approved phases from PLAN.md:
${phaseSummary}`;
}

// ── Extension ────────────────────────────────────────────────────────────────

export default function planModeExtension(pi: ExtensionAPI): void {
  registerPlanFileTool(pi);

  pi.registerFlag("plan", {
    description: "Start in plan mode (read-only exploration)",
    type: "boolean",
    default: false,
  });

  let planModeEnabled = false;
  let executionMode = false;
  let previousActiveTools: string[] | undefined;

  // Phase-aware progress tracking
  let steps: StepProgress[] = [];
  let phases: PhaseProgress[] = [];
  let planTitle = "";
  let planningStage: "scoping" | "ready" | "executing" | "complete" | "off" =
    "off";

  function persistState(): void {
    pi.appendEntry("plan-mode", {
      enabled: planModeEnabled,
      executing: executionMode,
      previousActiveTools,
      steps,
      phases,
      planTitle,
      planningStage,
    });
  }

  function readPlanFile(cwd: string): ParsedPlan | null {
    const filePath = getPlanFilePath(cwd);
    if (!existsSync(filePath)) return null;
    try {
      const content = readFileSync(filePath, "utf8");
      return parsePlanMd(content);
    } catch {
      return null;
    }
  }

  function syncProgressFromPlan(ctx: ExtensionContext): void {
    const plan = readPlanFile(ctx.cwd);
    if (!plan) return;

    planningStage = plan.status;
    planTitle = plan.title;

    // Initialize phase progress from parsed plan
    const newPhases: PhaseProgress[] = plan.phases.map((p) => ({
      number: p.number,
      completed: false,
    }));

    // Merge with existing progress
    for (const newPhase of newPhases) {
      const existing = phases.find((p) => p.number === newPhase.number);
      if (existing) newPhase.completed = existing.completed;
    }
    phases = newPhases;

    // Initialize step progress from parsed plan
    const newSteps: StepProgress[] = plan.allSteps.map((s) => ({
      id: s.id,
      completed: false,
    }));

    // Merge with existing progress
    for (const newStep of newSteps) {
      const existing = steps.find((s) => s.id === newStep.id);
      if (existing) newStep.completed = existing.completed;
    }
    steps = newSteps;
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
    if (executionMode) {
      ctx.ui.setStatus(
        "plan-mode",
        ctx.ui.theme.fg("accent", "plan:executing"),
      );
    } else if (planModeEnabled) {
      const stageLabel =
        planningStage === "scoping"
          ? "scoping"
          : planningStage === "ready"
            ? "ready"
            : "planning";
      ctx.ui.setStatus(
        "plan-mode",
        ctx.ui.theme.fg("warning", `plan:${stageLabel}`),
      );
    } else {
      ctx.ui.setStatus("plan-mode", undefined);
    }

    // The shared todo UI is the visible phase/step tracker. Keep plan mode from
    // adding a second persistent widget with duplicate progress information.
    ctx.ui.setWidget("plan-mode", undefined);
  }

  function enterPlanMode(ctx: ExtensionContext): void {
    planModeEnabled = true;
    executionMode = false;
    planningStage = "scoping";
    steps = [];
    phases = [];
    setPlanTools();
    syncProgressFromPlan(ctx);
    ctx.ui.notify(
      "Plan mode enabled. I will investigate and ask clarifying questions before writing any implementation plan.",
      "info",
    );
    updateStatus(ctx);
    persistState();
  }

  function exitPlanMode(ctx: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = false;
    planningStage = "off";
    steps = [];
    phases = [];
    restorePreviousTools();
    ctx.ui.notify("Plan mode disabled. Previous tool access restored.", "info");
    updateStatus(ctx);
    persistState();
  }

  function startExecution(ctx: ExtensionContext): void {
    planModeEnabled = false;
    executionMode = true;
    planningStage = "executing";
    syncProgressFromPlan(ctx);
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
            ? planningStage
            : "off";
        ctx.ui.notify(
          `Plan mode: ${state}. Steps: ${steps.length}. Phases: ${phases.length}.`,
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

    if (event.toolName === "subagent") {
      const subagentType = getSubagentType(event.input);
      if (!subagentType || !PLANNING_SUBAGENTS.has(subagentType)) {
        return {
          block: true,
          reason: `Plan mode only allows planning subagents (scout or planner). Requested: ${subagentType ?? "unknown"}`,
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

      // Re-read plan file to check current stage
      const plan = readPlanFile(ctx.cwd);
      if (plan) {
        planningStage = plan.status;

        if (plan.status === "ready") {
          // Plan is written and ready for review — continue in scoping/drafting mode
          // but the agent knows the plan exists
          return {
            message: {
              customType: "plan-mode-context",
              content: `[PLAN MODE — PLAN DRAFTED]

A plan has been drafted in PLAN.md. You may:
- Refine the plan if the user requests changes
- Wait for the user to approve the plan before executing

Use plan_file action=read to review the current plan if needed.`,
              display: false,
            },
          };
        }
      }

      const tools = availablePlanModeTools(pi).join(", ");
      return {
        message: {
          customType: "plan-mode-context",
          content: scopingPrompt(tools, planFileStatus),
          display: false,
        },
      };
    }

    if (executionMode && steps.length > 0) {
      const plan = readPlanFile(ctx.cwd);
      const parsedPhases = plan?.phases ?? [];
      const remaining = steps.filter((s) => !s.completed);

      if (remaining.length === 0) {
        // All steps done
        const completedPhases = phases
          .filter((p) => p.completed)
          .map((p) => `Phase ${p.number}`)
          .join(", ");
        return {
          message: {
            customType: "plan-execution-context",
            content: `[EXECUTING APPROVED PLAN — NEARLY COMPLETE]

All internally tracked legacy steps are complete. Verify any remaining review criteria, mark the corresponding todos complete, and update PLAN.md to complete when finished.

Completed phases: ${completedPhases || "none yet"}`,
            display: false,
          },
        };
      }

      return {
        message: {
          customType: "plan-execution-context",
          content: executionPrompt(parsedPhases, { steps, phases }, planTitle),
          display: false,
        },
      };
    }
  });

  pi.on("turn_end", async (event, ctx) => {
    if (!executionMode || steps.length === 0) return;
    if (!isAssistantMessage(event.message as MessageLike)) return;

    const text = getTextContent(event.message as AssistantMessage);
    const stepsCompleted = markCompletedSteps(text, steps);
    const phasesCompleted = markCompletedPhases(text, phases);

    if (stepsCompleted > 0 || phasesCompleted > 0) {
      updateStatus(ctx);
      persistState();

      // Check if a phase was just completed
      if (phasesCompleted > 0) {
        // Find the most recently completed phase
        for (const phase of phases) {
          if (!phase.completed) continue;
          const plan = readPlanFile(ctx.cwd);
          const parsedPhase = plan?.phases.find(
            (p) => p.number === phase.number,
          );
          if (parsedPhase) {
            pi.sendMessage(
              {
                customType: "phase-review",
                content: `**Phase ${phase.number} Complete!** ✓\n\nPhase: ${parsedPhase.name}\nReview criteria: ${parsedPhase.review || "Verification complete"}\n\nAll steps in this phase have been completed and verified. Proceeding to the next phase.`,
                display: true,
              },
              { triggerTurn: false },
            );
          }
        }
      }

      // Check if ALL phases are done
      if (phases.length > 0 && phases.every((p) => p.completed)) {
        // Update PLAN.md status to complete
        const filePath = getPlanFilePath(ctx.cwd);
        if (existsSync(filePath)) {
          try {
            let content = readFileSync(filePath, "utf8");
            content = content.replace(
              /^>\s*Status:\s*\w+/m,
              "> Status: complete",
            );
            writeFileSync(filePath, content, "utf8");
          } catch {
            // Ignore write errors
          }
        }
      }
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    // ── Execution mode: check for completion ──
    if (executionMode && steps.length > 0) {
      if (steps.every((s) => s.completed)) {
        const plan = readPlanFile(ctx.cwd);
        const phaseList = plan?.phases
          .map((p) => {
            const progress = phases.find((pp) => pp.number === p.number);
            const marker = progress?.completed ? "✓" : "○";
            return `${marker} Phase ${p.number}: ${p.name}`;
          })
          .join("\n");

        pi.sendMessage(
          {
            customType: "plan-complete",
            content: `**Plan Complete!** ✓\n\n${planTitle}\n\n${phaseList ?? "All steps completed."}`,
            display: true,
          },
          { triggerTurn: false },
        );
        executionMode = false;
        planningStage = "complete";
        updateStatus(ctx);
        persistState();
      }
      return;
    }

    // ── Plan mode: show stage-appropriate UI ──
    if (!planModeEnabled || !ctx.hasUI) return;

    // Re-read plan file to determine stage
    const plan = readPlanFile(ctx.cwd);
    if (plan) {
      planningStage = plan.status;
      syncProgressFromPlan(ctx);
    }

    if (planningStage === "ready") {
      // Plan has been drafted — show approval options
      const phaseSummary = plan?.phases
        .map(
          (p) =>
            `Phase ${p.number}: ${p.name}${p.locations.length > 0 ? ` → ${p.locations.join(", ")}` : ""}`,
        )
        .join("\n");

      const choice = await ctx.ui.select("Plan ready — what next?", [
        "Approve and execute plan",
        "Refine the plan",
        "Exit plan mode without executing",
      ]);

      if (choice === "Approve and execute plan") {
        startExecution(ctx);
        pi.sendMessage(
          {
            customType: "plan-mode-execute",
            content: `The user approved the plan. Execute it now, starting with Phase 1${plan?.phases[0] ? `: ${plan.phases[0].name}` : ""}. Use the todo tool to track phases and steps instead of plan-mode progress markers.`,
            display: true,
          },
          { triggerTurn: true },
        );
      } else if (choice === "Refine the plan") {
        const refinement = await ctx.ui.editor("Refine the plan:", "");
        if (refinement?.trim()) pi.sendUserMessage(refinement.trim());
      } else {
        exitPlanMode(ctx);
      }
    } else {
      // Scoping stage — show scoping options
      const hasQuestions = plan !== null;

      const choice = await ctx.ui.select(
        "Plan mode — what next?",
        hasQuestions
          ? [
              "Draft the implementation plan now",
              "Continue asking questions",
              "Exit plan mode without executing",
            ]
          : [
              "Draft the implementation plan now",
              "Continue asking questions",
              "Exit plan mode without executing",
            ],
      );

      if (choice === "Draft the implementation plan now") {
        // Ask the agent to draft the plan
        pi.sendMessage(
          {
            customType: "plan-mode-execute",
            content:
              "The user wants you to draft the implementation plan now. Write the phased plan to PLAN.md using plan_file action=write. Set the status to 'ready'. Cover all aspects discussed, organized into phases with file locations and review criteria.",
            display: true,
          },
          { triggerTurn: true },
        );
      } else if (choice === "Continue asking questions") {
        // Just let the next turn proceed naturally
        updateStatus(ctx);
        persistState();
      } else {
        exitPlanMode(ctx);
      }
    }

    persistState();
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
            todos?: unknown;
            executing?: boolean;
            previousActiveTools?: string[];
            steps?: StepProgress[];
            phases?: PhaseProgress[];
            planTitle?: string;
            planningStage?: string;
          };
        }
      | undefined;

    if (planModeEntry?.data) {
      planModeEnabled = planModeEntry.data.enabled ?? planModeEnabled;
      executionMode = planModeEntry.data.executing ?? executionMode;
      previousActiveTools =
        planModeEntry.data.previousActiveTools ?? previousActiveTools;
      planTitle = planModeEntry.data.planTitle ?? planTitle;
      planningStage =
        (planModeEntry.data.planningStage as typeof planningStage) ??
        planningStage;
      steps = planModeEntry.data.steps ?? steps;
      phases = planModeEntry.data.phases ?? phases;

      // Legacy: migrate old integer-step todos
      const oldTodos = planModeEntry.data.todos as
        | { step: number; text: string; completed: boolean }[]
        | undefined;
      if (oldTodos && oldTodos.length > 0 && steps.length === 0) {
        steps = oldTodos.map((t, i) => ({
          id: `1.${i + 1}`,
          completed: t.completed,
        }));
        phases = [{ number: 1, completed: oldTodos.every((t) => t.completed) }];
      }
    }

    // Compatibility with older versions
    const legacyEntry = entries
      .filter(
        (entry) =>
          entry.type === "custom" && entry.customType === "plan-mode-toggle",
      )
      .pop() as { data?: { active?: boolean } } | undefined;
    if (!planModeEntry?.data && legacyEntry?.data)
      planModeEnabled = legacyEntry.data.active ?? planModeEnabled;

    // Re-sync from PLAN.md if it exists
    if (planModeEnabled || executionMode) {
      syncProgressFromPlan(ctx);

      // Also recover progress from conversation messages
      if (executionMode && steps.length > 0) {
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
        markCompletedSteps(
          messages.map(getTextContent).join("\n"),
          steps,
        );
        markCompletedPhases(
          messages.map(getTextContent).join("\n"),
          phases,
        );
      }
    }

    if (planModeEnabled) setPlanTools();
    updateStatus(ctx);
  });
}
