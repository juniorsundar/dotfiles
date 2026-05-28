import type { AgentDefinition } from "./agent-definition-parser";

export interface BuildCommandResult {
  args: string[];
  env: Record<string, string>;
}

export interface BuildCommandOverrides {
  model?: string;
  thinking?: string;
}

export function buildCommand(
  definition: AgentDefinition,
  task: string,
  _manifestPath: string,
  overrides?: BuildCommandOverrides,
): BuildCommandResult {
  const args: string[] = [
    "--mode", "json",
    "--no-session",
  ];

  const env: Record<string, string> = {
    PI_SUBAGENT_CHILD: "1",
  };

  // System prompt
  if (definition.systemPromptBody) {
    const flag = definition.systemPromptMode === "append"
      ? "--append-system-prompt"
      : "--system-prompt";
    args.push(flag, definition.systemPromptBody);
  }

  // Tools
  if (definition.tools && definition.tools.length > 0) {
    args.push("--tools", definition.tools.join(","));
  }

  // Model and thinking (override > definition > omitted)
  const effectiveModel = overrides?.model !== undefined ? overrides.model : definition.model;
  const effectiveThinking = overrides?.thinking !== undefined ? overrides.thinking : definition.thinking;
  if (effectiveModel) {
    args.push("--model", effectiveModel);
  }
  if (effectiveThinking) {
    args.push("--thinking", effectiveThinking);
  }

  // Inheritance flags
  if (!definition.inheritProjectContext) {
    args.push("--no-context-files");
  }
  if (!definition.inheritSkills) {
    args.push("--no-skills");
  }
  if (!definition.inheritExtensions) {
    args.push("--no-extensions");
  }

  // Task prompt (-p)
  args.push("-p", task);

  return { args, env };
}
