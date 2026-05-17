import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

type RuleFile = { path: string; label: string; content: string };

const ROOT_RULE_FILES = [
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

function readRule(root: string, path: string): RuleFile | undefined {
  if (!isFile(path)) return undefined;
  const stat = statSync(path);
  const rel = relative(root, path) || path;
  if (stat.size > MAX_FILE_BYTES) {
    return {
      path: rel,
      label: rel,
      content: `[${rel} omitted: ${stat.size} bytes exceeds ${MAX_FILE_BYTES} byte limit]`,
    };
  }
  return { path: rel, label: rel, content: readFileSync(path, "utf8") };
}

function loadRules(cwd: string): RuleFile[] {
  const root = findGitRoot(cwd);
  const candidates = new Set<string>();

  for (const file of ROOT_RULE_FILES) candidates.add(join(root, file));
  for (const file of CONFIG_FILES) candidates.add(join(root, file));
  for (const dir of RULE_DIRS) {
    const absoluteDir = join(root, dir);
    if (isDir(absoluteDir))
      for (const file of walkMarkdown(absoluteDir)) candidates.add(file);
  }

  const rules: RuleFile[] = [];
  let total = 0;
  for (const candidate of [...candidates].sort()) {
    const rule = readRule(root, candidate);
    if (!rule) continue;
    const bytes = Buffer.byteLength(rule.content, "utf8");
    if (total + bytes > MAX_TOTAL_BYTES) {
      rules.push({
        path: rule.path,
        label: rule.label,
        content: `[${rule.path} omitted: total rules limit reached]`,
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
    if (rules.length > 0 && ctx.hasUI)
      ctx.ui.notify(
        `Loaded ${rules.length} opencode/Claude rule file(s)`,
        "info",
      );
  });

  pi.registerCommand("rules", {
    description: "Show loaded opencode/Claude-compatible rule files",
    handler: async (_args, ctx) => {
      rules = loadRules(ctx.cwd);
      if (rules.length === 0) {
        ctx.ui.notify(
          "No AGENTS.md, CLAUDE.md, .opencode, or .claude/rules files found.",
          "info",
        );
        return;
      }
      pi.sendMessage({
        customType: "opencode-rules",
        content: `Loaded rule files:\n${rules.map((rule) => `- ${rule.path}`).join("\n")}`,
        display: true,
      });
    },
  });

  pi.on("before_agent_start", async (event) => {
    if (rules.length === 0) return;
    return {
      systemPrompt: `${event.systemPrompt}\n\n## Opencode / Claude-Compatible Project Rules\n\nThe following rule files were loaded from the repository. Follow them when relevant.\n\n${formatRules(rules)}\n`,
    };
  });
}
