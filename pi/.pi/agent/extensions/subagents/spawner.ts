import { parseAgentDefinitionFile } from "./agent-definition-parser";
import { buildCommand, type BuildCommandOverrides } from "./command-builder";
import { spawn } from "child_process";
import { mkdirSync, writeFileSync, appendFileSync, readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { formatActivityFeed, type ActivityFeedOutput } from "./activity-feed-formatter";
import { tailProgress, type ProgressEvent } from "./tail-progress";
import { processStream, type StreamResult } from "./stream-processor";
import * as registry from "./process-registry";
import type { Readable } from "stream";

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
  /** For testing: override the pi binary path. */
  piPath?: string;
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
  /** The agent type that was spawned (e.g. "scout", "worker"). */
  agentType: string;
  /** Wall-clock duration from spawn to completion, in milliseconds. */
  duration: number;
  /** Resolved model (overrides.model ?? definition.model). */
  model?: string;
  /** Final usage snapshot captured from progress events. */
  usage?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
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
    piPath: piPathOverride,
    generateId,
    onProgress,
    signal,
  } = options;

  // 1. Generate unique agent-id
  const agentId = generateId
    ? generateId()
    : `${agentType}-${randomUUID().slice(0, 8)}`;

  // 2. Create task directory
  const subagentsDir = join(workDir, ".pi", "subagents");
  const taskDir = join(subagentsDir, agentId);

  // 2a. Reap any orphan processes from previous runs (before creating new task dir)
  registry.reapOrphans(subagentsDir);

  // 2b. Now create the new task directory
  mkdirSync(taskDir, { recursive: true });

  // 2a. Track latest usage from progress events
  let latestUsage: SpawnSubagentResult["usage"] | undefined;

  // 2b. Notify progress observer with initial empty feed (tracer bullet)
  const wrappedOnProgress = onProgress
    ? (feed: ActivityFeedOutput) => {
        if (feed.usage) {
          latestUsage = { ...feed.usage };
        }
        try {
          onProgress(feed);
        } catch {
          console.warn("[pi-subagents] Progress callback threw during initial feed");
        }
      }
    : undefined;

  if (wrappedOnProgress) {
    try {
      wrappedOnProgress(formatActivityFeed([]));
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

  // 5a. Resolve model for metadata: overrides take precedence over definition
  const resolvedModel: string | undefined = overrides?.model ?? definition.model;

  // 6. Write manifest.json
  const manifest = {
    agentId,
    taskDir,
    command: ["pi", ...args],
    env,
  };
  writeFileSync(manifestPath, JSON.stringify(manifest), "utf-8");

  // 7. Determine pi path (default: find "pi" in PATH)
  const resolvedPiPath = piPathOverride ?? "pi";

  // 8. Spawn pi directly (no shell wrapper)
  const child = spawn(resolvedPiPath, args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ...env },
  });

  // 8a. Register the child in the process registry (for cancellation and orphan recovery)
  registry.register(agentId, child, taskDir, agentType);

  // 8b. Record start time for duration measurement (after spawn for wall-clock accuracy)
  const startTime = Date.now();

  // 8b. Start progress tailing if callback provided
  let progressTailer: { controller: AbortController; done: Promise<void> } | null = null;
  if (wrappedOnProgress) {
    progressTailer = startProgressTailing(taskDir, wrappedOnProgress);
  }

  // 8c. Initialize events.jsonl and run.log (persistence replaces stream-filter.sh)
  const eventsPath = join(taskDir, "events.jsonl");
  const logPath = join(taskDir, "run.log");
  writeFileSync(
    logPath,
    `spawner started, task_dir=${taskDir}\n`,
    "utf-8",
  );

  // 8d. Consume stream processor: pipe child stdout through typed NDJSON pipeline.
  // Raw lines are also persisted to events.jsonl, matching old stream-filter.sh behavior.
  const stream = processStream(withRawLines(child.stdout, eventsPath));
  let streamResult: StreamResult | null = null;
  let timedOut = false;

  const streamConsumer = (async () => {
    try {
      let result: IteratorResult<ProgressEvent, StreamResult>;
      while (!(result = await stream.next()).done) {
        const event = result.value;
        // Append every event to progress.jsonl
        appendFileSync(
          join(taskDir, "progress.jsonl"),
          JSON.stringify(event) + "\n",
          "utf-8",
        );
        // Track latest usage from progress events
        if (event.type === "usage" && event.input !== undefined) {
          latestUsage = {
            input: event.input,
            output: event.output,
            cacheRead: event.cacheRead,
            cacheWrite: event.cacheWrite,
          };
        }
      }
      streamResult = result.value;
    } catch (err) {
      console.warn("[pi-subagents] Stream processor error:", err);
    }
  })();

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

      const timer = setTimeout(() => {
        timedOut = true;
        // Stop progress tailing before killing child
        progressTailer?.controller.abort();
        child.kill("SIGTERM");
        // Write timeout error to output.md
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
        // Deregister from process registry
        registry.deregister(agentId, child);
        // Stop progress tailing
        progressTailer?.controller.abort();
        finish();
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        // Deregister from process registry
        registry.deregister(agentId, child);
        // Stop progress tailing on crash
        progressTailer?.controller.abort();
        fail(err);
      });

      // Cancellation signal: deregister, abort tailer, and kill child
      if (signal) {
        const cancel = () => {
          clearTimeout(timer);
          registry.deregister(agentId, child);
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
    // Wait for stream consumer to finish (pipe broke, no more events will arrive)
    await streamConsumer;
    // Wait for progress tailer to finish
    if (progressTailer) {
      await progressTailer.done;
    }
  }

  // 11. Write output.md from stream result if not already written (e.g. by timeout)
  if (!timedOut && streamResult) {
    if (streamResult.done) {
      writeFileSync(join(taskDir, "output.md"), streamResult.finalText, "utf-8");
      appendFileSync(logPath, "completed\n", "utf-8");
    } else {
      writeFileSync(
        join(taskDir, "output.md"),
        `[ERROR] ${streamResult.error}`,
        "utf-8",
      );
      appendFileSync(logPath, `error: ${streamResult.error}\n`, "utf-8");
    }
  }

  // 12. If no usage was captured via progress events, extract from progress.jsonl
  if (!latestUsage) {
    latestUsage = extractUsageFromProgressFile(taskDir);
  }

  // 13. Read output.md and return
  const outputPath = join(taskDir, "output.md");
  let output: string;
  try {
    output = readFileSync(outputPath, "utf-8");
  } catch {
    output = `[ERROR] Subagent completed but no output.md was produced.`;
    writeFileSync(outputPath, output, "utf-8");
  }

  return { output, agentId, agentType, duration: Date.now() - startTime, model: resolvedModel, usage: latestUsage };
}

