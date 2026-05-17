import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

type Profile = "safe" | "ask" | "yolo";

const PROTECTED_PATHS = [
  /(^|\/)\.env(\.|$|\/)?/i,
  /(^|\/)\.ssh(\/|$)/i,
  /(^|\/)\.gnupg(\/|$)/i,
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.git(\/|$)/i,
  /(^|\/)secrets?(\/|$)/i,
];

const DANGEROUS_BASH = [
  /\brm\s+(-rf?|--recursive|--force)\b/i,
  /\bsudo\b/i,
  /\bchmod\s+.*777\b/i,
  /\bchown\b/i,
  /\bgit\s+(reset\s+--hard|clean\s+-fd|push\s+--force)/i,
  /\b(curl|wget)\b.*\|\s*(sh|bash|zsh)/i,
  /\bdd\s+.*\bof=/i,
];

function inputPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const path = (input as { path?: unknown }).path;
  return typeof path === "string" ? path : undefined;
}

function bashCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

function isProtectedPath(path: string | undefined): boolean {
  return !!path && PROTECTED_PATHS.some((pattern) => pattern.test(path));
}

function dangerousReasons(command: string): string[] {
  return DANGEROUS_BASH.filter((pattern) => pattern.test(command)).map(
    (pattern) => pattern.source,
  );
}

export default function permissionProfiles(pi: ExtensionAPI) {
  let profile: Profile = "ask";

  pi.registerCommand("permissions", {
    description: "Set permission profile: /permissions safe|ask|yolo|status",
    handler: async (args, ctx) => {
      const next = args.trim().toLowerCase() as Profile | "status" | "";
      if (!next || next === "status") {
        ctx.ui.notify(
          `Permission profile: ${profile}\n- safe: block risky writes/shell\n- ask: prompt for risky shell and protected paths\n- yolo: only hard-block protected paths and severe shell`,
          "info",
        );
        return;
      }
      if (!["safe", "ask", "yolo"].includes(next)) {
        ctx.ui.notify("Usage: /permissions safe|ask|yolo|status", "warning");
        return;
      }
      profile = next as Profile;
      pi.appendEntry("permission-profile", { profile });
      ctx.ui.setStatus(
        "permissions",
        ctx.ui.theme.fg(
          profile === "yolo" ? "warning" : "muted",
          `perm:${profile}`,
        ),
      );
      ctx.ui.notify(
        `Permission profile set to ${profile}. Existing confirmation extensions may still ask for approval.`,
        "info",
      );
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName === "edit" || event.toolName === "write") {
      const path = inputPath(event.input);
      if (isProtectedPath(path)) {
        return {
          block: true,
          reason: `Permission profile blocks writes to protected path: ${path}`,
        };
      }
      if (
        profile === "safe" &&
        path &&
        /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(path)
      ) {
        return {
          block: true,
          reason: `safe profile blocks lockfile edits without explicit profile change: ${path}`,
        };
      }
    }

    if (event.toolName !== "bash") return;
    const command = bashCommand(event.input);
    const reasons = dangerousReasons(command);
    if (reasons.length === 0) return;

    if (profile === "safe")
      return {
        block: true,
        reason: `safe profile blocks risky shell command: ${command}`,
      };

    if (profile === "ask") {
      if (!ctx.hasUI)
        return {
          block: true,
          reason:
            "Risky shell command blocked: no UI available for confirmation",
        };
      const ok = await ctx.ui.confirm(
        "Risky shell command",
        `Profile ask detected a risky command.\n\n${command}\n\nAllow?`,
      );
      if (!ok) return { block: true, reason: "Blocked by permission profile" };
    }

    if (
      profile === "yolo" &&
      /\bgit\s+(reset\s+--hard|clean\s+-fd|push\s+--force)|\brm\s+-rf\s+(\/|~|\$HOME)\b/i.test(
        command,
      )
    ) {
      return {
        block: true,
        reason: `Even yolo profile blocks catastrophic command: ${command}`,
      };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (candidate) =>
          candidate.type === "custom" &&
          candidate.customType === "permission-profile",
      )
      .pop() as { data?: { profile?: Profile } } | undefined;
    if (entry?.data?.profile) profile = entry.data.profile;
    ctx.ui.setStatus(
      "permissions",
      ctx.ui.theme.fg(
        profile === "yolo" ? "warning" : "muted",
        `perm:${profile}`,
      ),
    );
  });
}
