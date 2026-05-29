import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { register, deregister, get, reapOrphans, _resetRegistry } from "./process-registry";
import type { ChildProcess } from "child_process";

let workDirs: string[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "process-registry-test-"));
  workDirs.push(dir);
  return dir;
}

beforeEach(() => {
  _resetRegistry();
});

afterEach(() => {
  for (const dir of workDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe("process-registry", () => {
  // ── Slice 1: Tracer Bullet — register() + get() ──

  it("register() adds child to the map and writes process.json with { pid, agentType, startedAt }", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "scout-a3f1b2c3");
    mkdirSync(taskDir, { recursive: true });

    const mockChild = { pid: 98765 } as ChildProcess;

    register("scout-a3f1b2c3", mockChild, taskDir, "scout");

    // process.json was written with correct shape
    const jsonPath = join(taskDir, "process.json");
    expect(existsSync(jsonPath)).toBe(true);

    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(data.pid).toBe(98765);
    expect(data.agentType).toBe("scout");
    expect(data.startedAt).toBeTypeOf("string");
    // startedAt is valid ISO 8601
    expect(new Date(data.startedAt).toISOString()).toBe(data.startedAt);
  });

  it("get() returns the ChildProcess for a registered agent ID", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "worker-b2c3d4e5");
    mkdirSync(taskDir, { recursive: true });

    const mockChild = { pid: 12345 } as ChildProcess;

    register("worker-b2c3d4e5", mockChild, taskDir, "worker");

    const result = get("worker-b2c3d4e5");
    expect(result).toBe(mockChild);
  });

  it("get() returns undefined for an unknown agent ID", () => {
    expect(get("nonexistent-a1b2c3d4")).toBeUndefined();
  });

  // ── Slice 2: deregister() ──

  it("deregister() removes child from the map and leaves process.json on disk", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "planner-c3d4e5f6");
    mkdirSync(taskDir, { recursive: true });

    const mockChild = { pid: 22222 } as ChildProcess;

    register("planner-c3d4e5f6", mockChild, taskDir, "planner");

    // Confirm registered before deregister
    expect(get("planner-c3d4e5f6")).toBe(mockChild);

    deregister("planner-c3d4e5f6", mockChild);

    // Child removed from map
    expect(get("planner-c3d4e5f6")).toBeUndefined();

    // process.json still on disk
    const jsonPath = join(taskDir, "process.json");
    expect(existsSync(jsonPath)).toBe(true);
  });

  it("deregister() is a no-op for an unknown agent ID", () => {
    // Should not throw
    expect(() => deregister("nonexistent-zzzzzzzz", {} as ChildProcess)).not.toThrow();
  });

  // ── Slice 3: reapOrphans() happy path ──

  it("reapOrphans() scans task dirs, kills live orphan PIDs with SIGKILL, writes [ERROR] to output.md, appends terminal event to progress.jsonl", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    // Create a task dir for a live orphan (PID 11111)
    const liveTaskDir = join(subagentsDir, "scout-live1111");
    mkdirSync(liveTaskDir, { recursive: true });
    writeFileSync(
      join(liveTaskDir, "process.json"),
      JSON.stringify({ pid: 11111, agentType: "scout", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    // Create a task dir for a dead orphan (PID 22222)
    const deadTaskDir = join(subagentsDir, "worker-dead2222");
    mkdirSync(deadTaskDir, { recursive: true });
    writeFileSync(
      join(deadTaskDir, "process.json"),
      JSON.stringify({ pid: 22222, agentType: "worker", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    // Mock process.kill: PID 11111 is alive, PID 22222 is dead
    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (pid === 11111 && signal === 0) {
        return true; // alive
      }
      if (pid === 22222 && signal === 0) {
        throw Object.assign(new Error("ESRCH: No such process"), { code: "ESRCH" });
      }
      // SIGKILL calls: just return true
      return true;
    });

    reapOrphans(subagentsDir);

    // Live orphan: SIGKILL sent
    expect(killSpy).toHaveBeenCalledWith(11111, "SIGKILL");

    // Live orphan: [ERROR] written to output.md
    const liveOutput = readFileSync(join(liveTaskDir, "output.md"), "utf-8");
    expect(liveOutput).toContain("[ERROR]");
    expect(liveOutput.toLowerCase()).toContain("orphan");

    // Live orphan: terminal event appended to progress.jsonl
    const liveProgressRaw = readFileSync(join(liveTaskDir, "progress.jsonl"), "utf-8");
    const liveProgressLine = JSON.parse(liveProgressRaw.trim());
    expect(liveProgressLine.type).toBe("terminal");
    expect(liveProgressLine.status).toBe("failed");

    // Dead orphan: NOT killed
    expect(killSpy).not.toHaveBeenCalledWith(22222, "SIGKILL");

    // Dead orphan: output.md NOT written
    expect(existsSync(join(deadTaskDir, "output.md"))).toBe(false);

    killSpy.mockRestore();
  });

  it("reapOrphans() is a no-op when subagentsDir has no task directories", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    // Should not throw
    expect(() => reapOrphans(subagentsDir)).not.toThrow();
  });

  // ── Slice 4: reapOrphans() edge cases ──

  it("reapOrphans() skips task directories with no process.json", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    const noJsonDir = join(subagentsDir, "scout-nojson11");
    mkdirSync(noJsonDir, { recursive: true });
    // No process.json written

    const killSpy = vi.spyOn(process, "kill");

    // Should not throw
    expect(() => reapOrphans(subagentsDir)).not.toThrow();
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  it("reapOrphans() skips task directories with malformed JSON in process.json", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    const badJsonDir = join(subagentsDir, "worker-badjson1");
    mkdirSync(badJsonDir, { recursive: true });
    writeFileSync(join(badJsonDir, "process.json"), "not valid json {{{{{", "utf-8");

    const killSpy = vi.spyOn(process, "kill");

    // Should not throw
    expect(() => reapOrphans(subagentsDir)).not.toThrow();
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  it("reapOrphans() treats EPERM on liveness check as alive and attempts reap", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    const epermDir = join(subagentsDir, "scout-eperm111");
    mkdirSync(epermDir, { recursive: true });
    writeFileSync(
      join(epermDir, "process.json"),
      JSON.stringify({ pid: 33333, agentType: "scout", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      if (pid === 33333 && signal === 0) {
        // EPERM: process exists but caller lacks permission
        throw Object.assign(new Error("EPERM: Operation not permitted"), { code: "EPERM" });
      }
      return true;
    });

    reapOrphans(subagentsDir);

    // EPERM → treated as alive → SIGKILL attempted
    expect(killSpy).toHaveBeenCalledWith(33333, "SIGKILL");
    expect(killSpy).toHaveBeenCalledWith(33333, 0);

    killSpy.mockRestore();
  });

  it("reapOrphans() continues to next task dir when SIGKILL fails", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    // Two live orphans
    const firstDir = join(subagentsDir, "scout-first111");
    mkdirSync(firstDir, { recursive: true });
    writeFileSync(
      join(firstDir, "process.json"),
      JSON.stringify({ pid: 44444, agentType: "scout", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    const secondDir = join(subagentsDir, "worker-secon11");
    mkdirSync(secondDir, { recursive: true });
    writeFileSync(
      join(secondDir, "process.json"),
      JSON.stringify({ pid: 55555, agentType: "worker", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    const killSpy = vi.spyOn(process, "kill").mockImplementation((pid: number, signal?: string | number) => {
      // PID 44444: alive but SIGKILL fails (process died between checks)
      if (pid === 44444 && signal === "SIGKILL") {
        throw Object.assign(new Error("ESRCH: No such process"), { code: "ESRCH" });
      }
      // PID 55555: alive, kill succeeds
      return true;
    });

    reapOrphans(subagentsDir);

    // Both PIDs checked for liveness
    expect(killSpy).toHaveBeenCalledWith(44444, 0);
    expect(killSpy).toHaveBeenCalledWith(55555, 0);

    // First PID: SIGKILL attempted (and failed gracefully)
    expect(killSpy).toHaveBeenCalledWith(44444, "SIGKILL");

    // First orphan: output.md NOT written (SIGKILL failed → early return)
    expect(existsSync(join(firstDir, "output.md"))).toBe(false);

    // Second PID: SIGKILL succeeded (loop continued past first failure)
    expect(killSpy).toHaveBeenCalledWith(55555, "SIGKILL");

    // Second orphan's output.md was written (proves loop continued)
    const secondOutput = readFileSync(join(secondDir, "output.md"), "utf-8");
    expect(secondOutput).toContain("[ERROR]");

    killSpy.mockRestore();
  });

  it("reapOrphans() skips process.json where pid is not a number", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    const badPidDir = join(subagentsDir, "scout-badpid11");
    mkdirSync(badPidDir, { recursive: true });
    writeFileSync(
      join(badPidDir, "process.json"),
      JSON.stringify({ pid: "not-a-number", agentType: "scout", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    const killSpy = vi.spyOn(process, "kill");

    expect(() => reapOrphans(subagentsDir)).not.toThrow();
    expect(killSpy).not.toHaveBeenCalled();

    killSpy.mockRestore();
  });

  // ── Slice 5: Concurrency safety ──

  it("rapid register/deregister for the same agent ID does not leak or corrupt the map", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "scout-rapid123");
    mkdirSync(taskDir, { recursive: true });

    // Rapidly register and deregister the same agent ID multiple times
    for (let i = 0; i < 100; i++) {
      const child = { pid: 10000 + i } as ChildProcess;
      register("scout-rapid123", child, taskDir, "scout");
      deregister("scout-rapid123", child);
    }

    // After the loop, agent should not be in the map
    expect(get("scout-rapid123")).toBeUndefined();

    // Register one final time and verify it works
    const finalChild = { pid: 99999 } as ChildProcess;
    register("scout-rapid123", finalChild, taskDir, "scout");
    expect(get("scout-rapid123")).toBe(finalChild);
  });

  it("register/deregister interleaved across different agent IDs does not collide", () => {
    const workDir = makeWorkDir();
    const taskDirA = join(workDir, "scout-agentaaa");
    const taskDirB = join(workDir, "worker-agentbbb");
    mkdirSync(taskDirA, { recursive: true });
    mkdirSync(taskDirB, { recursive: true });

    const childA = { pid: 111 } as ChildProcess;
    const childB = { pid: 222 } as ChildProcess;

    register("scout-agentaaa", childA, taskDirA, "scout");
    register("worker-agentbbb", childB, taskDirB, "worker");

    // Deregister A, B should remain
    deregister("scout-agentaaa", childA);

    expect(get("scout-agentaaa")).toBeUndefined();
    expect(get("worker-agentbbb")).toBe(childB);
  });

  it("stale deregister does not remove a newer child registered under the same agent ID", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "scout-stale123");
    mkdirSync(taskDir, { recursive: true });

    const child1 = { pid: 100 } as ChildProcess;
    const child2 = { pid: 200 } as ChildProcess;

    register("scout-stale123", child1, taskDir, "scout");
    register("scout-stale123", child2, taskDir, "scout"); // overwrites child1

    // Stale deregister from child1 should be a no-op
    deregister("scout-stale123", child1);

    // child2 should still be registered
    expect(get("scout-stale123")).toBe(child2);
  });

  it("reapOrphans() skips task directories that already have output.md (prevents PID reuse kills)", () => {
    const workDir = makeWorkDir();
    const subagentsDir = join(workDir, ".pi", "subagents");
    mkdirSync(subagentsDir, { recursive: true });

    // A completed task dir: has both process.json AND output.md
    const completedDir = join(subagentsDir, "scout-complete");
    mkdirSync(completedDir, { recursive: true });
    writeFileSync(
      join(completedDir, "process.json"),
      JSON.stringify({ pid: 66666, agentType: "scout", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );
    writeFileSync(join(completedDir, "output.md"), "Subagent completed successfully.", "utf-8");

    // An orphan task dir: has process.json but NO output.md
    const orphanDir = join(subagentsDir, "worker-orphaned");
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(
      join(orphanDir, "process.json"),
      JSON.stringify({ pid: 77777, agentType: "worker", startedAt: "2026-01-01T00:00:00.000Z" }),
      "utf-8",
    );

    const killSpy = vi.spyOn(process, "kill").mockReturnValue(true);

    reapOrphans(subagentsDir);

    // Completed dir: not touched (PID reuse protection)
    expect(killSpy).not.toHaveBeenCalledWith(66666, expect.anything());

    // Orphan dir: reaped normally
    expect(killSpy).toHaveBeenCalledWith(77777, 0);
    expect(killSpy).toHaveBeenCalledWith(77777, "SIGKILL");

    killSpy.mockRestore();
  });

  it("register() writes correct agentType for hyphenated agent types (e.g., local-worker)", () => {
    const workDir = makeWorkDir();
    const taskDir = join(workDir, "local-worker-abcd1234");
    mkdirSync(taskDir, { recursive: true });

    const mockChild = { pid: 88888 } as ChildProcess;

    register("local-worker-abcd1234", mockChild, taskDir, "local-worker");

    const jsonPath = join(taskDir, "process.json");
    const data = JSON.parse(readFileSync(jsonPath, "utf-8"));
    expect(data.agentType).toBe("local-worker");
  });
});
