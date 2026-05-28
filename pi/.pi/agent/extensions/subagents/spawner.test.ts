import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync, readFileSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  spawnSubagent,
  UnknownAgentError,
} from "./spawner";

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
});
