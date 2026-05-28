import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync, chmodSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  spawnSubagent,
  UnknownAgentError,
} from "./spawner";
import type { ActivityFeedOutput } from "./activity-feed-formatter";

// ── Test helpers ──

let workDirs: string[] = [];
let agentDirs: string[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "spawner-test-"));
  // Create .pi directory so the spawner can nest under it
  mkdirSync(join(dir, ".pi"), { recursive: true });
  workDirs.push(dir);
  return dir;
}

function makeAgentsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "spawner-agents-"));
  agentDirs.push(dir);
  return dir;
}

function writeAgentDef(agentsDir: string, name: string, fields: Record<string, unknown> = {}): void {
  const yamlLines = [`name: ${name}`];
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) {
      yamlLines.push(`${key}:`);
      for (const item of value) {
        yamlLines.push(`  - ${item}`);
      }
    } else {
      yamlLines.push(`${key}: ${value}`);
    }
  }
  const content = `---\n${yamlLines.join("\n")}\n---\nYou are a ${name} agent.`;
  writeFileSync(join(agentsDir, `${name}.md`), content, "utf-8");
}

function writeFakeWrapper(dir: string, content: string): string {
  const path = join(dir, "fake-wrapper.sh");
  writeFileSync(path, content, "utf-8");
  chmodSync(path, 0o755);
  return path;
}

