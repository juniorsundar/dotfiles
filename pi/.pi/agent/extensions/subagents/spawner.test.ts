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

function writeFakePi(dir: string, content: string): string {
  const path = join(dir, "fake-pi.sh");
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
  // ── Slice 1: Tracer Bullet — Direct pi spawn ──

  it("spawns pi directly and returns output from NDJSON stream", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "bash"],
      systemPromptMode: "replace",
    });

    // Fake pi that emits NDJSON with text ending with sentence boundary
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Hello from subagent."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Hello from subagent."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Hello from subagent."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "Find all TypeScript files",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-a3f1b2c3",
    });

    // Returns correct agentId
    expect(result.agentId).toBe("scout-a3f1b2c3");

    // Returns output from stream processor's final text
    expect(result.output.trim()).toBe("Hello from subagent.");

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
    expect(manifest.env).toBeTypeOf("object");
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");

    // output.md should exist with final text
    expect(existsSync(join(taskDir, "output.md"))).toBe(true);
    expect(readFileSync(join(taskDir, "output.md"), "utf-8").trim()).toBe("Hello from subagent.");

    // progress.jsonl should exist with stream processor events
    expect(existsSync(join(taskDir, "progress.jsonl"))).toBe(true);
    const progressLines = readFileSync(join(taskDir, "progress.jsonl"), "utf-8").trim().split("\n").filter(Boolean);
    expect(progressLines.length).toBeGreaterThanOrEqual(3);
    const firstEvent = JSON.parse(progressLines[0]);
    expect(firstEvent.type).toBe("lifecycle");
    expect(firstEvent.status).toBe("started");
  });

  it("writes events.jsonl with raw NDJSON lines and run.log with lifecycle", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { model: "test-model" });

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Task done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Task done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Task done."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "do something",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-persist",
    });

    const taskDir = join(workDir, ".pi", "subagents", "scout-persist");

    // events.jsonl should contain the raw NDJSON lines
    expect(existsSync(join(taskDir, "events.jsonl"))).toBe(true);
    const eventsRaw = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
    const eventsLines = eventsRaw.trim().split("\n").filter(Boolean);
    expect(eventsLines.length).toBe(4);
    expect(eventsLines[0]).toContain('"type":"agent_start"');
    expect(eventsLines[3]).toContain('"type":"agent_end"');

    // run.log should contain spawner start and completion
    expect(existsSync(join(taskDir, "run.log"))).toBe(true);
    const logText = readFileSync(join(taskDir, "run.log"), "utf-8");
    expect(logText).toContain("spawner started");
    expect(logText).toContain("completed");

    // Output should still be canonical
    expect(result.output.trim()).toBe("Task done.");
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

  it("times out when subagent runs longer than agent timeout, kills child, writes timeout error to output.md", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Scout with explicit 1s timeout (in seconds, → 1000ms)
    writeAgentDef(agentsDir, "scout", {
      timeout: 1,
    });

    // Fake pi that outputs a start event then blocks longer than timeout.
    // Uses `tail -f /dev/null` which blocks indefinitely but dies on SIGTERM.
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
NDJSON
# Block — exec replaces shell so SIGTERM goes directly to tail
exec tail -f /dev/null
`,
    );

    const startTime = Date.now();

    const result = await spawnSubagent({
      agentType: "scout",
      task: "something slow",
      agentsDir,
      workDir,
      piPath,
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

  it("completes normally when pi finishes before timeout", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 10 });

    // Fake pi that outputs NDJSON quickly
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done fast."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done fast."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done fast."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "quick task",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-fast",
    });

    expect(result.output.trim()).toBe("Done fast.");
  });

  // ── Slice 4: Truncation and Error Edge Cases ──

  it("returns truncation error when pi exits without emitting agent_end", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi that exits without agent_end → stream truncation
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "broken task",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-truncated",
    });

    // Stream processor detects truncation and writes error to output.md
    expect(result.output).toContain("[ERROR]");
    expect(result.output).toContain("Stream truncated");
  });

  it("returns final text when pi exits non-zero after agent_end", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi that emits full NDJSON with agent_end then exits 1
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Partial work done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Partial work done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Partial work done."}]}]}
NDJSON
exit 1
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crashing task",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-crash",
    });

    // Stream processor completed with agent_end, so final text is returned
    expect(result.output.trim()).toBe("Partial work done.");
  });

  // ── Slice 5 (012 Tracer Bullet): Optional progress callback ──

  it("accepts an optional onProgress callback without changing existing call sites that do not provide one", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done."}]}]}
NDJSON
exit 0
`,
    );

    // No callback — should work exactly as before
    const result = await spawnSubagent({
      agentType: "scout",
      task: "no callback",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-nocb",
    });

    expect(result.output.trim()).toBe("Done.");
    expect(result.agentId).toBe("scout-nocb");
  });

  it("calls onProgress with an empty feed initially", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done."}]}]}
NDJSON
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "with callback",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-withcb",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Callback called at least once (initial empty feed)
    expect(progressCalls.length).toBeGreaterThanOrEqual(1);

    // First call is empty feed
    const firstCall = progressCalls[0];
    expect(firstCall.collapsed.lines).toEqual([]);
    expect(firstCall.expanded.lines).toEqual([]);
    expect(firstCall.collapsed.hiddenCount).toBe(0);

    // Output should be canonical
    expect(result.output.trim()).toBe("Done.");
  });

  // ── Slice 6 (012): Progress tailing delivers formatted snapshots ──

  it("delivers formatted progress snapshots via onProgress as stream processor emits events", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi emits NDJSON with interleaved sleeps so the tailer can poll
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
# Emit agent_start first — wait for tailer to pick it up
cat << 'NDJSON'
{"type":"agent_start"}
NDJSON
sleep 0.15
# Emit tool events
echo '{"type":"tool_execution_start","toolName":"read","args":{"file":"looking at file"}}'
echo '{"type":"tool_execution_end","toolName":"read","result":{}}'
sleep 0.15
# Emit message events
echo '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Found 3 files."}}'
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Found 3 files."}]}}'
echo '{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Found 3 files."}]}]}'
# Give tailer time to pick up final batch before exit
sleep 0.2
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "find files",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // At least initial empty feed + one with events
    expect(progressCalls.length).toBeGreaterThanOrEqual(2);

    // First call is empty feed
    expect(progressCalls[0].collapsed.lines).toEqual([]);

    // Later calls should contain progress events
    const nonEmptyCalls = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(nonEmptyCalls.length).toBeGreaterThanOrEqual(1);

    // The final progress snapshot should have all events (may arrive in batches)
    const lastNonEmpty = nonEmptyCalls[nonEmptyCalls.length - 1];
    // Events: lifecycle(started), tool(started), tool(succeeded), assistant_text, lifecycle(completed)
    expect(lastNonEmpty.expanded.lines.length).toBe(5);
    expect(lastNonEmpty.expanded.lines[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
    });
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text.includes("[read]"))).toBe(true);
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text === "Found 3 files.")).toBe(true);
    expect(lastNonEmpty.expanded.lines.some((l: { text: string }) => l.text === "Subagent completed")).toBe(true);

    // Collapsed view should be formatted
    expect(lastNonEmpty.collapsed.lines.length).toBe(5);
    expect(lastNonEmpty.collapsed.hiddenCount).toBe(0);

    // Output should still be canonical
    expect(result.output.trim()).toBe("Found 3 files.");
  });

  // ── Progress tailing stops on finish, timeout, crash ──

  it("stops progress tailing when subagent finishes and does not deliver events after completion", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi with interleaved sleep so tailer can pick up events before completion
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
NDJSON
sleep 0.15
cat << 'NDJSON'
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done."}]}]}
NDJSON
sleep 0.2
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "finish",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-finish",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress delivered with events
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Output is canonical
    expect(result.output.trim()).toBe("Done.");

    // Verify no more callbacks after this
    const finalCount = progressCalls.length;

    // Append an event to progress.jsonl AFTER subagent finished
    const taskDir = join(workDir, ".pi", "subagents", "scout-finish");
    appendFileSync(
      join(taskDir, "progress.jsonl"),
      JSON.stringify({ type: "lifecycle", text: "post-finish event", timestamp: "2026-01-01T00:00:10Z", status: "completed" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 150));
    expect(progressCalls.length).toBe(finalCount);
  });

  it("stops progress tailing when subagent times out", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 1 });

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"read","args":{"file":"reading file"}}
NDJSON
# Sleep longer than timeout to trigger it
sleep 5
exit 0
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "slow",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-timeout-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress delivered with events before timeout
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Output contains timeout error
    expect(result.output).toContain("timed out");

    // No callbacks after this point
    const finalCount = progressCalls.length;

    const taskDir = join(workDir, ".pi", "subagents", "scout-timeout-progress");
    appendFileSync(
      join(taskDir, "progress.jsonl"),
      JSON.stringify({ type: "lifecycle", text: "post-timeout event", timestamp: "2026-01-01T00:00:10Z", status: "completed" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 150));
    expect(progressCalls.length).toBe(finalCount);
  }, 10000);

  // ── Callback failure safety ──

  it("ignores callback failures and does not change final subagent output", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Success."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Success."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Success."}]}]}
NDJSON
exit 0
`,
    );

    let callCount = 0;

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crash callback",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-crashcb",
      onProgress: (_feed) => {
        callCount++;
        throw new Error("callback exploded");
      },
    });

    // Callback called at least once
    expect(callCount).toBeGreaterThanOrEqual(1);

    // Subagent still completes and returns canonical output
    expect(result.output.trim()).toBe("Success.");
    expect(result.agentId).toBe("scout-crashcb");
  });

  // ── Cancellation via AbortSignal ──

  it("stops progress tailing and kills subagent when cancellation signal fires", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 10 });

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"read","args":{"file":"started"}}
NDJSON
# Block — exec replaces shell so SIGTERM goes directly to tail
exec tail -f /dev/null
`,
    );

    const controller = new AbortController();
    const progressCalls: ActivityFeedOutput[] = [];

    const abortTimer = setTimeout(() => {
      controller.abort();
    }, 300);

    const result = await spawnSubagent({
      agentType: "scout",
      task: "cancelled task",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-cancel",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
      signal: controller.signal,
    });

    clearTimeout(abortTimer);

    // Progress delivered before cancellation
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Result is returned (not thrown)
    expect(result.agentId).toBe("scout-cancel");

    // No callbacks after return
    const finalCount = progressCalls.length;
    await new Promise((r) => setTimeout(r, 150));
    expect(progressCalls.length).toBe(finalCount);
  }, 10000);

  // ── Slice 11 (019 Tracer Bullet): Enriched result with duration, model, usage ──

  it("returns enriched result with duration, model, and usage when stream processor yields usage events", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    // Fake pi emits NDJSON with usage in agent_end messages
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"read","args":{"file":"looking at file"}}
{"type":"tool_execution_end","toolName":"read","result":{}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done with usage."}],"usage":{"input":2100,"output":300,"cacheRead":0,"cacheWrite":0}}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done with usage."}],"usage":{"input":2100,"output":300}}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "track usage",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-enriched",
      onProgress: () => {},
    });

    expect(result.output.trim()).toBe("Done with usage.");
    expect(result.agentId).toBe("scout-enriched");
    expect(result.agentType).toBe("scout");

    expect(typeof result.duration).toBe("number");
    expect(result.duration).toBeGreaterThan(0);
    expect(result.duration).toBeLessThan(5000);

    expect(result.model).toBe("minimax/MiniMax-M2.7");

    // Usage captured from progress events (via stream processor on agent_end)
    expect(result.usage).toBeDefined();
    expect(result.usage!.input).toBe(2100);
    expect(result.usage!.output).toBe(300);
    expect(result.usage!.cacheRead).toBe(0);
    expect(result.usage!.cacheWrite).toBe(0);
  });

  it("returns model from overrides when provided, ignoring agent definition", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "worker", { model: "minimax/MiniMax-M2.7" });

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "worker",
      task: "override model",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "worker-override",
      overrides: { model: "anthropic/claude-sonnet" },
    });

    expect(result.model).toBe("anthropic/claude-sonnet");
  });

  it("returns undefined model when neither overrides nor definition has a model", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout"); // no model field

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "no model",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-nomodel",
    });

    expect(result.model).toBeUndefined();
  });

  it("returns undefined usage when no usage events appear in progress", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_update","assistantMessageEvent":{"type":"text_delta","delta":"Done no usage."}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done no usage."}]}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done no usage."}]}]}
