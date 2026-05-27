import { parse as parseYaml } from "yaml";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

export interface AgentDefinition {
  name: string;
  description?: string;
  model?: string;
  tools?: string[];
  thinking?: string;
  systemPromptMode: "replace" | "append";
  systemPromptBody: string;
  inheritProjectContext: boolean;
  inheritSkills: boolean;
  inheritExtensions: boolean;
  timeout?: number;
  output?: string;
  defaultProgress?: boolean;
  /** Unknown frontmatter fields preserved for passthrough. */
  extra?: Record<string, unknown>;
}

export function parseAgentDefinition(markdownContent: string): AgentDefinition {
  // Split frontmatter from body
  const parts = markdownContent.split(/^---$/m);
  if (parts.length < 2) {
    throw new Error("Invalid agent definition: no YAML frontmatter found");
  }

  const yamlContent = parts[1]?.trim() ?? "";
  const body = parts.slice(2).join("---").trim();

  let frontmatter: Record<string, unknown>;
  try {
    frontmatter = parseYaml(yamlContent) ?? {};
  } catch (e) {
    throw new Error(
      `Failed to parse YAML frontmatter: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  if (!frontmatter.name || typeof frontmatter.name !== "string" || !String(frontmatter.name).trim()) {
    throw new Error("Agent definition must include a non-empty 'name' field");
  }

  const KNOWN_KEYS = new Set([
    "name",
    "description",
    "model",
    "tools",
    "thinking",
    "systemPromptMode",
    "inheritProjectContext",
    "inheritSkills",
    "inheritExtensions",
    "timeout",
    "output",
    "defaultProgress",
  ]);

  const extra: Record<string, unknown> = {};
  for (const key of Object.keys(frontmatter)) {
    if (!KNOWN_KEYS.has(key)) {
      extra[key] = frontmatter[key];
    }
  }

  const toolsRaw = frontmatter.tools;
  let tools: string[] | undefined;
  if (typeof toolsRaw === "string") {
    tools = toolsRaw.split(",").map((t: string) => t.trim());
  } else if (Array.isArray(toolsRaw)) {
    tools = toolsRaw.map((t: unknown) => String(t).trim());
  }

  return {
    name: frontmatter.name ?? "",
    description: frontmatter.description,
    model: frontmatter.model,
    tools,
    thinking: frontmatter.thinking,
    systemPromptMode:
      String(frontmatter.systemPromptMode ?? "").toLowerCase() === "append"
        ? "append"
        : "replace",
    systemPromptBody: body,
    inheritProjectContext: frontmatter.inheritProjectContext ?? true,
    inheritSkills: frontmatter.inheritSkills ?? true,
    inheritExtensions: frontmatter.inheritExtensions ?? true,
    timeout: typeof frontmatter.timeout === "number" ? frontmatter.timeout : undefined,
    output: frontmatter.output,
    defaultProgress: frontmatter.defaultProgress,
    ...(Object.keys(extra).length > 0 ? { extra } : {}),
  };
}

export function parseAgentDefinitionFile(
  agentName: string,
  agentsDir: string
): AgentDefinition {
  const filePath = resolve(agentsDir, `${agentName}.md`);
  if (!existsSync(filePath)) {
    throw new Error(
      `Agent definition file not found for "${agentName}" at ${filePath}`
    );
  }
  const content = readFileSync(filePath, "utf-8");
  return parseAgentDefinition(content);
}
