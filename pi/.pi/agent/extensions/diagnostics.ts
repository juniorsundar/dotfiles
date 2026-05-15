import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

type Diagnostic = { kind: string; command: string; output: string; code: number; timestamp: number };

const MAX_OUTPUT = 12_000;

function truncate(text: string, max = MAX_OUTPUT): string {
	return text.length <= max ? text : `${text.slice(-max)}\n\n[diagnostics output truncated to last ${max} chars]`;
}

function shell(command: string): [string, string[]] {
	return ["bash", ["-lc", command]];
}

function packageScript(cwd: string, names: string[]): string | undefined {
	const path = join(cwd, "package.json");
	if (!existsSync(path)) return undefined;
	try {
		const pkg = JSON.parse(readFileSync(path, "utf8"));
		const scripts = pkg.scripts ?? {};
		const manager = existsSync(join(cwd, "pnpm-lock.yaml")) ? "pnpm" : existsSync(join(cwd, "yarn.lock")) ? "yarn" : "npm";
		for (const name of names) if (scripts[name]) return `${manager} run ${name}`;
	} catch {
		return undefined;
	}
	return undefined;
}

function detectCommand(cwd: string, kind: string): string | undefined {
	if (kind === "test") {
		return packageScript(cwd, ["test", "tests"]) ?? (existsSync(join(cwd, "Cargo.toml")) ? "cargo test" : undefined) ?? (existsSync(join(cwd, "go.mod")) ? "go test ./..." : undefined) ?? (existsSync(join(cwd, "pyproject.toml")) ? "pytest" : undefined);
	}
	if (kind === "lint") return packageScript(cwd, ["lint", "check:lint"]);
	if (kind === "typecheck") return packageScript(cwd, ["typecheck", "type-check", "check", "tsc"]);
	if (kind === "build") return packageScript(cwd, ["build"]);
	return undefined;
}

function formatDiagnostic(diagnostic: Diagnostic): string {
	return [`## ${diagnostic.kind}: ${diagnostic.command}`, `exit code: ${diagnostic.code}`, "", "```", diagnostic.output.trim(), "```"].join("\n");
}

export default function diagnosticsExtension(pi: ExtensionAPI) {
	let lastDiagnostic: Diagnostic | undefined;

	async function runDiagnostic(kind: string, command: string | undefined, ctx: any, sendToAgent: boolean): Promise<void> {
		const resolved = command?.trim() || detectCommand(ctx.cwd, kind);
		if (!resolved) {
			ctx.ui.notify(`No ${kind} command detected. Pass one explicitly, e.g. /${kind} npm test`, "warning");
			return;
		}

		ctx.ui.notify(`Running ${kind}: ${resolved}`, "info");
		const [cmd, args] = shell(resolved);
		const result = await pi.exec(cmd, args, { timeout: 120_000, signal: ctx.signal });
		const output = truncate([result.stdout, result.stderr].filter(Boolean).join("\n"));
		lastDiagnostic = { kind, command: resolved, output, code: result.code ?? 0, timestamp: Date.now() };
		pi.appendEntry("diagnostics", lastDiagnostic);

		pi.sendMessage({ customType: "diagnostic-result", content: formatDiagnostic(lastDiagnostic), display: true }, { triggerTurn: false });
		if (sendToAgent && lastDiagnostic.code !== 0) {
			pi.sendUserMessage(`Fix the following ${kind} failure. Keep changes focused and rerun the relevant check when done.\n\n${formatDiagnostic(lastDiagnostic)}`);
		}
	}

	for (const kind of ["test", "lint", "typecheck", "build"] as const) {
		pi.registerCommand(kind, {
			description: `Run detected or explicit ${kind} command. Usage: /${kind} [command]`,
			handler: async (args, ctx) => runDiagnostic(kind, args, ctx, false),
		});
	}

	pi.registerCommand("fix-failures", {
		description: "Send the last diagnostic failure back to the agent for fixing",
		handler: async (_args, ctx) => {
			if (!lastDiagnostic) {
				ctx.ui.notify("No diagnostic result recorded yet. Run /test, /lint, /typecheck, or /build first.", "warning");
				return;
			}
			pi.sendUserMessage(`Fix this failure. Keep changes focused and rerun checks when done.\n\n${formatDiagnostic(lastDiagnostic)}`);
		},
	});

	pi.registerCommand("check", {
		description: "Run typecheck, lint, and test when detected",
		handler: async (_args, ctx) => {
			for (const kind of ["typecheck", "lint", "test"] as const) {
				const command = detectCommand(ctx.cwd, kind);
				if (command) await runDiagnostic(kind, command, ctx, false);
			}
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const entry = ctx.sessionManager
			.getEntries()
			.filter((candidate) => candidate.type === "custom" && candidate.customType === "diagnostics")
			.pop() as { data?: Diagnostic } | undefined;
		lastDiagnostic = entry?.data;
	});
}
