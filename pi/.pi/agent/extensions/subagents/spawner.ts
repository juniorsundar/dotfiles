import { parseAgentDefinitionFile } from "./agent-definition-parser";
import { buildCommand, type BuildCommandOverrides } from "./command-builder";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from "fs";
import { join, resolve } from "path";
import { randomUUID } from "crypto";
import { formatActivityFeed, type ActivityFeedOutput } from "./activity-feed-formatter";
import { tailProgress, type ProgressEvent } from "./tail-progress";

export const TIMEOUT_DEFAULTS: Record<string, number> = {
  scout: 120_000,
  planner: 300_000,
  worker: 600_000,
};
export const DEFAULT_TIMEOUT = 300_000;

export type ProgressCallback = (feed: ActivityFeedOutput) => void;

export interface SpawnSubagentOptions {
  agentType: string;
  task: string;
  agentsDir: string;
  workDir?: string;
  overrides?: BuildCommandOverrides;
  /** For testing: override the wrapper script path. */
  wrapperPath?: string;
  /** For testing: inject a deterministic id generator. */
  generateId?: () => string;
  /** Optional callback for progress updates during subagent execution. */
  onProgress?: ProgressCallback;
  /** Optional signal to cancel the subagent (kills child + stops progress tailing). */
  signal?: AbortSignal;
}

export interface SpawnSubagentResult {
  output: string;
  agentId: string;
}

export class UnknownAgentError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly availableAgents: string[],
  ) {
    const list = availableAgents.length > 0
      ? availableAgents.join(", ")
      : "(none found)";
    super(
      `Unknown agent type "${agentType}". Available types: ${list}`,
    );
    this.name = "UnknownAgentError";
  }
}

export class SubagentTimeoutError extends Error {
  constructor(
    public readonly agentType: string,
    public readonly timeoutMs: number,
  ) {
    super(
      `Subagent "${agentType}" timed out after ${timeoutMs / 1000}s`,
    );
    this.name = "SubagentTimeoutError";
  }
}

/** List available agent types from a directory of .md agent definitions. */
export function listAvailableAgents(agentsDir: string): string[] {
  try {
    return readdirSync(agentsDir)
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""));
  } catch {
    return [];
  }
}

export async function spawnSubagent(
  options: SpawnSubagentOptions,
): Promise<SpawnSubagentResult> {
  const {
    agentType,
    task,
    agentsDir,
    workDir = process.cwd(),
    overrides,
    wrapperPath: wrapperPathOverride,
    generateId,
    onProgress,
    signal,
  } = options;

  // 1. Generate unique agent-id
  const agentId = generateId
    ? generateId()
    : `${agentType}-${randomUUID().slice(0, 8)}`;

  // 2. Create task directory
  const taskDir = join(workDir, ".pi", "subagents", agentId);
  mkdirSync(taskDir, { recursive: true });

  // 2a. Notify progress observer with initial empty feed (tracer bullet)
  if (onProgress) {
    try {
      onProgress(formatActivityFeed([]));
    } catch {
      console.warn("[pi-subagents] Progress callback threw during initial feed");
    }
  }

  // 3. Write task.md
  writeFileSync(join(taskDir, "task.md"), task, "utf-8");

  // 4. Load agent definition (catch parse error → throw UnknownAgentError)
  let definition;
  try {
    definition = parseAgentDefinitionFile(agentType, agentsDir);
  } catch {
    throw new UnknownAgentError(agentType, listAvailableAgents(agentsDir));
  }

  // 5. Build command args and env
  const manifestPath = join(taskDir, "manifest.json");
  const { args, env } = buildCommand(definition, task, manifestPath, overrides);

  // 6. Write manifest.json
  const manifest = {
    agentId,
    taskDir,
    command: ["pi", ...args],
    env,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf-8");

  // 7. Determine wrapper path
  const resolvedWrapperPath =
    wrapperPathOverride ??
    process.env.SUBAGENT_WRAPPER_PATH ??
    resolve(__dirname, "subagent-wrapper.sh");

  // 8. Spawn wrapper
  const child = spawn("bash", [resolvedWrapperPath, taskDir, manifestPath], {
    stdio: ["ignore", "pipe", "pipe"],
  });

  // 8a. Start progress tailing if callback provided
  let progressTailer: { controller: AbortController; done: Promise<void> } | null = null;
  if (onProgress) {
    progressTailer = startProgressTailing(taskDir, onProgress);
  }

  // 9. Compute timeout: explicit agent timeout (seconds→ms) > type default > global default
  const timeoutMs =
    definition.timeout !== undefined
      ? definition.timeout * 1000
      : (TIMEOUT_DEFAULTS[agentType] ?? DEFAULT_TIMEOUT);

  // 10. Race: child exit vs timeout vs cancellation. Timeout is returned as
  // tool output, not thrown, so the LLM receives a clear error message in-context.
  try {
    await new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };

      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        // Stop progress tailing before killing child
        progressTailer?.controller.abort();
        child.kill("SIGTERM");
        // Write timeout error to output.md so wrapper path is consistent
        writeFileSync(
          join(taskDir, "output.md"),
          `[ERROR] Subagent "${agentType}" timed out after ${timeoutMs / 1000}s.`,
          "utf-8",
        );
        finish();
      }, timeoutMs);

      child.on("close", () => {
        if (!timedOut) {
          clearTimeout(timer);
        }
        // Stop progress tailing
        progressTailer?.controller.abort();
        finish();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        // Stop progress tailing on crash
        progressTailer?.controller.abort();
        fail(err);
      });

      // Cancellation signal: abort tailer and kill child
      if (signal) {
        const cancel = () => {
          clearTimeout(timer);
          progressTailer?.controller.abort();
          child.kill("SIGTERM");
          finish();
        };
        if (signal.aborted) {
          cancel();
        } else {
          signal.addEventListener("abort", cancel, { once: true });
        }
      }
    });
  } finally {
    // Wait for progress tailer to finish regardless of exit path
    if (progressTailer) {
      await progressTailer.done;
    }
  }

  // 11. Read output.md and return (handle missing file gracefully)
  const outputPath = join(taskDir, "output.md");
  let output: string;
  try {
    output = readFileSync(outputPath, "utf-8");
  } catch {
    output = `[ERROR] Subagent completed but no output.md was produced.`;
    writeFileSync(outputPath, output, "utf-8");
  }

  return { output, agentId };
}

/**
 * Start tailing progress.jsonl and deliver formatted snapshots through the callback.
 * Returns a controller to abort the tailing and a promise that resolves when tailing stops.
 */
function startProgressTailing(
  taskDir: string,
  onProgress: ProgressCallback,
): { controller: AbortController; done: Promise<void> } {
  const controller = new AbortController();
  const progressPath = join(taskDir, "progress.jsonl");
  const events: ProgressEvent[] = [];

  const done = (async () => {
    try {
      for await (const event of tailProgress(progressPath, { signal: controller.signal })) {
        events.push(event);
        try {
          onProgress(formatActivityFeed(events));
        } catch {
          console.warn("[pi-subagents] Progress callback threw during event delivery");
        }
      }
    } catch {
      // Tailing stopped (aborted or error) — silently ignore
    }
  })();

  return { controller, done };
}
