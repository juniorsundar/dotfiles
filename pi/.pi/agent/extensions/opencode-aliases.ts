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

  pi.registerCommand("explain", {
    description: "Explain code or behavior read-only",
    handler: async (args) =>
      send(
        pi,
        `Explain this clearly. Use read-only inspection unless I explicitly ask for changes.\n\n${args}`,
      ),
  });

}