/**
 * Pass-through async generator that writes raw NDJSON lines to events.jsonl.
 * Yields the same chunks as the input so the stream processor can process them.
 * Splits chunks on newlines to write individual JSON records, matching old
 * stream-filter.sh behavior where each valid line was appended to events.jsonl.
 */
async function* withRawLines(
  stream: Readable,
  eventsPath: string,
): AsyncIterable<string> {
  let pending = "";
  for await (const chunk of stream) {
    const text = typeof chunk === "string" ? chunk : (chunk as Buffer).toString("utf-8");
    // Flush complete lines to events.jsonl
    pending += text;
    while (pending.includes("\n")) {
      const nlIndex = pending.indexOf("\n");
      const line = pending.slice(0, nlIndex);
      if (line.length > 0) {
        appendFileSync(eventsPath, line + "\n", "utf-8");
      }
      pending = pending.slice(nlIndex + 1);
    }
    yield text;
  }
  // Flush trailing content
  if (pending.trim().length > 0) {
    appendFileSync(eventsPath, pending.trimEnd() + "\n", "utf-8");
  }
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

/**
 * Extract the last usage event from progress.jsonl if it exists.
 * Returns undefined if the file doesn't exist or contains no usage events.
 */
function extractUsageFromProgressFile(
  taskDir: string,
): SpawnSubagentResult["usage"] | undefined {
  const progressPath = join(taskDir, "progress.jsonl");
  try {
    if (!existsSync(progressPath)) return undefined;
    const raw = readFileSync(progressPath, "utf-8");
    const lines = raw.trim().split("\n");
    // Scan backwards for the last usage event
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const event: ProgressEvent = JSON.parse(lines[i]);
        if (event.type === "usage") {
          return {
            input: event.input,
            output: event.output,
            cacheRead: event.cacheRead,
            cacheWrite: event.cacheWrite,
          };
        }
      } catch {
        // Malformed line — skip
      }
    }
  } catch {
    // File unreadable — silently ignore
  }
  return undefined;
}
