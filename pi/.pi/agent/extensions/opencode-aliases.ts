import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function send(pi: ExtensionAPI, prompt: string): void {
  pi.sendUserMessage(prompt);
}

export default function opencodeAliases(pi: ExtensionAPI) {
  pi.registerCommand("ask", {
    description: "Ask a question without implying code changes",
    handler: async (args) =>
      send(
        pi,
        `Answer this question. Do not modify files unless explicitly asked.\n\n${args}`,
      ),
  });

  pi.registerCommand("build", {
    description: "Implement a requested change with checks",
    handler: async (args) =>
      send(
        pi,
        `Implement this change. Keep scope tight, use todos for multi-step work, and run relevant checks.\n\n${args}`,
      ),
  });

  pi.registerCommand("fix", {
    description: "Debug and fix a bug or failure",
    handler: async (args) =>
      send(
        pi,
        `Debug and fix this. Reproduce/inspect first, make focused changes, then verify.\n\n${args}`,
      ),
  });

  pi.registerCommand("explain", {
    description: "Explain code or behavior read-only",
    handler: async (args) =>
      send(
        pi,
        `Explain this clearly. Use read-only inspection unless I explicitly ask for changes.\n\n${args}`,
      ),
  });

  pi.registerCommand("review", {
    description: "Review code or current diff read-only",
    handler: async (args) =>
      send(
        pi,
        `Review this code/change read-only. Focus on bugs, regressions, security, tests, and maintainability.\n\n${args || "Review the current git diff."}`,
      ),
  });

  pi.registerCommand("commit", {
    description:
      "Prepare commit message / PR notes using the commit-pr-assistant skill",
    handler: async (args) =>
      send(
        pi,
        `/skill:commit-pr-assistant ${args || "Prepare a commit message and PR summary for the current changes."}`,
      ),
  });

  pi.registerCommand("map", {
    description: "Map the repository using the project-intelligence skill",
    handler: async (args) =>
      send(
        pi,
        `/skill:project-intelligence ${args || "Map this repository and identify commands, architecture, conventions, and risks."}`,
      ),
  });
}
