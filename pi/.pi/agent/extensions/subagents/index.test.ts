import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as spawnerModule from "./spawner";

// ── Module import ──

import subagentEntryPoint from "./index";

// ── Test helpers ──

let workDirs: string[] = [];
let agentDirs: string[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "entrypoint-test-"));
  mkdirSync(join(dir, ".pi"), { recursive: true });
  workDirs.push(dir);
  return dir;
}

function makeAgentsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "entrypoint-agents-"));
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

function mockExtensionAPI(): {
  registerTool: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
} {
  return {
    registerTool: vi.fn(),
    on: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of workDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
  for (const dir of agentDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

describe("subagents entry point", () => {
  // ── Slice 1.1: Tracer Bullet — onUpdate forwarded to spawnSubagent ──

  it("forwards onUpdate callback to spawnSubagent as onProgress", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const mockOnUpdate = vi.fn();
    const spawnSpy = vi.spyOn(spawnerModule, "spawnSubagent").mockResolvedValueOnce({
      output: "task completed successfully",
      agentId: "scout-a1b2c3d4",
    });

    await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "Find all TypeScript files" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const spawnOpts = spawnSpy.mock.calls[0][0];
    expect(spawnOpts.onProgress).toBeTypeOf("function");
  });

  // ── Slice 1.2: Tracer Bullet — Happy Path ──

  it("registers subagent tool with correct parameters and execute handler calls spawnSubagent, returns result", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    const toolCall = pi.registerTool.mock.calls[0][0];

    // ── Tool metadata ──
    expect(toolCall.name).toBe("subagent");
    expect(toolCall.description).toBeTypeOf("string");

    // ── Parameter schema ──
    const params = toolCall.parameters;
    expect(params.properties.agent_type).toBeDefined();
    expect(params.required).toContain("agent_type");
    expect(params.properties.prompt).toBeDefined();
    expect(params.required).toContain("prompt");
    expect(params.properties.model).toBeDefined();
    expect(params.required).not.toContain("model");
    expect(params.properties.thinking).toBeDefined();
    expect(params.required).not.toContain("thinking");

    // ── Execute handler ──
    expect(toolCall.execute).toBeTypeOf("function");

    // Spy on spawnSubagent to return a known result
    const spawnSpy = vi.spyOn(spawnerModule, "spawnSubagent").mockResolvedValueOnce({
      output: "task completed successfully",
      agentId: "scout-a1b2c3d4",
    });

    // Call the execute handler with all params
    const result = await toolCall.execute(
      "call-1",
      {
        agent_type: "scout",
        prompt: "Find all TypeScript files",
        model: "anthropic/claude-sonnet",
        thinking: "high",
      },
      new AbortController().signal,
      () => {},
      { cwd: workDir },
    );

    // Verify spawnSubagent was called with correct mapped options
    expect(spawnSpy).toHaveBeenCalledTimes(1);
    const spawnOpts = spawnSpy.mock.calls[0][0];
    expect(spawnOpts.agentType).toBe("scout");
    expect(spawnOpts.task).toBe("Find all TypeScript files");
    expect(spawnOpts.agentsDir).toBe(agentsDir);
    expect(spawnOpts.overrides).toEqual({
      model: "anthropic/claude-sonnet",
      thinking: "high",
    });

    // Verify result returned to LLM
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("task completed successfully");
    expect(result.details.agentId).toBe("scout-a1b2c3d4");
  });

  // ── Slice 2.1: Update payload shape — collapsed + expanded feed ──

  it("calls onUpdate with AgentToolResult shape containing collapsed and expanded feed", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const mockOnUpdate = vi.fn();
    const sampleFeed = {
      collapsed: {
        text: "Subagent started\n… 3 older events hidden …\nTool: read\nTool: edit",
        hiddenCount: 3,
        lines: [
          { type: "lifecycle" as const, text: "Subagent started", timestamp: "2026-01-01T00:00:00Z" },
          { type: "tool" as const, text: "Tool: read", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
          { type: "tool" as const, text: "Tool: edit", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" as const },
        ],
      },
      expanded: {
        text: "Subagent started\nTool: read\nTool: edit\nTool: search\nAssistant: done",
        hiddenCount: 0,
        lines: [
          { type: "lifecycle" as const, text: "Subagent started", timestamp: "2026-01-01T00:00:00Z" },
          { type: "tool" as const, text: "Tool: read", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
          { type: "tool" as const, text: "Tool: edit", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" as const },
          { type: "tool" as const, text: "Tool: search", timestamp: "2026-01-01T00:00:03Z", status: "succeeded" as const },
          { type: "assistant_text" as const, text: "Assistant: done", timestamp: "2026-01-01T00:00:04Z" },
        ],
      },
    };

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      opts.onProgress?.(sampleFeed);
      return { output: "task completed successfully", agentId: "scout-abc123" };
    });

    await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "Find all TypeScript files" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    expect(mockOnUpdate).toHaveBeenCalledTimes(1);
    const updatePayload = mockOnUpdate.mock.calls[0][0];

    // Verify AgentToolResult shape
    expect(updatePayload.content).toBeDefined();
    expect(updatePayload.content).toHaveLength(1);
    expect(updatePayload.content[0].type).toBe("text");
    expect(updatePayload.content[0].text).toBe(sampleFeed.collapsed.text);

    // Verify details contains full feed for custom rendering
    expect(updatePayload.details).toBeDefined();
    expect(updatePayload.details.collapsed).toBeDefined();
    expect(updatePayload.details.expanded).toBeDefined();
    expect(updatePayload.details.collapsed.hiddenCount).toBe(3);
    expect(updatePayload.details.expanded.hiddenCount).toBe(0);
  });

  // ── Slice 3.1: Best-effort — onUpdate failure does not break completion ──

  it("returns final result even when onUpdate throws during progress delivery", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const throwingOnUpdate = vi.fn().mockImplementation(() => {
      throw new Error("UI rendering failed");
    });

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      opts.onProgress?.({
        collapsed: { text: "progress", hiddenCount: 0, lines: [] },
        expanded: { text: "progress", hiddenCount: 0, lines: [] },
      });
      return { output: "completed despite UI error", agentId: "scout-123" };
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "do stuff" },
      new AbortController().signal,
      throwingOnUpdate,
      { cwd: workDir },
    );

    // onUpdate was called (and threw), but final result is still returned
    expect(throwingOnUpdate).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBe("completed despite UI error");
    expect(result.details.agentId).toBe("scout-123");
  });

  // ── Slice 3.2: Final success result unchanged despite progress updates ──

  it("returns unchanged final success result when progress updates occurred", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "worker");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const mockOnUpdate = vi.fn();

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      // Simulate multiple progress updates
      opts.onProgress?.({
        collapsed: { text: "Step 1", hiddenCount: 0, lines: [] },
        expanded: { text: "Step 1", hiddenCount: 0, lines: [] },
      });
      opts.onProgress?.({
        collapsed: { text: "Step 2", hiddenCount: 0, lines: [] },
        expanded: { text: "Step 2", hiddenCount: 0, lines: [] },
      });
      return { output: "final answer", agentId: "worker-abc" };
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "worker", prompt: "complex task" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    // Progress was delivered to UI
    expect(mockOnUpdate).toHaveBeenCalledTimes(2);

    // But LLM gets ONLY the final result, no progress data
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("final answer");
    expect(result.details.agentId).toBe("worker-abc");
    expect(result.details.collapsed).toBeUndefined();
    expect(result.details.expanded).toBeUndefined();
  });

  // ── Slice 3.3: Final error result unchanged despite progress updates ──

  it("returns unchanged final error result when progress updates occurred before failure", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "planner");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const mockOnUpdate = vi.fn();

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      opts.onProgress?.({
        collapsed: { text: "Trying...", hiddenCount: 0, lines: [] },
        expanded: { text: "Trying...", hiddenCount: 0, lines: [] },
      });
      // Simulate the spawner returning an error output (not throwing)
      return { output: '[ERROR] Subagent "planner" crashed.', agentId: "planner-err" };
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "planner", prompt: "risky task" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    // Progress was delivered to UI
    expect(mockOnUpdate).toHaveBeenCalledTimes(1);

    // LLM gets the error result, unchanged, with no progress mixed in
    expect(result.content[0].text).toBe('[ERROR] Subagent "planner" crashed.');
    expect(result.details.agentId).toBe("planner-err");
    expect(result.details.collapsed).toBeUndefined();
    expect(result.details.expanded).toBeUndefined();
  });

  // ── Slice 3.4: Progress works without tmux ──

  it("returns final result normally when onUpdate is provided without any tmux environment", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    const mockOnUpdate = vi.fn();

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      // Simulate progress delivery via file tailing (no tmux involved at entry point)
      opts.onProgress?.({
        collapsed: { text: "Progress: no tmux needed", hiddenCount: 0, lines: [] },
        expanded: { text: "Progress: no tmux needed", hiddenCount: 0, lines: [] },
      });
      return { output: "done", agentId: "scout-notmux" };
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "simple task" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    expect(mockOnUpdate).toHaveBeenCalledTimes(1);
    expect(result.content[0].text).toBe("done");
    expect(result.details.agentId).toBe("scout-notmux");
  });

  it("tool description includes agent types loaded from the agents directory", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");
    writeAgentDef(agentsDir, "planner");
    writeAgentDef(agentsDir, "worker");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    const toolCall = pi.registerTool.mock.calls[0][0];

    const desc = (toolCall.description as string).toLowerCase();
    expect(desc).toContain("scout");
    expect(desc).toContain("planner");
    expect(desc).toContain("worker");
  });

  // ── Slice 3: UnknownAgentError → clear error message ──

  it("returns clear error message when agent type does not exist", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    // Spy on spawnSubagent to reject with an error
    vi.spyOn(spawnerModule, "spawnSubagent").mockRejectedValueOnce(
      new Error(
        'Unknown agent type "nonexistent". Available types: scout, planner',
      ),
    );

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "nonexistent", prompt: "do stuff" },
      new AbortController().signal,
      () => {},
      { cwd: workDir },
    );

    // Should return user-facing error message, not throw
    expect(result.content[0].type).toBe("text");
    const msg = result.content[0].text as string;
    expect(msg).toContain("nonexistent");
    expect(msg).toContain("scout");
    expect(msg).toContain("planner");
  });

  // ── Slice 4: Timeout → clear error message ──

  it("returns clear error message when subagent times out", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const toolCall = pi.registerTool.mock.calls[0][0];

    // spawnSubagent resolves with timeout error in output (does not reject)
    vi.spyOn(spawnerModule, "spawnSubagent").mockResolvedValueOnce({
      output: '[ERROR] Subagent "scout" timed out after 120s.',
      agentId: "scout-timeout",
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "slow task" },
      new AbortController().signal,
      () => {},
      { cwd: workDir },
    );

    // Should pass through the timeout error message to the LLM
    expect(result.content[0].type).toBe("text");
    const msg = result.content[0].text as string;
    expect(msg).toContain("[ERROR]");
    expect(msg).toContain("timed out");
    expect(msg).toContain("120s");
  });

  // ── Slice 5: @tintinweb/pi-subagents warning on startup ──

  it("logs warning on session_start when @tintinweb/pi-subagents is in settings.json", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Create settings.json with the legacy package
    const settingsPath = join(workDir, "settings.json");
    writeFileSync(
      settingsPath,
      JSON.stringify({
        packages: [
          "git:github.com/some/other-package",
          "@tintinweb/pi-subagents",
        ],
      }),
      "utf-8",
    );

    const warnCalls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnCalls.push(String(msg));
    });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    // Verify session_start handler was registered
    expect(pi.on).toHaveBeenCalledWith("session_start", expect.any(Function));

    // Get the registered handler
    const sessionStartHandler = pi.on.mock.calls.find(
      (call: any[]) => call[0] === "session_start",
    )?.[1];
    expect(sessionStartHandler).toBeTypeOf("function");

    // Simulate session_start event
    await sessionStartHandler({}, { cwd: workDir });

    // Should have logged a warning about @tintinweb/pi-subagents
    expect(warnCalls.length).toBeGreaterThan(0);
    const warning = warnCalls.find((m) =>
      m.includes("@tintinweb/pi-subagents"),
    );
    expect(warning).toBeDefined();
    expect(warning!.toLowerCase()).toContain("remove");

    warnSpy.mockRestore();
  });

  it("does not log warning when @tintinweb/pi-subagents is absent from settings.json", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    // Create settings.json WITHOUT the legacy package
    writeFileSync(
      join(workDir, "settings.json"),
      JSON.stringify({
        packages: ["git:github.com/some/other-package"],
      }),
      "utf-8",
    );

    const warnCalls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnCalls.push(String(msg));
    });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const sessionStartHandler = pi.on.mock.calls.find(
      (call: any[]) => call[0] === "session_start",
    )?.[1];

    await sessionStartHandler({}, { cwd: workDir });

    // Should NOT have logged about @tintinweb/pi-subagents
    const warning = warnCalls.find((m) =>
      m.includes("@tintinweb/pi-subagents"),
    );
    expect(warning).toBeUndefined();

    warnSpy.mockRestore();
  });

  it("does not log warning when settings.json does not exist", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    // No settings.json file created

    const warnCalls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnCalls.push(String(msg));
    });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });

    const sessionStartHandler = pi.on.mock.calls.find(
      (call: any[]) => call[0] === "session_start",
    )?.[1];

    await sessionStartHandler({}, { cwd: workDir });

    // Should not crash; no warning about pi-subagents
    const warning = warnCalls.find((m) =>
      m.includes("@tintinweb/pi-subagents"),
    );
    expect(warning).toBeUndefined();

    warnSpy.mockRestore();
  });
});