NDJSON
exit 0
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "no usage events",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-nousage",
      onProgress: () => {},
    });

    expect(result.usage).toBeUndefined();
  });

  it("captures usage from progress.jsonl even when no onProgress callback is provided", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    // Fake pi emits NDJSON with full usage in agent_end messages
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Done no callback."}],"usage":{"input":3500,"output":1500,"cacheRead":100,"cacheWrite":0}}}
{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Done no callback."}],"usage":{"input":3500,"output":1500,"cacheRead":100,"cacheWrite":0}}]}
NDJSON
exit 0
`,
    );

    // No onProgress callback — usage should still be captured
    const result = await spawnSubagent({
      agentType: "scout",
      task: "usage without callback",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-nocb-usage",
    });

    expect(result.output.trim()).toBe("Done no callback.");
    expect(result.duration).toBeGreaterThan(0);
    expect(result.model).toBe("minimax/MiniMax-M2.7");
    expect(result.usage).toBeDefined();
    expect(result.usage!.input).toBe(3500);
    expect(result.usage!.output).toBe(1500);
    expect(result.usage!.cacheRead).toBe(100);
  });

  it("delivers progress and returns error output when subagent crashes with callback active", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi emits some NDJSON (with interleaved sleep for tailer), then exits without agent_end
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
NDJSON
sleep 0.15
echo '{"type":"tool_execution_start","toolName":"read","args":{"file":"about to crash"}}'
echo '{"type":"tool_execution_end","toolName":"read","result":{"isError":true}}'
exit 1
`,
    );

    const progressCalls: ActivityFeedOutput[] = [];

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crashing",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-crash-progress",
      onProgress: (feed) => {
        progressCalls.push(feed);
      },
    });

    // Progress delivered before crash
    const callsWithEvents = progressCalls.filter((c) => c.expanded.lines.length > 0);
    expect(callsWithEvents.length).toBeGreaterThanOrEqual(1);

    // Output contains truncation error (stream processor detects no agent_end)
    expect(result.output).toContain("[ERROR]");
    expect(result.agentId).toBe("scout-crash-progress");
  });
});
