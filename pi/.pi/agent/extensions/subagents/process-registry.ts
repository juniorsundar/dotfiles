import { writeFileSync, readdirSync, readFileSync, existsSync, appendFileSync, statSync } from "fs";
import { join } from "path";
import type { ChildProcess } from "child_process";

let registry = new Map<string, ChildProcess>();

/** Resets the in-memory registry. Exposed for testing only. */
export function _resetRegistry(): void {
  registry = new Map<string, ChildProcess>();
}

export function register(
  agentId: string,
  child: ChildProcess,
  taskDir: string,
  agentType: string,
): void {
  registry.set(agentId, child);

  const processJson = {
    pid: child.pid,
    agentType,
    startedAt: new Date().toISOString(),
  };

  writeFileSync(
    join(taskDir, "process.json"),
    JSON.stringify(processJson, null, 2) + "\n",
    "utf-8",
  );
}

export function deregister(agentId: string, child: ChildProcess): void {
  // Only remove if the registered child matches — prevents stale deregistration
  // from removing a newer child that was registered under the same agent ID.
  if (registry.get(agentId) === child) {
    registry.delete(agentId);
  }
}

export function reapOrphans(subagentsDir: string): void {
  if (!existsSync(subagentsDir)) return;
  if (!statSync(subagentsDir).isDirectory()) return;

  const entries = readdirSync(subagentsDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const taskDir = join(subagentsDir, entry.name);
    const processJsonPath = join(taskDir, "process.json");

    // Skip task directories that already have output.md — the subagent
    // completed normally. This also prevents SIGKILL-on-PID-reuse:
    // if the original PID has been recycled by the OS, we must not kill
    // an unrelated process that happens to share the same PID.
    if (existsSync(join(taskDir, "output.md"))) continue;

    if (!existsSync(processJsonPath)) continue;

    let processData: { pid: number };
    try {
      processData = JSON.parse(readFileSync(processJsonPath, "utf-8"));
    } catch {
      continue;
    }

    const { pid } = processData;
    if (typeof pid !== "number" || !Number.isInteger(pid) || pid <= 0) continue;

    if (!isPidAlive(pid)) continue;

    reapSingleOrphan(taskDir, pid);
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err: unknown) {
    // EPERM means the process exists but caller lacks permission to signal it
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

function reapSingleOrphan(taskDir: string, pid: number): void {
  // Kill the orphan (best-effort; PID may have exited since the liveness check)
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // Process already exited — skip
    return;
  }

  // Write termination error to output.md
  const timestamp = new Date().toISOString();
  writeFileSync(
    join(taskDir, "output.md"),
    `[ERROR] Orphan process (PID ${pid}) was reaped during crash recovery at ${timestamp}.`,
    "utf-8",
  );

  // Append terminal event to progress.jsonl
  const terminalEvent = JSON.stringify({
    type: "terminal",
    text: `Orphan process (PID ${pid}) reaped after crash recovery`,
    timestamp,
    status: "failed",
  });
  appendFileSync(join(taskDir, "progress.jsonl"), terminalEvent + "\n", "utf-8");
}

export function get(agentId: string): ChildProcess | undefined {
  return registry.get(agentId);
}