afterEach(() => {
  for (const dir of workDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  for (const dir of agentDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe("spawnSubagent", () => {
  // ── Slice 1: Tracer Bullet — Happy Path ──

  it("generates agent-id, creates task dir, writes task.md + manifest.json, spawns wrapper, reads output.md", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Write a real agent definition
    writeAgentDef(agentsDir, "scout", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "bash"],
      systemPromptMode: "replace",
    });

    // Write a fake wrapper that creates output.md with known content
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
echo "hello from subagent" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "Find all TypeScript files",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-a3f1b2c3",
    });

    // Returns correct agentId
    expect(result.agentId).toBe("scout-a3f1b2c3");

    // Returns output from output.md
    expect(result.output.trim()).toBe("hello from subagent");

    // Created task directory
    const taskDir = join(workDir, ".pi", "subagents", "scout-a3f1b2c3");
    expect(existsSync(taskDir)).toBe(true);

    // Wrote task.md with task content
    const taskMd = readFileSync(join(taskDir, "task.md"), "utf-8");
    expect(taskMd).toBe("Find all TypeScript files");

    // Wrote manifest.json with correct structure
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.agentId).toBe("scout-a3f1b2c3");
    expect(manifest.taskDir).toBe(taskDir);
    expect(manifest.command).toBeInstanceOf(Array);
    expect(manifest.command.length).toBeGreaterThan(0);
    expect(manifest.command[0]).toBe("pi");
    expect(manifest.command).toContain("-p");
    expect(manifest.command[manifest.command.indexOf("-p") + 1]).toBe("Find all TypeScript files");
    expect(manifest.command).toContain("--system-prompt");
    expect(manifest.command[manifest.command.indexOf("--system-prompt") + 1]).toBe("You are a scout agent.");
    expect(manifest.command).not.toContain(join(taskDir, "manifest.json"));
    expect(manifest.env).toBeTypeOf("object");
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");
  });

  // ── Slice 2: Agent Definition Errors ──

  it("throws UnknownAgentError with available agents list for unknown agent type", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Only define "scout" and "planner"
    writeAgentDef(agentsDir, "scout");
    writeAgentDef(agentsDir, "planner");

    await expect(
      spawnSubagent({
        agentType: "nonexistent",
        task: "do something",
        agentsDir,
        workDir,
      })
    ).rejects.toThrow(UnknownAgentError);

    try {
      await spawnSubagent({
        agentType: "nonexistent",
        task: "do something",
        agentsDir,
        workDir,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(UnknownAgentError);
      const err = e as UnknownAgentError;
      expect(err.agentType).toBe("nonexistent");
      expect(err.availableAgents).toContain("scout");
      expect(err.availableAgents).toContain("planner");
      expect(err.message).toContain("nonexistent");
      expect(err.message).toContain("scout");
      expect(err.message).toContain("planner");
      expect(err.message).toContain("Available types");
    }
  });

  // ── Slice 3: Timeout Handling ──

  it("times out when wrapper runs longer than agent timeout, kills wrapper, writes timeout error to output.md", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Scout with explicit 1s timeout (in seconds, → 1000ms)
    writeAgentDef(agentsDir, "scout", {
      timeout: 1,
    });

    // Fake wrapper that sleeps for 10s (way longer than 1s timeout)
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
trap 'exit 143' TERM
echo "started" > "$TASK_DIR/output.md"
sleep 10
echo "finished" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const startTime = Date.now();

    const result = await spawnSubagent({
      agentType: "scout",
      task: "something slow",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-timeout",
    });

    expect(result.agentId).toBe("scout-timeout");
    expect(result.output).toContain("[ERROR]");
    expect(result.output).toContain("scout");
    expect(result.output).toContain("1s");
    expect(result.output).toContain("timed out");

    // Should have timed out in roughly 1s
    const elapsed = Date.now() - startTime;
    expect(elapsed).toBeLessThan(5000);

    // output.md should contain the timeout error
    const taskDir = join(workDir, ".pi", "subagents", "scout-timeout");
    const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
    expect(outputMd).toContain("timed out");
  }, 10000);

  it("completes normally when wrapper finishes before timeout", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Agent with 10s timeout (in seconds → 10000ms)
    writeAgentDef(agentsDir, "scout", {
      timeout: 10,
    });

    // Fake wrapper that finishes quickly
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
echo "done fast" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "quick task",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-fast",
    });

    expect(result.output.trim()).toBe("done fast");
  });

  // ── Slice 4: Error Edge Cases ──

  it("returns clear error when wrapper exits but output.md is missing", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake wrapper exits 0 but does NOT create output.md
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "broken task",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-missing",
    });

    // Should return an error message in the output
    expect(result.output).toContain("[ERROR]");
    expect(result.output.toLowerCase()).toContain("no output");
  });

  it("returns wrapper error output when wrapper exits non-zero", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake wrapper exits 1 and writes error to output.md
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
echo "wrapper crash: out of memory" > "$TASK_DIR/output.md"
exit 1
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crashing task",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-crash",
    });

    // Should still read output.md contents
    expect(result.output.trim()).toBe("wrapper crash: out of memory");
  });

  // ── Slice 5 (012 Tracer Bullet): Optional progress callback ──

  it("accepts an optional onProgress callback without changing existing call sites that do not provide one", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
echo "done" > "$TASK_DIR/output.md"
exit 0
`,
    );

    // No callback — should work exactly as before
    const result = await spawnSubagent({
      agentType: "scout",
      task: "no callback",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-nocb",
    });

    expect(result.output.trim()).toBe("done");
    expect(result.agentId).toBe("scout-nocb");
  });

  it("calls onProgress with an empty feed when no progress.jsonl exists yet", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
echo "done" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "with callback",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-withcb",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Callback should have been called at least once (initial empty feed)
    expect(progressCalls.length).toBeGreaterThanOrEqual(1);

    // Initial feed should be empty (no progress events yet)
    const firstCall = progressCalls[0];
    expect(firstCall.collapsed.lines).toEqual([]);
    expect(firstCall.expanded.lines).toEqual([]);
    expect(firstCall.collapsed.hiddenCount).toBe(0);

    // Output should still be canonical
    expect(result.output.trim()).toBe("done");
  });

  // ── Slice 6 (012): Progress tailing delivers formatted snapshots ──

  it("delivers formatted progress snapshots via onProgress as the subagent writes progress events", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake wrapper writes progress events to progress.jsonl, then output.md
    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"

# Write all progress events (tailer polls every 100ms, events may arrive in batches)
echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
echo '{"type":"tool","text":"[read] looking at file","timestamp":"2026-01-01T00:00:01Z","status":"succeeded"}' >> "$PROGRESS_FILE"
echo '{"type":"assistant_text","text":"Found 3 files.","timestamp":"2026-01-01T00:00:02Z"}' >> "$PROGRESS_FILE"
echo '{"type":"terminal","text":"Subagent completed","timestamp":"2026-01-01T00:00:03Z","status":"completed"}' >> "$PROGRESS_FILE"

# Brief sleep to let the tailer poll and pick up the events before we exit
sleep 0.2

# Write output
echo "done with progress" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "find files",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Should have at least 2 calls: initial empty + at least one with events
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);

    // First call is empty feed
    expect(progressCalls[0].collapsed.lines).toEqual([]);

    // Later calls should contain progress events
    const nonEmptyCalls = progressCalls.filter(
      (c) => c.expanded.lines.length > 0,
    );
    expect(nonEmptyCalls.length).toBeGreaterThanOrEqual(1);

    // The final progress snapshot should have all 4 events (may arrive in batches)
    const lastNonEmpty = nonEmptyCalls[nonEmptyCalls.length - 1];
    expect(lastNonEmpty.expanded.lines.length).toBe(4);
    expect(lastNonEmpty.expanded.lines[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
    });
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text === "[read] looking at file")).toBe(true);
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text === "Found 3 files.")).toBe(true);
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text === "Subagent completed")).toBe(true);

    // Collapsed view should be formatted (events ≤ window of 6, all visible)
    expect(lastNonEmpty.collapsed.lines.length).toBe(4);
    expect(lastNonEmpty.collapsed.hiddenCount).toBe(0);

    // Output should still be canonical
    expect(result.output.trim()).toBe("done with progress");
  });

  // ── Slice 7 (012): Progress tailing stops on finish, timeout, crash ──

  it("stops progress tailing when subagent finishes and does not deliver events after completion", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"

echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
sleep 0.2
echo "done" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "finish",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-finish",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress was delivered at least once with events
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Output is still canonical
    expect(result.output.trim()).toBe("done");

    // Verify no more callbacks after this — the count is final
    const finalCount = progressCalls.length;

    // Append an event to progress.jsonl AFTER subagent finished
    // (should be ignored since tailer is stopped)
    const taskDir = join(workDir, ".pi", "subagents", "scout-finish");
    appendFileSync(
      join(taskDir, "progress.jsonl"),
      JSON.stringify({ type: "lifecycle", text: "post-finish event", timestamp: "2026-01-01T00:00:10Z", status: "completed" }) + "\n",
      "utf-8",
    );

    // Give time for any stray poll
    await new Promise((r) => setTimeout(r, 150));

    // No additional callbacks delivered after completion
    expect(progressCalls.length).toBe(finalCount);
  });

  it("stops progress tailing when subagent times out", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 1 });

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"

echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
sleep 0.2
echo '{"type":"tool","text":"[read] reading file","timestamp":"2026-01-01T00:00:01Z","status":"started"}' >> "$PROGRESS_FILE"
# Sleep longer than timeout to trigger it
sleep 5
echo "should not reach" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "slow",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-timeout-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress was delivered with events before timeout
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Output contains timeout error (canonical)
    expect(result.output).toContain("timed out");

    // No callbacks should arrive after this point
    const finalCount = progressCalls.length;

    // Append post-timeout event
    const taskDir = join(workDir, ".pi", "subagents", "scout-timeout-progress");
    appendFileSync(
      join(taskDir, "progress.jsonl"),
      JSON.stringify({ type: "lifecycle", text: "post-timeout event", timestamp: "2026-01-01T00:00:10Z", status: "completed" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 150));
    expect(progressCalls.length).toBe(finalCount);
  }, 10000);

  // ── Slice 8 (012): Callback failure safety ──

  it("ignores callback failures and does not change final subagent output", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"

echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
sleep 0.2
echo "success" > "$TASK_DIR/output.md"
exit 0
`,
    );

    let callCount = 0;

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crash callback",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-crashcb",
      onProgress: (_feed) => {
        callCount++;
        throw new Error("callback exploded");
      },
    });

    // Callback was called at least once (initial empty + progress)
    expect(callCount).toBeGreaterThanOrEqual(1);

    // But the subagent still completed and returned the canonical output
    expect(result.output.trim()).toBe("success");
    expect(result.agentId).toBe("scout-crashcb");
  });

  // ── Slice 9 (012): Cancellation via AbortSignal ──

  it("stops progress tailing and kills subagent when cancellation signal fires", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 10 });

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"
trap 'exit 143' TERM

echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
sleep 0.2
echo '{"type":"tool","text":"[read] started","timestamp":"2026-01-01T00:00:01Z","status":"started"}' >> "$PROGRESS_FILE"
# Sleep long — we expect cancellation to kill us before timeout
sleep 10
echo "should not reach" > "$TASK_DIR/output.md"
exit 0
`,
    );

    const controller = new AbortController();
    const progressCalls: ActivityFeedOutput[] = [];

    // Schedule cancellation after the first progress event arrives
    const abortTimer = setTimeout(() => {
      controller.abort();
    }, 300);

    const result = await spawnSubagent({
      agentType: "scout",
      task: "cancelled task",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-cancel",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
      signal: controller.signal,
    });

    clearTimeout(abortTimer);

    // Progress was delivered before cancellation
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Result is returned (not thrown) — cancellation is handled gracefully
    expect(result.agentId).toBe("scout-cancel");

    // No callbacks arrive after return
    const finalCount = progressCalls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(progressCalls.length).toBe(finalCount);
  }, 10000);

  // ── Slice 10 (012): Crash cleanup with progress callback ──

  it("delivers progress and returns error output when subagent crashes with callback active", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const wrapperPath = writeFakeWrapper(
      workDir,
      `#!/usr/bin/env bash
TASK_DIR="$1"
PROGRESS_FILE="$TASK_DIR/progress.jsonl"

echo '{"type":"lifecycle","text":"Subagent started","timestamp":"2026-01-01T00:00:00Z","status":"started"}' > "$PROGRESS_FILE"
sleep 0.2
echo '{"type":"tool","text":"[read] about to crash","timestamp":"2026-01-01T00:00:01Z","status":"failed"}' >> "$PROGRESS_FILE"
echo "wrapper crash: out of memory" > "$TASK_DIR/output.md"
exit 1
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crashing",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-crash-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress was delivered before crash
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Crash output is still canonical
    expect(result.output.trim()).toBe("wrapper crash: out of memory");
    expect(result.agentId).toBe("scout-crash-progress");
  });
});
