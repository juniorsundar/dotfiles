import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";

type Checkpoint = { ref: string; label: string; timestamp: number };
const MAX_CHECKPOINTS = 20;

async function inGitRepo(pi: ExtensionAPI): Promise<boolean> {
  const result = await pi.exec("git", ["rev-parse", "--is-inside-work-tree"], {
    timeout: 5_000,
  });
  return result.code === 0 && result.stdout.trim() === "true";
}

async function hasTrackedChanges(pi: ExtensionAPI): Promise<boolean> {
  const result = await pi.exec("git", ["status", "--porcelain"], {
    timeout: 5_000,
  });
  return result.code === 0 && result.stdout.trim().length > 0;
}

async function createCheckpoint(
  pi: ExtensionAPI,
  label: string,
): Promise<Checkpoint | undefined> {
  if (!(await inGitRepo(pi))) return undefined;
  if (!(await hasTrackedChanges(pi))) return undefined;

  // git stash create is read-only: it returns a commit object for the working tree
  // without modifying the working tree or stash list.
  const result = await pi.exec("git", ["stash", "create", label], {
    timeout: 15_000,
  });
  const ref = result.stdout.trim();
  if (result.code !== 0 || !ref) return undefined;
  return { ref, label, timestamp: Date.now() };
}

function formatCheckpoint(checkpoint: Checkpoint, index: number): string {
  return `${index + 1}. ${new Date(checkpoint.timestamp).toLocaleString()} — ${checkpoint.label} — ${checkpoint.ref.slice(0, 12)}`;
}

export default function gitCheckpointExtension(pi: ExtensionAPI) {
  let enabled = true;
  let checkpoints: Checkpoint[] = [];
  let mutationSeenThisTurn = false;

  function remember(checkpoint: Checkpoint): void {
    checkpoints.unshift(checkpoint);
    checkpoints = checkpoints.slice(0, MAX_CHECKPOINTS);
    pi.appendEntry("git-checkpoint", { enabled, checkpoints });
  }

  async function checkpointNow(
    ctx: ExtensionContext,
    label: string,
  ): Promise<void> {
    const checkpoint = await createCheckpoint(pi, label);
    if (!checkpoint) {
      if (ctx.hasUI)
        ctx.ui.notify("No tracked git changes to checkpoint.", "info");
      return;
    }
    remember(checkpoint);
    if (ctx.hasUI)
      ctx.ui.notify(
        `Checkpoint created: ${checkpoint.ref.slice(0, 12)}`,
        "info",
      );
  }

  pi.registerCommand("checkpoint", {
    description:
      "Create/list/restore lightweight git checkpoints: /checkpoint [list|restore|on|off]",
    handler: async (args, ctx) => {
      const action = args.trim().toLowerCase();
      if (action === "on") {
        enabled = true;
        pi.appendEntry("git-checkpoint", { enabled, checkpoints });
        ctx.ui.notify("Git checkpoints enabled.", "info");
        return;
      }
      if (action === "off") {
        enabled = false;
        pi.appendEntry("git-checkpoint", { enabled, checkpoints });
        ctx.ui.notify("Git checkpoints disabled.", "info");
        return;
      }
      if (action === "list") {
        ctx.ui.notify(
          checkpoints.length
            ? checkpoints.map(formatCheckpoint).join("\n")
            : "No checkpoints recorded.",
          "info",
        );
        return;
      }
      if (action.startsWith("restore") || action === "undo") {
        if (checkpoints.length === 0) {
          ctx.ui.notify("No checkpoints to restore.", "warning");
          return;
        }
        const choice = await ctx.ui.select(
          "Restore checkpoint? This applies a git stash commit to your working tree.",
          checkpoints.map(formatCheckpoint),
        );
        if (!choice) return;
        const index = Number(choice.split(".")[0]) - 1;
        const checkpoint = checkpoints[index];
        if (!checkpoint) return;
        const ok = await ctx.ui.confirm(
          "Apply checkpoint?",
          `Run: git stash apply ${checkpoint.ref}\n\nCurrent changes may conflict.`,
        );
        if (!ok) return;
        const result = await pi.exec(
          "git",
          ["stash", "apply", checkpoint.ref],
          { timeout: 30_000 },
        );
        ctx.ui.notify(
          result.code === 0
            ? "Checkpoint applied."
            : `Checkpoint apply failed: ${result.stderr || result.stdout}`,
          result.code === 0 ? "info" : "error",
        );
        return;
      }
      await checkpointNow(ctx, args.trim() || "manual checkpoint");
    },
  });

  pi.registerCommand("undo", {
    description: "Restore a recorded git checkpoint",
    handler: async (_args, _ctx) => {
      await pi.sendUserMessage("/checkpoint restore");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!enabled || mutationSeenThisTurn) return;
    if (!["edit", "write", "bash"].includes(event.toolName)) return;

    if (event.toolName === "bash") {
      const command =
        typeof (event.input as { command?: unknown }).command === "string"
          ? (event.input as { command: string }).command
          : "";
      if (
        !/[>]|\b(rm|mv|cp|mkdir|touch|chmod|chown|git\s+(add|commit|reset|checkout|merge|rebase|stash)|npm\s+(install|ci)|pnpm\s+(install|add)|yarn\s+(install|add))\b/i.test(
          command,
        )
      )
        return;
    }

    mutationSeenThisTurn = true;
    await checkpointNow(ctx, `before ${event.toolName}`);
  });

  pi.on("agent_end", async () => {
    mutationSeenThisTurn = false;
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (candidate) =>
          candidate.type === "custom" &&
          candidate.customType === "git-checkpoint",
      )
      .pop() as
      | { data?: { enabled?: boolean; checkpoints?: Checkpoint[] } }
      | undefined;
    if (entry?.data) {
      enabled = entry.data.enabled ?? enabled;
      checkpoints = entry.data.checkpoints ?? checkpoints;
    }
    ctx.ui.setStatus(
      "git-checkpoint",
      enabled ? ctx.ui.theme.fg("muted", "ckpt:on") : undefined,
    );
  });
}
