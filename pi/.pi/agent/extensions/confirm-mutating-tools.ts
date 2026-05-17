import {
  highlightCode,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";

/**
 * Confirm Mutating Tools Extension
 *
 * Requires explicit user approval before the agent can run tools that may
 * change files or system state: edit, write, and bash.
 *
 * edit/write: opens Neovim diff approval when available; inside tmux it
 * opens the diff in a new window in the same session.
 * bash: uses Pi's built-in confirmation dialog with a structured summary.
 *
 * In non-interactive modes where no UI is available, these tools are blocked
 * by default.
 */
export default function (pi: ExtensionAPI) {
  const gatedTools = new Set(["edit", "write", "bash"]);

  pi.on("tool_call", async (event, ctx) => {
    if (!gatedTools.has(event.toolName)) return undefined;

    if (!ctx.hasUI) {
      return {
        block: true,
        reason: `${event.toolName} blocked: no UI available for confirmation`,
      };
    }

    return enqueueApproval(async () => {
      if (
        (event.toolName === "edit" || event.toolName === "write") &&
        isRecord(event.input)
      ) {
        const approved = await approveFileChangeWithNeovim(
          event.toolName,
          event.input,
          ctx,
        );
        if (!approved) return { block: true, reason: "Blocked by user" };
        return undefined;
      }

      const request = formatBashPermissionRequest(event.toolName, event.input);
      const ok = await ctx.ui.confirm(request.title, request.body);

      if (!ok) {
        ctx.ui.notify(`Denied ${event.toolName}`, "warning");
        return { block: true, reason: "Blocked by user" };
      }

      ctx.ui.notify(`Approved ${event.toolName}`, "info");
      return undefined;
    });
  });
}

type PermissionRequest = {
  title: string;
  body: string;
};

type UiContext = {
  cwd: string;
  ui: {
    confirm: (title: string, body: string) => Promise<boolean>;
    notify: (message: string, level?: "info" | "warning" | "error") => void;
    custom: <T>(
      factory: (tui: any, theme: any, kb: any, done: (value: T) => void) => any,
    ) => Promise<T>;
  };
};

type FileSnapshot = {
  content: string;
  exists: boolean;
  binary: boolean;
  unreadable: boolean;
  fingerprint: string;
  sizeBytes: number;
  mtimeMs: number | null;
};

type EditValidation =
  | { ok: true; afterContent: string }
  | { ok: false; afterContent: string; errors: string[] };

type ApprovalResult = "approve" | "deny" | "blocked";

type NeovimApprovalResult = {
  decision: "approve" | "deny";
  approvedContent?: string;
};

let approvalQueue: Promise<unknown> = Promise.resolve();

function enqueueApproval<T>(task: () => Promise<T>): Promise<T> {
  const run = approvalQueue.then(task, task);
  approvalQueue = run.catch(() => undefined);
  return run;
}

async function approveFileChangeWithNeovim(
  toolName: "edit" | "write",
  input: Record<string, unknown>,
  ctx: UiContext,
): Promise<boolean> {
  const targetPath = getPath(input);
  const absolutePath = resolve(ctx.cwd, targetPath);
  const before = readFileSnapshot(absolutePath);
  const writeContent =
    toolName === "write" ? getWriteContent(input) : undefined;
  const validation =
    toolName === "write"
      ? { ok: true as const, afterContent: writeContent ?? "" }
      : validateAndApplyEditPreview(before.content, input);
  const afterContent = validation.afterContent;
  let diffStats = computeLineDiffStats(before.content, afterContent);
  const metadata = buildFileChangeMetadata(
    toolName,
    targetPath,
    before,
    afterContent,
    input,
  );

  if (before.binary || isLikelyBinaryText(afterContent)) {
    const openAnyway = await ctx.ui.confirm(
      `Binary-like ${toolName}: ${targetPath}`,
      joinSections([
        "This file/change looks binary-like, so opening it as a text diff may be slow or garbled.",
        fieldBlock(metadata),
        "Open in Neovim anyway?",
      ]),
    );
    if (!openAnyway)
      return finishFileDecision(
        ctx,
        "deny",
        toolName,
        targetPath,
        diffStats,
        before,
        absolutePath,
      );
  }

  if (validation.ok === false) {
    const ok = await ctx.ui.confirm(
      `Unsafe edit preview: ${targetPath}`,
      joinSections([
        "The requested edit could not be previewed safely. Denial is recommended.",
        section("Validation", validation.errors.join("\n")),
        fieldBlock(metadata),
        "Approve anyway without opening Neovim?",
      ]),
    );
    return finishFileDecision(
      ctx,
      ok ? "approve" : "deny",
      toolName,
      targetPath,
      diffStats,
      before,
      absolutePath,
    );
  }

  const largeWarning = getLargeContentWarning(before.content, afterContent);
  if (largeWarning) {
    const ok = await ctx.ui.confirm(
      `Large diff: ${targetPath}`,
      joinSections([
        largeWarning,
        fieldBlock(metadata),
        "Open in Neovim anyway?",
      ]),
    );
    if (!ok)
      return finishFileDecision(
        ctx,
        "deny",
        toolName,
        targetPath,
        diffStats,
        before,
        absolutePath,
      );
  }

  if (!commandExists("nvim")) {
    const ok = await ctx.ui.confirm(
      `Allow ${toolName} ${targetPath}?`,
      joinSections([
        "Neovim was not found, so falling back to plain confirmation.",
        fieldBlock(metadata),
      ]),
    );
    return finishFileDecision(
      ctx,
      ok ? "approve" : "deny",
      toolName,
      targetPath,
      diffStats,
      before,
      absolutePath,
    );
  }

  const result = await runNeovimDiffApproval(ctx, {
    toolName,
    targetPath,
    beforeContent: before.content,
    afterContent,
    metadata,
  });

  if (
    result.decision === "approve" &&
    typeof result.approvedContent === "string"
  ) {
    if (toolName === "write") {
      input.content = result.approvedContent;
    } else if (
      result.approvedContent !== afterContent &&
      before.content.length > 0
    ) {
      // If the user edits the preview, make the approved content authoritative.
      // The real edit tool will still verify the full original content matches.
      input.edits = [
        { oldText: before.content, newText: result.approvedContent },
      ];
    }
    diffStats = computeLineDiffStats(before.content, result.approvedContent);
  }

  return finishFileDecision(
    ctx,
    result.decision,
    toolName,
    targetPath,
    diffStats,
    before,
    absolutePath,
  );
}

function finishFileDecision(
  ctx: UiContext,
  decision: ApprovalResult,
  toolName: "edit" | "write",
  targetPath: string,
  diffStats: { additions: number; deletions: number },
  before: FileSnapshot,
  absolutePath: string,
): boolean {
  if (decision !== "approve") {
    ctx.ui.notify(`Denied ${toolName}: ${targetPath}`, "warning");
    return false;
  }

  const current = readFileSnapshot(absolutePath);
  if (current.fingerprint !== before.fingerprint) {
    ctx.ui.notify(
      `Blocked ${toolName}: ${targetPath} changed after approval; ask the agent to retry.`,
      "error",
    );
    return false;
  }

  ctx.ui.notify(
    `Approved ${toolName}: ${targetPath} (+${diffStats.additions}/-${diffStats.deletions})`,
    "info",
  );
  return true;
}

async function runNeovimDiffApproval(
  ctx: UiContext,
  request: {
    toolName: "edit" | "write";
    targetPath: string;
    beforeContent: string;
    afterContent: string;
    metadata: Array<[string, string]>;
  },
): Promise<NeovimApprovalResult> {
  const tempDir = mkdtempSync(join(tmpdir(), "pi-nvim-approval-"));
  const fileName = safePreviewBasename(request.targetPath);
  const beforePath = join(tempDir, `before.${fileName}`);
  const afterPath = join(tempDir, `after.${fileName}`);
  const decisionPath = join(tempDir, "decision.txt");
  const approvalPath = join(tempDir, "approval.lua");

  writeFileSync(beforePath, request.beforeContent, "utf8");
  writeFileSync(afterPath, request.afterContent, "utf8");
  writeFileSync(decisionPath, "deny\n", "utf8");
  writeFileSync(
    approvalPath,
    buildApprovalLua(decisionPath, beforePath, afterPath, request),
    "utf8",
  );

  try {
    await ctx.ui.custom<number | null>((tui, _theme, _kb, done) => {
      tui.stop();
      process.stdout.write("\x1b[2J\x1b[H");

      const result = runNeovimApprovalProcess(
        tempDir,
        beforePath,
        afterPath,
        approvalPath,
        request.targetPath,
      );

      tui.start();
      tui.requestRender(true);
      done(result.status);

      return { render: () => [], invalidate: () => {} };
    });

    const decision =
      readFileSync(decisionPath, "utf8").trim() === "approve"
        ? "approve"
        : "deny";
    const approvedContent =
      decision === "approve" ? readFileSync(afterPath, "utf8") : undefined;
    return { decision, approvedContent };
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function buildApprovalLua(
  decisionPath: string,
  beforePath: string,
  afterPath: string,
  request: {
    toolName: "edit" | "write";
    targetPath: string;
    metadata: Array<[string, string]>;
  },
): string {
  const escapedDecisionPath = JSON.stringify(decisionPath);
  const escapedBeforePath = JSON.stringify(beforePath);
  const escapedAfterPath = JSON.stringify(afterPath);
  const editableAfter = true;
  const statusText = `Pi Approval | ${request.toolName} | ${request.targetPath}`;
  const escapedStatus = JSON.stringify(statusText);
  const escapedToolName = JSON.stringify(request.toolName);
  const escapedTargetPath = JSON.stringify(request.targetPath);
  const escapedEcho = JSON.stringify(
    `${statusText} | ${request.metadata.map(([k, v]) => `${k}: ${v}`).join(" | ")}`,
  );
  return `
vim.opt.number = true
vim.opt.relativenumber = false
vim.opt.cursorline = true
vim.opt.wrap = false
vim.opt.termguicolors = true
vim.opt.scrolloff = 1
vim.g.micro_statusline = false
-- Avoid narrow-terminal hit-enter prompts from long status/messages while the
-- diff UI is still settling.
pcall(function() vim.opt.shortmess:append('T') end)
vim.opt.more = false
pcall(function() vim.opt.diffopt:append('algorithm:histogram') end)
pcall(function() vim.opt.diffopt:append('indent-heuristic') end)

-- Loaded after the user's normal Neovim config so their theme is preserved.
local decision_file = ${escapedDecisionPath}
local before_file = ${escapedBeforePath}
local after_file = ${escapedAfterPath}
local editable_after = ${editableAfter ? "true" : "false"}
local status_text = ${escapedStatus}
local tool_name = ${escapedToolName}
local target_path = ${escapedTargetPath}
local echo_text = ${escapedEcho}
local display_text = status_text:gsub('%%', '%%%%')
vim.api.nvim_set_hl(0, 'PiApprovalBefore', { bg = '#ffd6d6', fg = '#202020', bold = true })
vim.api.nvim_set_hl(0, 'PiApprovalAfter', { bg = '#d6ffd6', fg = '#202020', bold = true })
local function set_window_label(win, access, highlight)
  local label_text = (' Pi Approval | %s [%s] | %s '):format(tool_name, access, target_path):gsub('%%', '%%%%')
  local text = ('%%#%s#%s%%*'):format(highlight, label_text)
  pcall(function() vim.api.nvim_win_set_option(win, 'statusline', text) end)
end
local function label_diff_windows()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local name = vim.api.nvim_buf_get_name(vim.api.nvim_win_get_buf(win))
    if name == before_file then
      set_window_label(win, 'RO', 'PiApprovalBefore')
    elseif name == after_file then
      set_window_label(win, editable_after and 'W' or 'RO', 'PiApprovalAfter')
    end
  end
end
local function focus_after_buffer()
  for _, win in ipairs(vim.api.nvim_list_wins()) do
    local bufnr = vim.api.nvim_win_get_buf(win)
    if vim.api.nvim_buf_get_name(bufnr) == after_file then
      vim.api.nvim_set_current_win(win)
      return win, bufnr
    end
  end
  return nil, nil
end
local function decide(value)
  if value == 'approve' and editable_after then
    pcall(function()
      for _, bufnr in ipairs(vim.api.nvim_list_bufs()) do
        if vim.api.nvim_buf_get_name(bufnr) == after_file then
          vim.api.nvim_buf_call(bufnr, function()
            vim.cmd('silent write')
          end)
          break
        end
      end
    end)
  end
  vim.fn.writefile({ value }, decision_file)
  vim.cmd('qa!')
end

vim.api.nvim_create_user_command('Approve', function() decide('approve') end, {})
vim.api.nvim_create_user_command('Deny', function() decide('deny') end, {})
vim.api.nvim_set_keymap('n', '<leader><leader>A', ':Approve<CR>', { noremap = true, silent = true })
vim.api.nvim_set_keymap('n', '<leader><leader>D', ':Deny<CR>', { noremap = true, silent = true })

local function apply_smart_layout()
  -- Prefer side-by-side diffs when there is enough width, but rotate to a
  -- horizontal/top-bottom diff in narrow terminals or tmux panes.
  local columns = vim.o.columns
  local lines = vim.o.lines
  local use_vertical = columns >= 120 or (columns >= 100 and lines < 32)
  if use_vertical then
    pcall(function() vim.cmd('wincmd H') end)
  else
    pcall(function() vim.cmd('wincmd K') end)
  end
  vim.cmd('wincmd =')
  return use_vertical and 'vertical' or 'horizontal'
end

vim.defer_fn(function()
  vim.opt.laststatus = 2
  vim.opt.statusline = display_text
  local layout = apply_smart_layout()
  label_diff_windows()
  vim.cmd('windo setlocal readonly nomodifiable nowrap')
  local after_win = focus_after_buffer()
  if editable_after and after_win then
    vim.api.nvim_win_call(after_win, function()
      vim.cmd('setlocal noreadonly modifiable')
    end)
  end
  vim.cmd('windo diffthis')
  vim.cmd('wincmd =')
  label_diff_windows()
  focus_after_buffer()
  pcall(function() vim.cmd('normal! ]c') end)
  vim.api.nvim_echo({{ 'Pi Approval: :Approve or :Deny | layout: ' .. layout, 'None' }}, false, {})
end, 100)
`;
}

function formatBashPermissionRequest(
  toolName: string,
  input: unknown,
): PermissionRequest {
  if (toolName !== "bash" || !isRecord(input)) {
    return {
      title: `Allow ${toolName}?`,
      body: section("Raw input", truncate(JSON.stringify(input, null, 2))),
    };
  }

  const command = String(input.command ?? "").trim();
  const risks = detectBashRisks(command);
  const timeout =
    typeof input.timeout === "number" ? `${input.timeout}s` : "default";

  return {
    title: `${risks.length ? "⚠️" : "🛠️"} Allow shell command?`,
    body: joinSections([
      fieldBlock([
        ["Tool", "bash"],
        [
          "Risk",
          risks.length ? risks.join(", ") : "Low / no obvious risky pattern",
        ],
        ["Timeout", timeout],
      ]),
      section("Command", highlightBashCommand(command)),
    ]),
  };
}

function validateAndApplyEditPreview(
  beforeContent: string,
  input: Record<string, unknown>,
): EditValidation {
  const edits = Array.isArray(input.edits) ? input.edits.filter(isRecord) : [];
  let preview = beforeContent;
  const errors: string[] = [];

  edits.forEach((edit, index) => {
    const oldText = typeof edit.oldText === "string" ? edit.oldText : "";
    const newText = typeof edit.newText === "string" ? edit.newText : "";
    if (!oldText) {
      errors.push(`Edit ${index + 1}: oldText is empty or missing.`);
      return;
    }

    const matches = countOccurrences(preview, oldText);
    if (matches !== 1) {
      errors.push(
        `Edit ${index + 1}: oldText matched ${matches} time(s), expected exactly 1.`,
      );
      return;
    }

    preview = preview.replace(oldText, newText);
  });

  return errors.length
    ? { ok: false, afterContent: preview, errors }
    : { ok: true, afterContent: preview };
}

function getWriteContent(input: Record<string, unknown>): string {
  return typeof input.content === "string" ? input.content : "";
}

function readFileSnapshot(path: string): FileSnapshot {
  if (!existsSync(path)) {
    return {
      content: "",
      exists: false,
      binary: false,
      unreadable: false,
      fingerprint: "missing",
      sizeBytes: 0,
      mtimeMs: null,
    };
  }

  try {
    const stat = statSync(path);
    const buffer = readFileSync(path);
    const binary = isLikelyBinaryBuffer(buffer);
    const content = binary
      ? "<binary file omitted>\n"
      : buffer.toString("utf8");
    return {
      content,
      exists: true,
      binary,
      unreadable: false,
      fingerprint: `${stat.size}:${stat.mtimeMs}:${hashBuffer(buffer)}`,
      sizeBytes: stat.size,
      mtimeMs: stat.mtimeMs,
    };
  } catch {
    return {
      content: "<unable to read existing file as utf8>\n",
      exists: true,
      binary: false,
      unreadable: true,
      fingerprint: "unreadable",
      sizeBytes: 0,
      mtimeMs: null,
    };
  }
}

function runNeovimApprovalProcess(
  tempDir: string,
  beforePath: string,
  afterPath: string,
  approvalPath: string,
  targetPath: string,
): { status: number | null } {
  const nvimArgs = [
    "-d",
    beforePath,
    afterPath,
    "-c",
    `luafile ${approvalPath}`,
  ];

  if (isInsideTmux() && commandExists("tmux")) {
    const tmuxResult = runNeovimApprovalInTmuxWindow(
      tempDir,
      nvimArgs,
      targetPath,
    );
    if (tmuxResult.started) return { status: tmuxResult.status };
  }

  return spawnSync("nvim", nvimArgs, {
    stdio: "inherit",
    env: process.env,
  });
}

function runNeovimApprovalInTmuxWindow(
  tempDir: string,
  nvimArgs: string[],
  targetPath: string,
): { started: boolean; status: number | null } {
  const sessionTarget = getCurrentTmuxSessionTarget();
  if (!sessionTarget) return { started: false, status: null };

  const waitName = `pi-nvim-approval-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const runnerPath = join(tempDir, "run-neovim-approval.sh");
  const donePath = join(tempDir, "tmux-done.txt");
  const nvimCommand = getCommandPath("nvim") ?? "nvim";
  const nvimCommandLine = [nvimCommand, ...nvimArgs].map(shellQuote).join(" ");

  writeFileSync(
    runnerPath,
    [
      "#!/bin/sh",
      "set +e",
      `done_file=${shellQuote(donePath)}`,
      "finish() {",
      "  printf 'done\\n' > \"$done_file\" 2>/dev/null || true",
      `  tmux wait-for -S ${shellQuote(waitName)} >/dev/null 2>&1 || true`,
      "}",
      "trap finish EXIT",
      nvimCommandLine,
      "status=$?",
      'exit "$status"',
      "",
    ].join("\n"),
    "utf8",
  );
  chmodSync(runnerPath, 0o700);

  const windowName = `pi diff ${safePreviewBasename(targetPath)}`.slice(0, 80);
  const start = spawnSync(
    "tmux",
    [
      "new-window",
      "-t",
      sessionTarget,
      "-n",
      windowName,
      shellQuote(runnerPath),
    ],
    {
      stdio: "inherit",
      env: process.env,
    },
  );
  if (start.status !== 0) return { started: false, status: start.status };

  let status: number | null = null;
  while (!existsSync(donePath)) {
    const wait = spawnSync("tmux", ["wait-for", waitName], {
      stdio: "ignore",
      env: process.env,
      timeout: 1000,
    });
    status = wait.status;
    if (existsSync(donePath)) break;
    if (
      wait.error &&
      (wait.error as NodeJS.ErrnoException).code !== "ETIMEDOUT"
    )
      break;
  }

  return { started: true, status };
}

function isInsideTmux(): boolean {
  return Boolean(process.env.TMUX);
}

function getCurrentTmuxSessionTarget(): string | undefined {
  const result = spawnSync("tmux", ["display-message", "-p", "#{session_id}"], {
    stdio: ["ignore", "pipe", "ignore"],
    env: process.env,
    encoding: "utf8",
  });
  if (result.status !== 0) return undefined;
  return result.stdout.trim() || undefined;
}

function commandExists(command: string): boolean {
  return getCommandPath(command) !== null;
}

function getCommandPath(command: string): string | null {
  const result = spawnSync("sh", ["-c", `command -v ${shellQuote(command)}`], {
    stdio: ["ignore", "pipe", "ignore"],
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim().split("\n")[0] || command;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function highlightBashCommand(command: string): string {
  const displayCommand = truncate(command || "<empty command>", 3000);
  try {
    return highlightCode(displayCommand, "bash").join("\n");
  } catch {
    return displayCommand;
  }
}

function detectBashRisks(command: string): string[] {
  const risks: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/\brm\s+(-rf?|--recursive|--force)/i, "destructive delete"],
    [/\bsudo\b/i, "privileged command"],
    [/\b(chmod|chown)\b/i, "permission/ownership change"],
    [/>\s*[^&\s]|>>\s*[^\s]/, "file redirection"],
    [/\b(mv|cp)\b.+\s\//i, "filesystem change"],
    [
      /\b(npm|pnpm|yarn|pip|cargo|go)\s+(install|add|get)\b/i,
      "package install",
    ],
    [/\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/i, "remote script execution"],
  ];

  for (const [pattern, label] of checks) {
    if (pattern.test(command) && !risks.includes(label)) risks.push(label);
  }

  return risks;
}

function getPath(input: Record<string, unknown>): string {
  return typeof input.path === "string" && input.path.trim()
    ? input.path
    : "unknown-file.txt";
}

function safePreviewBasename(targetPath: string): string {
  const name = basename(targetPath.trim()) || "file.txt";
  return name.replaceAll("\0", "_").replace(/[\\/]/g, "_") || "file.txt";
}

function buildFileChangeMetadata(
  toolName: "edit" | "write",
  targetPath: string,
  before: FileSnapshot,
  afterContent: string,
  input: Record<string, unknown>,
): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["Tool", toolName],
    ["File", targetPath],
    ["Before", summarizeTextSize(before.content)],
    ["After", summarizeTextSize(afterContent)],
  ];

  if (toolName === "write") {
    rows.push([
      "Workflow",
      before.exists ? "overwrite existing file" : "new file",
    ]);
  } else {
    const editBlocks = Array.isArray(input.edits) ? input.edits.length : 0;
    rows.push(["Edit blocks", String(editBlocks)]);
  }

  if (before.binary) rows.push(["Existing file", "binary-like"]);
  if (before.unreadable) rows.push(["Existing file", "unreadable"]);
  return rows;
}

function summarizeTextSize(text: string): string {
  const lines = countLines(text);
  const bytes = new TextEncoder().encode(text).length;
  return `${lines} line(s), ${formatBytes(bytes)}`;
}

function getLargeContentWarning(
  beforeContent: string,
  afterContent: string,
): string | null {
  const bytes = Math.max(byteLength(beforeContent), byteLength(afterContent));
  const lines = Math.max(countLines(beforeContent), countLines(afterContent));
  const warnings: string[] = [];
  if (bytes > 1_000_000) warnings.push(formatBytes(bytes));
  if (lines > 20_000) warnings.push(`${lines.toLocaleString()} lines`);
  return warnings.length ? `Large diff: ${warnings.join(" / ")}.` : null;
}

function computeLineDiffStats(
  beforeContent: string,
  afterContent: string,
): { additions: number; deletions: number } {
  const beforeLines = splitLines(beforeContent);
  const afterLines = splitLines(afterContent);
  let start = 0;
  while (
    start < beforeLines.length &&
    start < afterLines.length &&
    beforeLines[start] === afterLines[start]
  )
    start++;

  let beforeEnd = beforeLines.length - 1;
  let afterEnd = afterLines.length - 1;
  while (
    beforeEnd >= start &&
    afterEnd >= start &&
    beforeLines[beforeEnd] === afterLines[afterEnd]
  ) {
    beforeEnd--;
    afterEnd--;
  }

  return {
    additions: Math.max(0, afterEnd - start + 1),
    deletions: Math.max(0, beforeEnd - start + 1),
  };
}

function splitLines(text: string): string[] {
  if (!text) return [];
  return text.endsWith("\n") ? text.slice(0, -1).split("\n") : text.split("\n");
}

function countLines(text: string): number {
  return text.length ? splitLines(text).length : 0;
}

function countOccurrences(text: string, needle: string): number {
  let count = 0;
  let index = 0;
  while (true) {
    index = text.indexOf(needle, index);
    if (index === -1) return count;
    count++;
    index += needle.length;
  }
}

function isLikelyBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.includes(0)) return true;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return false;
  } catch {
    return true;
  }
}

function isLikelyBinaryText(text: string): boolean {
  return text.includes("\0");
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function hashBuffer(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} byte(s)`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`;
}

function fieldBlock(fields: Array<[string, string]>): string {
  const width = Math.max(...fields.map(([label]) => label.length));
  return fields
    .map(([label, value]) => `${label.padEnd(width)} : ${value}`)
    .join("\n");
}

function section(title: string, body: string): string {
  return `── ${title} ──\n${body}`;
}

function joinSections(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function truncate(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n\n… truncated …`;
}
