function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function compactJson(value: unknown): string {
  try {
    return cleanDisplayText(JSON.stringify(value));
  } catch {
    return "{}";
  }
}

export function cleanDisplayText(value: string): string {
  return value
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/[\t\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): string {
  const name = toolName.toLowerCase();

  if (name === "bash") return cleanDisplayText(stringValue(args.command) || "(no command)");
  if (name === "read") return cleanDisplayText(stringValue(args.path) || stringValue(args.file) || "(no path)");
  if (name === "write") return cleanDisplayText(stringValue(args.path) || stringValue(args.file) || "(no path)");
  if (name === "edit") {
    const count = Array.isArray(args.edits) ? args.edits.length : undefined;
    const suffix = typeof count === "number" ? ` (${count} edit${count === 1 ? "" : "s"})` : "";
    return cleanDisplayText(`${stringValue(args.path) || "(no path)"}${suffix}`);
  }
  if (name === "grep") {
    const pattern = stringValue(args.pattern) || stringValue(args.query) || "(no pattern)";
    const path = stringValue(args.path) || stringValue(args.cwd);
    return cleanDisplayText(path ? `${pattern} in ${path}` : pattern);
  }
  if (name === "find" || name === "ls") return cleanDisplayText(stringValue(args.path) || stringValue(args.cwd) || ".");
  if (name === "web_search") return cleanDisplayText(stringValue(args.query) || "(no query)");
  if (name === "web_fetch") return cleanDisplayText(stringValue(args.url) || "(no url)");
  if (name === "subagent") {
    const agentType = stringValue(args.agent_type) || stringValue(args.agentType) || "agent";
    const prompt = stringValue(args.prompt) || stringValue(args.task);
    return cleanDisplayText(prompt ? `${agentType} — ${prompt}` : agentType);
  }
  if (name === "ask_user_question") {
    const questions = Array.isArray(args.questions) ? args.questions : [];
    const first = objectValue(questions[0]);
    return cleanDisplayText(
      stringValue(first?.question) || `${questions.length} question${questions.length === 1 ? "" : "s"}`,
    );
  }
  if (name === "todo") {
    const action = stringValue(args.action) || "todo";
    const subject = stringValue(args.subject);
    return cleanDisplayText(subject ? `${action} ${subject}` : action);
  }

  return compactJson(args);
}
