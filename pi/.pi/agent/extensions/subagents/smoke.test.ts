import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { spawnSubagent } from "./spawner";

// ── Test helpers ──

let workDirs: string[] = [];
let agentDirs: string[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "smoke-test-"));
  mkdirSync(join(dir, ".pi"), { recursive: true });
  workDirs.push(dir);
  return dir;
}

function makeAgentsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "smoke-agents-"));
  agentDirs.push(dir);
  return dir;
}

function writeAgentDef(
  agentsDir: string,
  name: string,
  fields: Record<string, unknown> = {},
): void {
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

/** Write a custom wrapper that pipes a fake pi through the real stream-filter.
 * NOTE: This bypasses the real subagent-wrapper.sh and tmux entirely.
 * A future HITL test slice should exercise the full tmux-based wrapper.
 */
function writeCustomWrapper(
  workDir: string,
  fakePiPath: string,
): string {
  const streamFilterPath = resolve(__dirname, "stream-filter.sh");
  const wrapperPath = join(workDir, "custom-wrapper.sh");
  const content = `#!/usr/bin/env bash
set -euo pipefail
TASK_DIR="\$1"
MANIFEST_PATH="\$2"

# Export env vars from manifest so PI_SUBAGENT_CHILD etc. are set
if command -v jq &>/dev/null && [[ -f "\$MANIFEST_PATH" ]]; then
  while IFS=\$'\\t' read -r key value; do
    [[ -z "\$key" ]] && continue
    export "\$key=\$value"
  done < <(jq -r '.env // {} | to_entries[] | [.key, (.value | tostring)] | @tsv' "\$MANIFEST_PATH")
fi

# Run fake pi through the real stream filter
bash "${fakePiPath}" | bash "${streamFilterPath}" "\$TASK_DIR" "\$MANIFEST_PATH"
exit_code=\$?

# Propagate pi exit code if captured
if [[ -f "\$TASK_DIR/.pi_exit_code" ]]; then
  exit_code=\$(tr -d '[:space:]' < "\$TASK_DIR/.pi_exit_code")
fi

exit "\$exit_code"
`;
  writeFileSync(wrapperPath, content, "utf-8");
  chmodSync(wrapperPath, 0o755);
  return wrapperPath;
}

/** Write a fake pi script that emits a deterministic JSON event stream (10 events).
 * Exercises: session, agent_start, text_delta buffering, tool_call/result aliases,
 * tool_execution_* regular events, message_end, agent_end.
 */
function writeFakePi(workDir: string): string {
  const fakePiPath = join(workDir, "fake-pi.sh");
  const content = `#!/usr/bin/env bash
# Emit a known sequence of 10 events that exercises the full stream-filter pipeline.
# Order is part of the contract — the test asserts exact ordering.
echo '{"type":"session","session_id":"test-session-001"}'
echo '{"type":"agent_start","agentType":"scout"}'
echo '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":1,"delta":"Scanning codebase. "}}'
echo '{"type":"message_update","assistantMessageEvent":{"type":"text_delta","contentIndex":1,"delta":"Found relevant files."}}'
echo '{"type":"tool_call","toolCallId":"call_1","toolName":"read","args":{"path":"/tmp/test.txt"}}'
echo '{"type":"tool_result","toolCallId":"call_1","toolName":"read","result":{"content":[{"type":"text","text":"file contents here"}]}}'
echo '{"type":"tool_execution_start","toolCallId":"call_2","toolName":"bash","args":{"command":"ls -la"}}'
echo '{"type":"tool_execution_end","toolCallId":"call_2","toolName":"bash","result":{"isError":true,"content":[{"type":"text","text":"command failed"}]}}'
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Hello from integration subagent. Task completed successfully."}]}}'
echo '{"type":"agent_end","messages":[{"role":"user","content":[{"type":"text","text":"Find all TypeScript files"}]},{"role":"assistant","content":[{"type":"text","text":"Hello from integration subagent. Task completed successfully."}]}],"willRetry":false}'
exit 0
`;
  writeFileSync(fakePiPath, content, "utf-8");
  chmodSync(fakePiPath, 0o755);
  return fakePiPath;
}

afterEach(() => {
  for (const dir of workDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  for (const dir of agentDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

// ══════════════════════════════════════════════════════════════════
// Phase 1: Tracer Bullet — spawnSubagent/stream-filter Integration
// NOTE: Uses a custom wrapper that bypasses tmux. A future HITL
// test slice should exercise the full tmux-based wrapper.
// ══════════════════════════════════════════════════════════════════

describe("spawnSubagent → stream-filter integration (tmux bypassed)", () => {
  it("[1.1] spawnSubagent with fake-pi piped through real stream-filter: verifies output.md, events.jsonl (exact count + ordering), manifest, and result", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Define a scout agent
    writeAgentDef(agentsDir, "scout", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "find", "ls", "bash"],
      systemPromptMode: "replace",
    });

    // Create fake pi and custom wrapper that pipes through real stream-filter
    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "scout",
      task: "Find all TypeScript files",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "scout-smoke-001",
    });

    // ── Verify result returned to caller ──
    expect(result.agentId).toBe("scout-smoke-001");
    expect(result.output).toContain("Hello from integration subagent");
    expect(result.output).toContain("Task completed successfully");

    // ── Verify task directory structure ──
    const taskDir = join(workDir, ".pi", "subagents", "scout-smoke-001");
    expect(existsSync(taskDir)).toBe(true);
    expect(existsSync(join(taskDir, "task.md"))).toBe(true);
    expect(existsSync(join(taskDir, "manifest.json"))).toBe(true);
    expect(existsSync(join(taskDir, "output.md"))).toBe(true);
    expect(existsSync(join(taskDir, "events.jsonl"))).toBe(true);
    expect(existsSync(join(taskDir, "progress.jsonl"))).toBe(true);

    // ── Verify task.md contains the prompt ──
    const taskMd = readFileSync(join(taskDir, "task.md"), "utf-8");
    expect(taskMd).toBe("Find all TypeScript files");

    // ── Verify manifest.json structure ──
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);
    expect(manifest.agentId).toBe("scout-smoke-001");
    expect(manifest.taskDir).toBe(taskDir);
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");
    expect(manifest.command).toBeInstanceOf(Array);
    expect(manifest.command[0]).toBe("pi");

    // ── Verify events.jsonl: exact one-to-one event count ──
    const eventsJsonl = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
    const eventLines = eventsJsonl.trim().split("\n");
    expect(eventLines.length).toBe(10);

    // Verify each line is valid JSON
    for (const line of eventLines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }

    // Verify event type ordering matches the fake pi's deterministic sequence
    const eventTypes = eventLines.map((l) => JSON.parse(l).type);
    expect(eventTypes).toEqual([
      "session",
      "agent_start",
      "message_update",
      "message_update",
      "tool_call",
      "tool_result",
      "tool_execution_start",
      "tool_execution_end",
      "message_end",
      "agent_end",
    ]);

    // Verify tool_call event preserved as-is in events.jsonl (stream-filter writes raw JSON)
    const toolCallEvent = JSON.parse(eventLines[4]);
    expect(toolCallEvent.toolName).toBe("read");
    expect(toolCallEvent.args.path).toBe("/tmp/test.txt");

    // Verify tool_result event preserved as-is in events.jsonl
    const toolResultEvent = JSON.parse(eventLines[5]);
    expect(toolResultEvent.toolName).toBe("read");
    expect(toolResultEvent.result.isError).toBeFalsy();

    // Verify regular tool_execution_end with error result
    const toolErrorEvent = JSON.parse(eventLines[7]);
    expect(toolErrorEvent.toolName).toBe("bash");
    expect(toolErrorEvent.result.isError).toBe(true);

    // ── Verify progress.jsonl contains structured user-facing events ──
    const progressJsonl = readFileSync(join(taskDir, "progress.jsonl"), "utf-8");
    const progressEvents = progressJsonl.trim().split("\n").map((line) => JSON.parse(line));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "lifecycle", status: "started" }));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "tool", status: "started" }));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "tool", status: "succeeded" }));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "tool", status: "failed" }));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "assistant_text", text: "Scanning codebase." }));
    expect(progressEvents).toContainEqual(expect.objectContaining({ type: "terminal", status: "completed" }));

    // ── Verify output.md content ──
    const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
    expect(outputMd).toContain("Hello from integration subagent");
  }, 15000);
});

