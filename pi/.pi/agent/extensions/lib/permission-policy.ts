export type Profile = "safe" | "ask" | "yolo";

export const DEFAULT_PROFILE: Profile = "ask";
export const PROFILE_STATE_CUSTOM_TYPE = "permission-policy";

const PROFILES = new Set<Profile>(["safe", "ask", "yolo"]);

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

const CATASTROPHIC_BASH =
  /\bgit\s+(reset\s+--hard|clean\s+-fd|push\s+--force)|\brm\s+-rf\s+(\/|~|\$HOME)(?=\s|$)/i;

export type PermissionDecision =
  | { action: "allow" }
  | { action: "prompt"; reason: string }
  | { action: "block"; reason: string };

export type ConfirmationDecision =
  | { action: "confirm" }
  | { action: "bypass" }
  | { action: "block"; reason: string };

const PROFILE_ENV_KEY = "PI_PERMISSION_PROFILE";

let currentProfile: Profile = DEFAULT_PROFILE;

// Extensions are loaded via isolated n/jiti instances (moduleCache: false),
// so module-level variables are NOT shared across extensions. We bridge state
// through process.env so both permission-profiles and confirm-mutating-tools
// always see the same profile.
export function getCurrentProfile(): Profile {
  const envProfile = process.env[PROFILE_ENV_KEY];
  if (isProfile(envProfile)) return envProfile;
  return currentProfile;
}

export function setCurrentProfile(profile: Profile): void {
  currentProfile = profile;
  process.env[PROFILE_ENV_KEY] = profile;
}

export function isProfile(value: unknown): value is Profile {
  return typeof value === "string" && PROFILES.has(value as Profile);
}

export function parseProfile(value: string): Profile | undefined {
  const normalized = value.trim().toLowerCase();
  return isProfile(normalized) ? normalized : undefined;
}

export function profileHelpText(profile: Profile): string {
  return [
    `Permission profile: ${profile}`,
    "- safe: block risky writes/shell before confirmation",
    "- ask: confirm normal mutations and ask before risky shell",
    "- yolo: bypass normal confirmations, but still block protected paths and catastrophic shell",
  ].join("\n");
}

export function profileStatusLabel(profile: Profile): string {
  return `perm:${profile}`;
}

export function inputPath(input: unknown): string | undefined {
  if (!input || typeof input !== "object") return undefined;
  const path = (input as { path?: unknown }).path;
  return typeof path === "string" ? path : undefined;
}

export function bashCommand(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const command = (input as { command?: unknown }).command;
  return typeof command === "string" ? command : "";
}

export function isProtectedPath(path: string | undefined): boolean {
  return !!path && PROTECTED_PATHS.some((pattern) => pattern.test(path));
}

export function isLockfilePath(path: string | undefined): boolean {
  return !!path && /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i.test(path);
}

export function dangerousBashReasons(command: string): string[] {
  return DANGEROUS_BASH.filter((pattern) => pattern.test(command)).map(
    (pattern) => pattern.source,
  );
}

export function isCatastrophicBash(command: string): boolean {
  return CATASTROPHIC_BASH.test(command);
}

export function evaluatePermission(
  profile: Profile,
  toolName: string,
  input: unknown,
): PermissionDecision {
  if (toolName === "edit" || toolName === "write") {
    const path = inputPath(input);
    if (isProtectedPath(path)) {
      return {
        action: "block",
        reason: `Permission profile blocks writes to protected path: ${path}`,
      };
    }
    if (profile === "safe" && isLockfilePath(path)) {
      return {
        action: "block",
        reason: `safe profile blocks lockfile edits without explicit profile change: ${path}`,
      };
    }
    return { action: "allow" };
  }

  if (toolName !== "bash") return { action: "allow" };

  const command = bashCommand(input);
  const reasons = dangerousBashReasons(command);
  if (reasons.length === 0) return { action: "allow" };

  if (profile === "safe") {
    return {
      action: "block",
      reason: `safe profile blocks risky shell command: ${command}`,
    };
  }

  if (profile === "ask") {
    return {
      action: "prompt",
      reason: `Profile ask detected a risky command.\n\n${command}`,
    };
  }

  if (isCatastrophicBash(command)) {
    return {
      action: "block",
      reason: `Even yolo profile blocks catastrophic command: ${command}`,
    };
  }

  return { action: "allow" };
}

export function evaluateConfirmation(
  profile: Profile,
  toolName: string,
  input: unknown,
): ConfirmationDecision {
  const permission = evaluatePermission(profile, toolName, input);
  if (permission.action === "block") {
    return { action: "block", reason: permission.reason };
  }
  if (profile === "yolo" && ["edit", "write", "bash"].includes(toolName)) {
    return { action: "bypass" };
  }
  return { action: "confirm" };
}
