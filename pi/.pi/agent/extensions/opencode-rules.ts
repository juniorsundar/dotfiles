import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

type RuleFile = { path: string; label: string; content: string; origin: "project" | "global" };

const ROOT_RULE_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONVENTIONS.md",
];
const GLOBAL_RULE_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONVENTIONS.md",
];
const RULE_DIRS = [
  ".opencode",
  ".opencode/rules",
  ".claude/rules",
  ".cursor/rules",
];
const CONFIG_FILES = [
  "opencode.json",
  ".opencode.json",
  ".opencode/config.json",
];
const MAX_FILE_BYTES = 40_000;
const MAX_TOTAL_BYTES = 120_000;

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function findGitRoot(cwd: string): string {
  let current = cwd;
  while (true) {
    if (isDir(join(current, ".git"))) return current;
    const parent = dirname(current);
    if (parent === current) return cwd;
    current = parent;
  }
}

function walkMarkdown(dir: string, maxDepth = 3, depth = 0): string[] {
  if (depth > maxDepth || !isDir(dir)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".opencode") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory())
      files.push(...walkMarkdown(full, maxDepth, depth + 1));
    else if (entry.isFile() && /\.(md|mdc|txt)$/i.test(entry.name))
      files.push(full);
  }
  return files;
}

function readRule(root: string, path: string, origin: "project" | "global" = "project"): RuleFile | undefined {
  if (!isFile(path)) return undefined;
  const stat = statSync(path);
  const rel = relative(root, path) || path;
  const label = origin === "global" ? `~/.pi/${rel}` : rel;
  if (stat.size > MAX_FILE_BYTES) {
    return {
      path: rel,
      label,
      content: `[${label} omitted: ${stat.size} bytes exceeds ${MAX_FILE_BYTES} byte limit]`,
      origin,
    };
  }
  return { path: rel, label, content: readFileSync(path, "utf8"), origin };
}

function loadRules(cwd: string): RuleFile[] {
  const root = findGitRoot(cwd);
  const home = homedir();
  const candidates: { path: string; origin: "project" | "global"; root: string }[] = [];

  // Project-level rules (git root)
  for (const file of ROOT_RULE_FILES)
    candidates.push({ path: join(root, file), origin: "project", root });
  for (const file of CONFIG_FILES)
    candidates.push({ path: join(root, file), origin: "project", root });
  for (const dir of RULE_DIRS) {
    const absoluteDir = join(root, dir);
    if (isDir(absoluteDir))
      for (const file of walkMarkdown(absoluteDir))
        candidates.push({ path: file, origin: "project", root });
  }

  // Global rules (~/.pi/agent/)
  const globalDir = join(home, ".pi", "agent");
  if (isDir(globalDir) && globalDir !== root) {
    for (const file of GLOBAL_RULE_FILES)
      candidates.push({ path: join(globalDir, file), origin: "global", root: globalDir });
  }

  // Deduplicate by absolute path (project file that coincides with global file wins project scope)
  const seen = new Set<string>();
  const rules: RuleFile[] = [];
  let total = 0;
  for (const candidate of candidates) {
    if (seen.has(candidate.path)) continue;
    seen.add(candidate.path);
    const rule = readRule(candidate.root, candidate.path, candidate.origin);
    if (!rule) continue;
    const bytes = Buffer.byteLength(rule.content, "utf8");
    if (total + bytes > MAX_TOTAL_BYTES) {
      rules.push({
        path: rule.path,
        label: rule.label,
        content: `[${rule.label} omitted: total rules limit reached]`,
        origin: rule.origin,
      });
      continue;
    }
    total += bytes;
    rules.push(rule);
  }
  return rules;
}

function formatRules(rules: RuleFile[]): string {
  return rules
    .map((rule) => `### ${rule.label}\n\n${rule.content.trim()}`)
    .join("\n\n---\n\n");
}

export default function opencodeRulesExtension(pi: ExtensionAPI) {
  let rules: RuleFile[] = [];

  pi.on("session_start", async (_event, ctx) => {
    rules = loadRules(ctx.cwd);
    if (rules.length > 0 && ctx.hasUI) {
      const globalCount = rules.filter((r) => r.origin === "global").length;
      const projectCount = rules.length - globalCount;
      const parts: string[] = [];
      if (projectCount > 0) parts.push(`${projectCount} project`);
      if (globalCount > 0) parts.push(`${globalCount} global`);
      ctx.ui.notify(
        `Loaded ${rules.length} rule file${rules.length === 1 ? "" : "s"} (${parts.join(" + ")})`,
        "info",
      );
    }
  });

  pi.registerCommand("rules", {
    description: "Show loaded opencode/Claude-compatible rule files",
    handler: async (_args, ctx) => {
      rules = loadRules(ctx.cwd);
      if (rules.length === 0) {
        ctx.ui.notify(
          "No AGENTS.md, CLAUDE.md, .opencode, or .claude/rules files found (project or global).",
          "info",
        );
        return;
      }
      pi.sendMessage({
        customType: "opencode-rules",
        content: `Loaded rule files:\n${rules.map((rule) => `- ${rule.label}`).join("\n")}`,
        display: true,
      });
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (rules.length === 0) return;
    const projectRules = rules.filter((r) => r.origin !== "global");
    const globalRules = rules.filter((r) => r.origin === "global");
    let section = "";
    if (globalRules.length > 0) {
      section += `## Global Rules (~/.pi/)\n\nThe following global rule files were loaded from the user's ~/.pi/ directory. These apply across all projects.\n\n${formatRules(globalRules)}\n\n`;
    }
    if (projectRules.length > 0) {
      section += `## Project Rules\n\nThe following rule files were loaded from the repository. Follow them when relevant.\n\n${formatRules(projectRules)}\n`;
    }
    return {
      systemPrompt: `${event.systemPrompt}\n\n${section}`,
    };
  });
}