// ══════════════════════════════════════════════════════════════════
// Phase 2: YOLO Mode — PI_SUBAGENT_CHILD bypasses confirm-mutating-tools
//
// NOTE: These tests verify the subagent module's contractual responsibility:
// setting PI_SUBAGENT_CHILD=1 in the subagent's environment. The other side
// of the contract — that confirm-mutating-tools reads the env var and actually
// bypasses confirmation — lives in extensions/confirm-mutating-tools.ts and
// requires real pi execution to verify end-to-end. This is out of scope for
// this module's test suite.
// ══════════════════════════════════════════════════════════════════

describe("YOLO mode (PI_SUBAGENT_CHILD)", () => {
  it("[2.1] manifest for write-capable agent contains PI_SUBAGENT_CHILD=1 and write/edit/bash tools", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Define a write-capable local-worker agent
    writeAgentDef(agentsDir, "local-worker", {
      model: "llama-cpp/qwen3.6-35b-a3b-local",
      tools: ["read", "bash", "edit", "write"],
      thinking: "off",
    });

    // Use fake pi to simulate subagent output (PI_SUBAGENT_CHILD is exported
    // by the custom wrapper; the fake pi emits a deterministic event stream.)
    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "local-worker",
      task: "Analyze the codebase and report findings",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "worker-yolo-001",
    });

    expect(result.agentId).toBe("worker-yolo-001");

    const taskDir = join(workDir, ".pi", "subagents", "worker-yolo-001");
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    // ── Verify PI_SUBAGENT_CHILD=1 is set (this is what bypasses confirm-mutating-tools) ──
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");

    // ── Verify command includes write-capable tools ──
    const toolsIndex = manifest.command.indexOf("--tools");
    expect(toolsIndex).toBeGreaterThan(-1);
    const toolsArg = manifest.command[toolsIndex + 1];
    expect(toolsArg).toBeTypeOf("string");

    // Write-capable agent must have write tools
    if (typeof toolsArg === "string") {
      const tools = toolsArg.split(",");
      expect(tools).toContain("write");
      expect(tools).toContain("edit");
      expect(tools).toContain("bash");
    }

    // ── Verify the result returned (subagent completed) ──
    expect(result.output).toContain("Hello from integration subagent");
  }, 15000);

  it("[2.2] agent with only non-mutating read tools also gets PI_SUBAGENT_CHILD=1 — YOLO is unconditional", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Define an agent with ONLY read tools (no bash, no write/edit).
    // This is a distinct case from Phase 1 [1.1] which used scout with bash.
    writeAgentDef(agentsDir, "readonly-checker", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "find"],
      systemPromptMode: "replace",
    });

    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "readonly-checker",
      task: "Find TypeScript files",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "readonly-yolo-001",
    });

    const taskDir = join(workDir, ".pi", "subagents", "readonly-yolo-001");
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    // ── PI_SUBAGENT_CHILD should be set for ALL agent types ──
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");

    // ── Command should contain only read tools (no write/edit/bash) ──
    const toolsIndex = manifest.command.indexOf("--tools");
    expect(toolsIndex).toBeGreaterThan(-1);
    const toolsArg = manifest.command[toolsIndex + 1] as string;
    const tools = toolsArg.split(",");
    expect(tools).toContain("read");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("bash");

    // Even without mutating tools, PI_SUBAGENT_CHILD is still set.
    // This confirms the design: YOLO is unconditional, safety comes from
    // agent-level tool restriction, not from the env var being conditional.
    expect(result.agentId).toBe("readonly-yolo-001");
    expect(result.output).toContain("Hello from integration subagent");
  }, 15000);

  it("[2.3] agent with inheritExtensions:false + write tools still gets PI_SUBAGENT_CHILD=1", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Agent that opts out of extensions — confirm-mutating-tools won't load,
    // so PI_SUBAGENT_CHILD is redundant but must still be set for consistency.
    writeAgentDef(agentsDir, "isolated-worker", {
      model: "llama-cpp/qwen3.6-35b-a3b-local",
      tools: ["read", "write", "edit"],
      thinking: "off",
      inheritExtensions: false,
    });

    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "isolated-worker",
      task: "Analyze and report",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "isolated-yolo-001",
    });

    const taskDir = join(workDir, ".pi", "subagents", "isolated-yolo-001");
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    // ── PI_SUBAGENT_CHILD is still set even when extensions are disabled ──
    expect(manifest.env.PI_SUBAGENT_CHILD).toBe("1");

    // ── --no-extensions flag is present ──
    expect(manifest.command).toContain("--no-extensions");

    // ── Write tools are present (agent runs with no confirmation gating at all) ──
    const toolsIndex = manifest.command.indexOf("--tools");
    expect(toolsIndex).toBeGreaterThan(-1);
    const toolsArg = manifest.command[toolsIndex + 1] as string;
    const tools = toolsArg.split(",");
    expect(tools).toContain("write");
    expect(tools).toContain("edit");

    expect(result.agentId).toBe("isolated-yolo-001");
    expect(result.output).toContain("Hello from integration subagent");
  }, 15000);
});

