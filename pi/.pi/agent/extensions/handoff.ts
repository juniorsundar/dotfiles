import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type ContentBlock = {
  type?: string;
  text?: string;
  name?: string;
  arguments?: unknown;
};
type Entry = { type: string; message?: { role?: string; content?: unknown } };

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const block = item as ContentBlock;
    if (block.type === "text" && typeof block.text === "string")
      parts.push(block.text);
    if (block.type === "toolCall" && typeof block.name === "string")
      parts.push(`[tool: ${block.name}]`);
  }
  return parts.join("\n");
}

function compact(text: string, max = 1200): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= max ? cleaned : `${cleaned.slice(0, max)}…`;
}

function buildHandoff(entries: Entry[], full: boolean): string {
  const messages = entries
    .filter((entry) => entry.type === "message" && entry.message?.role)
    .map((entry) => ({
      role: entry.message!.role!,
      text: textFromContent(entry.message!.content),
    }))
    .filter((message) => message.text.trim());

  const firstUser =
    messages.find((message) => message.role === "user")?.text ?? "";
  const recent = messages.slice(full ? -30 : -12);
  const toolHints = recent.flatMap((message) =>
    [...message.text.matchAll(/\[tool: ([^\]]+)\]/g)].map((match) => match[1]),
  );

  return [
    "# Session Handoff",
    "",
    "## Original goal",
    compact(firstUser || "Unknown"),
    "",
    "## Recent conversation",
    ...recent.map(
      (message) =>
        `- **${message.role}:** ${compact(message.text, full ? 1800 : 700)}`,
    ),
    "",
    "## Tools used recently",
    toolHints.length
      ? [...new Set(toolHints)].map((tool) => `- ${tool}`).join("\n")
      : "- None detected",
    "",
    "## Resume prompt",
    "Continue from this handoff. First restate the current objective, then proceed with the next concrete step. If anything is ambiguous, ask one targeted question.",
  ].join("\n");
}

export default function handoffExtension(pi: ExtensionAPI) {
  pi.registerCommand("handoff", {
    description:
      "Create a concise continuation summary. Usage: /handoff [full]",
    handler: async (args, ctx) => {
      const full = args.trim().toLowerCase() === "full";
      const handoff = buildHandoff(
        ctx.sessionManager.getBranch() as Entry[],
        full,
      );
      pi.sendMessage(
        { customType: "handoff", content: handoff, display: true },
        { triggerTurn: false },
      );
      if (ctx.hasUI) {
        const action = await ctx.ui.select("Handoff created", [
          "Copy into editor",
          "Create new session with handoff",
          "Done",
        ]);
        if (action === "Copy into editor") ctx.ui.setEditorText(handoff);
        if (action === "Create new session with handoff") {
          await ctx.newSession({
            parentSession: ctx.sessionManager.getSessionFile(),
            setup: async (sm) => {
              sm.appendMessage({
                role: "user",
                content: [{ type: "text", text: handoff }],
                timestamp: Date.now(),
              });
            },
          });
        }
      }
    },
  });
}
