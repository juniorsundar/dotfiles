import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  DEFAULT_PROFILE,
  PROFILE_STATE_CUSTOM_TYPE,
  evaluatePermission,
  getCurrentProfile,
  isProfile,
  parseProfile,
  profileHelpText,
  profileStatusLabel,
  setCurrentProfile,
  type Profile,
} from "./lib/permission-policy";

function isSubagentChild(): boolean {
  return process.env.PI_SUBAGENT_CHILD === "1";
}

export default function permissionProfiles(pi: ExtensionAPI) {
  function updateStatus(ctx: { ui: any }): void {
    const profile = getCurrentProfile();
    ctx.ui.setStatus(
      "permissions",
      ctx.ui.theme.fg(
        profile === "yolo" ? "warning" : "muted",
        profileStatusLabel(profile),
      ),
    );
  }

  pi.registerCommand("permissions", {
    description: "Set permission profile: /permissions safe|ask|yolo|status",
    handler: async (args, ctx) => {
      const trimmed = args.trim().toLowerCase();
      if (!trimmed || trimmed === "status") {
        ctx.ui.notify(profileHelpText(getCurrentProfile()), "info");
        return;
      }

      const next = parseProfile(trimmed);
      if (!next) {
        ctx.ui.notify("Usage: /permissions safe|ask|yolo|status", "warning");
        return;
      }

      setCurrentProfile(next);
      pi.appendEntry(PROFILE_STATE_CUSTOM_TYPE, { profile: next });
      updateStatus(ctx);
      ctx.ui.notify(`Permission profile set to ${next}.`, "info");
    },
  });

  pi.on("tool_call", async (event, ctx) => {
    const decision = evaluatePermission(
      getCurrentProfile(),
      event.toolName,
      event.input,
    );

    if (decision.action === "block") {
      return { block: true, reason: decision.reason };
    }

    // In the bundled permission flow, confirm-mutating-tools owns interactive
    // confirmations. This extension only applies hard blocks and preserves the
    // old no-UI safety behavior for risky commands when no confirmation UI can
    // be shown.
    if (decision.action === "prompt" && !ctx.hasUI && !isSubagentChild()) {
      return {
        block: true,
        reason: "Risky shell command blocked: no UI available for confirmation",
      };
    }
  });

  pi.on("session_start", async (_event, ctx) => {
    const entry = ctx.sessionManager
      .getEntries()
      .filter(
        (candidate) =>
          candidate.type === "custom" &&
          candidate.customType === PROFILE_STATE_CUSTOM_TYPE,
      )
      .pop() as { data?: { profile?: Profile } } | undefined;

    setCurrentProfile(
      entry?.data && isProfile(entry.data.profile)
        ? entry.data.profile
        : DEFAULT_PROFILE,
    );
    updateStatus(ctx);
  });
}