// ══════════════════════════════════════════════════════════════════
// Phase 3: Read-Only Agent Tool Specification
//
// NOTE: The command-builder passes through whatever tools the agent
// definition specifies. There is no enforcement layer (e.g., stripping
// write tools from agents marked readOnly). Safety comes from the
// agent definition author choosing the right tool set — the system
// trusts the definition as-is.
// ══════════════════════════════════════════════════════════════════

describe("read-only agent tool specification", () => {
  it("[3.1] read-only agent manifest excludes write and edit tools", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Define a read-only agent with only inspection tools
    writeAgentDef(agentsDir, "criteria-auditor", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "find", "ls", "bash"],
      systemPromptMode: "replace",
    });

    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "criteria-auditor",
      task: "Audit acceptance criteria",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "auditor-ro-001",
    });

    const taskDir = join(workDir, ".pi", "subagents", "auditor-ro-001");
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    // ── Verify tools flag is present ──
    const toolsIndex = manifest.command.indexOf("--tools");
    expect(toolsIndex).toBeGreaterThan(-1);
    const toolsArg = manifest.command[toolsIndex + 1] as string;
    const tools = toolsArg.split(",");

    // ── Read-only tools must be present ──
    expect(tools).toContain("read");
    expect(tools).toContain("grep");
    expect(tools).toContain("find");
    expect(tools).toContain("ls");

    // ── Write tools must NOT be present ──
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");

    // ── bash is allowed for read-only agents (non-interactive inspection) ──
    expect(tools).toContain("bash");

    // ── Verify subagent still runs successfully ──
    expect(result.agentId).toBe("auditor-ro-001");
    expect(result.output).toContain("Hello from integration subagent");
  }, 15000);

  it("[3.2] read-only agent with absolutely no mutating tools (including no bash) is honored", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Read-only agent with ONLY read tools — not even bash
    writeAgentDef(agentsDir, "pure-reader", {
      model: "minimax/MiniMax-M2.7",
      tools: ["read", "grep", "find", "ls"],
      systemPromptMode: "replace",
    });

    const fakePiPath = writeFakePi(workDir);
    const wrapperPath = writeCustomWrapper(workDir, fakePiPath);

    const result = await spawnSubagent({
      agentType: "pure-reader",
      task: "Read and summarize",
      agentsDir,
      workDir,
      wrapperPath,
      generateId: () => "pure-ro-001",
    });

    const taskDir = join(workDir, ".pi", "subagents", "pure-ro-001");
    const manifestRaw = readFileSync(join(taskDir, "manifest.json"), "utf-8");
    const manifest = JSON.parse(manifestRaw);

    const toolsIndex = manifest.command.indexOf("--tools");
    expect(toolsIndex).toBeGreaterThan(-1);
    const toolsArg = manifest.command[toolsIndex + 1] as string;
    const tools = toolsArg.split(",");

    // No mutating tools at all
    expect(tools).not.toContain("write");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("bash");

    // Only read tools — order-independent assertion
    expect(new Set(tools)).toEqual(new Set(["read", "grep", "find", "ls"]));

    expect(result.agentId).toBe("pure-ro-001");
    expect(result.output).toContain("Hello from integration subagent");
  }, 15000);
});
