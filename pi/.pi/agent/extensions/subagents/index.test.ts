import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import * as spawnerModule from "./spawner";
import * as agentDefParserModule from "./agent-definition-parser";

// ── Mock @earendil-works/pi-tui so we can test renderCall without the real package ──
//
// The production code imports { Text } from pi-tui. In tests we provide a minimal
// compatible implementation so the module resolves without a local install.

vi.mock("@earendil-works/pi-tui", () => {
  class Text {
    private _text: string;
    constructor(text = "", _paddingX = 0, _paddingY = 0) {
      this._text = text;
    }
    setText(text: string) {
      this._text = text;
    }
    render(_width: number): string[] {
      return this._text.split("\n");
    }
    invalidate() {}
  }

  return { Text };
});

// ── Module import ──

import subagentEntryPoint, { resolveModel, formatCallHeader } from "./index";

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

  it("full live update flow stores partial usage state and renderCall shows the new header values", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolCall = pi.registerTool.mock.calls[0][0];
    const mockOnUpdate = vi.fn();
    const sampleFeed = {
      collapsed: {
        text: "Tool: read\nTool: bash",
        hiddenCount: 0,
        lines: [
          { type: "tool" as const, text: "Tool: read", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
          { type: "tool" as const, text: "Tool: bash", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" as const },
        ],
      },
      expanded: {
        text: "Tool: read\nTool: bash\nUsage: 2400 tokens",
        hiddenCount: 0,
        lines: [
          { type: "tool" as const, text: "Tool: read", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" as const },
          { type: "tool" as const, text: "Tool: bash", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" as const },
          { type: "usage" as const, text: "Usage: 2400 tokens", timestamp: "2026-01-01T00:00:03Z" },
        ],
      },
      usage: { input: 2100, output: 300, cacheRead: 0, cacheWrite: 0 },
    };

    vi.spyOn(spawnerModule, "spawnSubagent").mockImplementationOnce(async (opts) => {
      opts.onProgress?.(sampleFeed);
      return { output: "done", agentId: "scout-live" };
    });

    await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "watch progress" },
      new AbortController().signal,
      mockOnUpdate,
      { cwd: workDir },
    );

    expect(mockOnUpdate).toHaveBeenCalledTimes(1);
    const partialResult = mockOnUpdate.mock.calls[0][0];
    expect(partialResult.content[0].text).toBe(sampleFeed.collapsed.text);
    expect(partialResult.details).toBe(sampleFeed);

    const invalidate = vi.fn();
    const context = {
      args: { agent_type: "scout", prompt: "watch progress" },
      toolCallId: "tcid-live",
      invalidate,
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: true,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;
    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (_c: string, t: string) => `FG(${t})`,
    } as any;

    toolCall.renderResult(partialResult, { expanded: false, isPartial: true }, theme, context);
    expect(context.state.usage).toEqual(sampleFeed.usage);
    expect(context.state.toolCount).toBe(2);
    // Invalidation must be deferred: synchronous invalidate re-enters ToolExecutionComponent
    // rendering and can add the same partial result component twice.
    expect(invalidate).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);

    const header = toolCall.renderCall(context.args, theme, context);
    const lines = header.render(80);
    expect(lines[1]).toContain("2.4K tokens");
    expect(lines[1]).toContain("2 tools run");
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

  // ── Slice 3.2b (019): Final result details enriched with model, duration, usage ──

  it("final result details includes model, duration, and usage from spawner; content has output text only", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolCall = pi.registerTool.mock.calls[0][0];

    vi.spyOn(spawnerModule, "spawnSubagent").mockResolvedValueOnce({
      output: "subagent output here",
      agentId: "scout-enriched-1",
      agentType: "scout",
      duration: 12345,
      model: "minimax/MiniMax-M2.7",
      usage: { input: 4200, output: 890, cacheRead: 512, cacheWrite: 0 },
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "enriched test" },
      new AbortController().signal,
      vi.fn(),
      { cwd: workDir },
    );

    // content has ONLY the subagent output text — no metadata leakage
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("subagent output here");
    expect(result.content[0].text).not.toContain("scout-enriched-1");
    expect(result.content[0].text).not.toContain("minimax");
    expect(result.content[0].text).not.toContain("12.3");
    expect(result.content[0].text).not.toContain("tokens");

    // details has all enriched metadata
    expect(result.details.agentId).toBe("scout-enriched-1");
    expect(result.details.agentType).toBe("scout");
    expect(result.details.model).toBe("minimax/MiniMax-M2.7");
    expect(result.details.duration).toBe(12345);
    expect(result.details.usage).toEqual({ input: 4200, output: 890, cacheRead: 512, cacheWrite: 0 });

    // details does NOT carry progress-only fields (collapsed/expanded)
    expect(result.details.collapsed).toBeUndefined();
    expect(result.details.expanded).toBeUndefined();
  });

  // ── Slice 1 (Tracer Bullet): activityFeed forwarded from spawner to details ──

  it("forwards activityFeed from spawn result to result.details", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolCall = pi.registerTool.mock.calls[0][0];

    const sampleActivityFeed = {
      collapsed: {
        text: "run Subagent started\nusage …",
        hiddenCount: 2,
        lines: [
          { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
          { type: "tool", text: "read: test.ts", timestamp: "2026-05-29T00:00:01.000Z" },
          { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:02.000Z" },
          { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:03.000Z", status: "completed" },
        ],
      },
      expanded: {
        text: "run Subagent started\ntool read: test.ts\nusage 100 in · 50 out\ndone Subagent completed",
        hiddenCount: 0,
        lines: [
          { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
          { type: "tool", text: "read: test.ts", timestamp: "2026-05-29T00:00:01.000Z" },
          { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:02.000Z" },
          { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:03.000Z", status: "completed" },
        ],
      },
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
    };

    vi.spyOn(spawnerModule, "spawnSubagent").mockResolvedValueOnce({
      output: "feed output",
      agentId: "scout-feed-1",
      agentType: "scout",
      duration: 5432,
      model: "test/model",
      usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
      activityFeed: sampleActivityFeed,
    });

    const result = await toolCall.execute(
      "call-1",
      { agent_type: "scout", prompt: "feed test" },
      new AbortController().signal,
      vi.fn(),
      { cwd: workDir },
    );

    // activityFeed is present in details and matches the spawn result
    expect(result.details.activityFeed).toBeDefined();
    expect(result.details.activityFeed).toEqual(sampleActivityFeed);

    // content still has only the clean output
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("feed output");
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

// ═══════════════════════════════════════════════════════════════════════════
// renderCall — static tool call header with agent type + model
// ═══════════════════════════════════════════════════════════════════════════

describe("renderCall — tool call header", () => {
  function extractToolDef(pi: ReturnType<typeof mockExtensionAPI>) {
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    return pi.registerTool.mock.calls[0][0];
  }

  function callRender(
    toolDef: any,
    args: Record<string, unknown>,
    ctxOverrides: Record<string, unknown> = {},
  ) {
    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (_c: string, t: string) => `FG(${t})`,
    } as any;

    const context = {
      args,
      toolCallId: "tcid-1",
      invalidate: () => {},
      lastComponent: undefined,
      state: {},
      cwd: ctxOverrides.cwd ?? "/test",
      executionStarted: false,
      argsComplete: false,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
      ...ctxOverrides,
    } as any;

    return toolDef.renderCall(args, theme, context);
  }

  // ── Slice 1: Tracer bullet — basic header ──────────────────────────

  it("renderCall returns a valid Component with render and invalidate", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    expect(toolDef.renderCall).toBeTypeOf("function");

    const component = callRender(toolDef, { agent_type: "scout", prompt: "test" });

    expect(component).toBeDefined();
    expect(typeof component.render).toBe("function");
    expect(typeof component.invalidate).toBe("function");
  });

  it("renders agent type in bold as the first line", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(toolDef, { agent_type: "scout", prompt: "test" });

    const lines = component.render(80);
    expect(lines[0]).toContain("BOLD(scout)");
  });

  it("renders exactly two lines", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(toolDef, { agent_type: "scout", prompt: "test" });

    const lines = component.render(80);
    expect(lines).toHaveLength(2);
  });

  // ── Slice 1 bonus: status indicator ───────────────────────────────

  it("shows 'pending...' status when execution has not started", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      { executionStarted: false },
    );

    const lines = component.render(80);
    expect(lines[1]).toContain("pending");
  });

  it("shows 'running...' status when execution started", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      { executionStarted: true },
    );

    const lines = component.render(80);
    expect(lines[1]).toContain("running");
  });

  it("shows live token count and tool count from context.state on line two", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      {
        executionStarted: true,
        state: {
          usage: { input: 2100, output: 300 },
          toolCount: 3,
        },
      },
    );

    const lines = component.render(80);
    expect(lines[1]).toContain("2.4K tokens");
    expect(lines[1]).toContain("3 tools run");
    expect(lines[1]).not.toContain("running");
  });

  it("shows known Subagent model context window as the token denominator", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "local/model-large" });
    writeFileSync(join(agentsDir, "models.json"), JSON.stringify({
      providers: {
        local: {
          models: [
            { id: "local/model-large", contextWindow: 200000 },
          ],
        },
      },
    }), "utf-8");

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      {
        executionStarted: true,
        state: {
          usage: { input: 2100, output: 300 },
          toolCount: 3,
        },
      },
    );

    const lines = component.render(80);
    expect(lines[1]).toContain("2.4K/200K tokens");
  });

  // ── Slice 2: Model from agent definition ──────────────────────────

  it("shows model from agent definition in muted style", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      { cwd: "/test" },
    );

    const lines = component.render(80);
    expect(lines[0]).toContain("FG(minimax/MiniMax-M2.7)");
  });

  // ── Slice 3: Model override priority ────────────────────────────

  it("uses args.model when provided, ignoring agent definition model", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test", model: "anthropic/claude-sonnet" },
      { cwd: "/test" },
    );

    const lines = component.render(80);
    expect(lines[0]).toContain("FG(anthropic/claude-sonnet)");
    expect(lines[0]).not.toContain("minimax");
  });

  // ── Slice 4: Graceful degradation ─────────────────────────────────

  it("renders header without model when agent has no model in definition and no args.model", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout"); // no model field

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      { cwd: "/test" },
    );

    const lines = component.render(80);
    // Still renders two lines, agent in bold is present
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("BOLD(scout)");
  });

  it("renders header when agent definition file does not exist", () => {
    const agentsDir = makeAgentsDir();
    // No agent definition written

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const component = callRender(
      toolDef,
      { agent_type: "nonexistent", prompt: "test" },
      { cwd: "/test" },
    );

    const lines = component.render(80);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("BOLD(nonexistent)");
  });

  // ── Slice 5: Component reuse via lastComponent ────────────────────

  it("reuses lastComponent when available (pattern consistency)", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const first = callRender(toolDef, { agent_type: "scout", prompt: "test" });

    // Second call with lastComponent set to the first component
    const second = callRender(
      toolDef,
      { agent_type: "scout", prompt: "test" },
      { lastComponent: first },
    );

    // Should reuse the same component instance
    expect(second).toBe(first);
  });

  // ── Defensive fallback ──────────────────────────────────────────────

  it("renders '...' as agent type when agent_type is absent", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);

    const component = callRender(toolDef, { prompt: "test" }); // no agent_type

    const lines = component.render(80);
    expect(lines[0]).toContain("BOLD(...)");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// renderResult — live partial update state
// ═══════════════════════════════════════════════════════════════════════════

describe("renderResult — live partial update state", () => {
  function extractToolDef(pi: ReturnType<typeof mockExtensionAPI>) {
    expect(pi.registerTool).toHaveBeenCalledTimes(1);
    return pi.registerTool.mock.calls[0][0];
  }

  it("stores partial Activity Feed usage and tool count in context.state, then defers invalidation", async () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const invalidate = vi.fn();
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate,
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: true,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "progress" }],
        details: {
          collapsed: { text: "progress", hiddenCount: 0, lines: [] },
          expanded: {
            text: "read\nbash\ndone",
            hiddenCount: 0,
            lines: [
              { type: "tool", text: "read", timestamp: "2026-05-29T00:00:00.000Z" },
              { type: "tool", text: "bash", timestamp: "2026-05-29T00:00:01.000Z" },
              { type: "lifecycle", text: "done", timestamp: "2026-05-29T00:00:02.000Z" },
            ],
          },
          usage: { input: 2100, output: 300, cacheRead: 0, cacheWrite: 0 },
        },
      },
      { expanded: false, isPartial: true },
      { fg: (_c: string, t: string) => t } as any,
      context,
    );

    expect(component).toBeDefined();
    expect(typeof component.render).toBe("function");
    expect(context.state.usage).toEqual({ input: 2100, output: 300, cacheRead: 0, cacheWrite: 0 });
    expect(context.state.toolCount).toBe(2);
    expect(invalidate).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("does not mutate live state or invalidate for a final result", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const invalidate = vi.fn();
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate,
      lastComponent: undefined,
      state: { existing: true },
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      { content: [{ type: "text", text: "final output" }], details: { agentId: "scout-1" } },
      { expanded: false, isPartial: false },
      { fg: (_c: string, t: string) => t } as any,
      context,
    );

    expect(component.render(80)).toEqual(["final output"]);
    expect(context.state).toEqual({ existing: true });
    expect(invalidate).not.toHaveBeenCalled();
  });

  // ── Slice 3 (019): Final render shows metadata block ──

  it("final render shows metadata block with agent, model, duration, tokens, separator, then output text", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "subagent output here" }],
        details: {
          agentId: "scout-a3f2b1c8",
          agentType: "scout",
          model: "minimax/MiniMax-M2.7",
          duration: 12345,
          usage: { input: 4231, output: 892, cacheRead: 512, cacheWrite: 0 },
        },
      },
      { expanded: false, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const lines = component.render(80);
    const rendered = lines.join("\n");

    // Metadata block present — agent type plus id suffix
    expect(rendered).toContain("scout");
    expect(rendered).toContain("(id: a3f2b1c8)");
    expect(rendered).toContain("minimax/MiniMax-M2.7");
    expect(rendered).toContain("12.3s");
    expect(rendered).toContain("4,231");
    expect(rendered).toContain("input");
    expect(rendered).toContain("892");
    expect(rendered).toContain("output");
    expect(rendered).toContain("512");
    expect(rendered).toContain("cache read");

    // Separator between metadata and output
    expect(rendered).toContain("───");

    // Output text follows after metadata + separator
    expect(rendered).toContain("subagent output here");
  });

  // ── Slice 4 (019): Theme styling applied to metadata block ──

  it("applies theme colors to metadata block: agent bold, labels muted, separator dim", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (c: string, t: string) => `FG_${c.toUpperCase()}(${t})`,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "subagent output here" }],
        details: {
          agentId: "scout-a3f2b1c8",
          agentType: "scout",
          model: "minimax/MiniMax-M2.7",
          duration: 12345,
          usage: { input: 4231, output: 892, cacheRead: 512, cacheWrite: 0 },
        },
      },
      { expanded: false, isPartial: false },
      theme,
      context,
    );

    const lines = component.render(80);
    const rendered = lines.join("\n");

    // Agent type is bold, id suffix is muted
    expect(rendered).toContain("BOLD(scout)");
    expect(rendered).toContain("FG_MUTED( (id: a3f2b1c8))");

    // Model is muted
    expect(rendered).toContain("FG_MUTED(model: minimax/MiniMax-M2.7)");

    // Duration is muted
    expect(rendered).toContain("FG_MUTED(duration: 12.3s)");

    // Tokens line is muted
    expect(rendered).toContain("FG_MUTED(tokens: 4,231 input · 892 output · 512 cache read)");

    // Separator is dim
    expect(rendered).toContain("FG_DIM(─────────────────────────)");
  });

  it("renders partial token breakdown when only some usage fields are present", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "result text" }],
        details: {
          agentId: "scout-partial",
          agentType: "scout",
          model: "test/model",
          duration: 500,
          usage: { input: 100 },
        },
      },
      { expanded: false, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const rendered = component.render(80).join("\n");
    expect(rendered).toContain("tokens: 100 input");
    // Tokens line should NOT include output or cache read fields when absent
    const tokensLine = rendered.split("\n").find((l: string) => l.startsWith("tokens:"));
    expect(tokensLine).toBeDefined();
    expect(tokensLine).not.toContain("output");
    expect(tokensLine).not.toContain("cache read");
  });

  it("omits tokens line when usage is absent from details", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "result" }],
        details: {
          agentId: "scout-nousage",
          agentType: "scout",
          model: "test/model",
          duration: 500,
        },
      },
      { expanded: false, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const rendered = component.render(80).join("\n");
    expect(rendered).toContain("scout");
    expect(rendered).toContain("(id: nousage)");
    expect(rendered).toContain("0.5s");
    expect(rendered).not.toContain("tokens");
  });

  // ── Slice 2: Expanded final result shows activity feed between metadata and output ──

  it("expanded final render includes activity feed between metadata block and output text", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "subagent output here" }],
        details: {
          agentId: "scout-a3f2b1c8",
          agentType: "scout",
          model: "minimax/MiniMax-M2.7",
          duration: 12345,
          usage: { input: 4231, output: 892, cacheRead: 512, cacheWrite: 0 },
          activityFeed: {
            collapsed: {
              text: "run Subagent started\nusage …",
              hiddenCount: 1,
              lines: [
                { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
                { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:01.000Z" },
                { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:02.000Z", status: "completed" },
              ],
            },
            expanded: {
              text: "run Subagent started\ntool read: test.ts\nusage 100 in · 50 out\ndone Subagent completed",
              hiddenCount: 0,
              lines: [
                { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
                { type: "tool", text: "read: test.ts", timestamp: "2026-05-29T00:00:01.000Z" },
                { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:02.000Z" },
                { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:03.000Z", status: "completed" },
              ],
            },
            usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
          },
        },
      },
      { expanded: true, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const lines = component.render(80);
    const rendered = lines.join("\n");

    // Metadata block present
    expect(rendered).toContain("scout");
    expect(rendered).toContain("12.3s");

    // Exact separator lines: one after metadata, one between feed and output
    const separator = "─────────────────────────";
    expect(lines.filter((line: string) => line === separator)).toHaveLength(2);

    // Activity feed content present — tool line from expanded view
    expect(rendered).toContain("read: test.ts");

    // Lifecycle lines present
    expect(rendered).toContain("Subagent started");
    expect(rendered).toContain("Subagent completed");

    // Structure/order: metadata separator → feed → output separator → output text
    const firstSeparatorIndex = lines.findIndex((line: string) => line === separator);
    const feedIndex = lines.findIndex((line: string) => line.includes("read: test.ts"));
    const secondSeparatorIndex = lines.findIndex(
      (line: string, index: number) => index > feedIndex && line === separator,
    );
    const outputIndex = lines.findIndex((line: string) => line === "subagent output here");

    expect(firstSeparatorIndex).toBeGreaterThanOrEqual(0);
    expect(feedIndex).toBeGreaterThan(firstSeparatorIndex);
    expect(secondSeparatorIndex).toBeGreaterThan(feedIndex);
    expect(outputIndex).toBeGreaterThan(secondSeparatorIndex);
  });

  // ── Slice 3: Collapsed final result excludes activity feed ──

  it("collapsed final render excludes activity feed when present in details", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "subagent output here" }],
        details: {
          agentId: "scout-a3f2b1c8",
          agentType: "scout",
          model: "minimax/MiniMax-M2.7",
          duration: 12345,
          usage: { input: 4231, output: 892, cacheRead: 512, cacheWrite: 0 },
          activityFeed: {
            collapsed: {
              text: "run Subagent started\nusage …",
              hiddenCount: 1,
              lines: [
                { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
                { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:01.000Z" },
                { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:02.000Z", status: "completed" },
              ],
            },
            expanded: {
              text: "run Subagent started\ntool read: test.ts\nusage 100 in · 50 out\ndone Subagent completed",
              hiddenCount: 0,
              lines: [
                { type: "lifecycle", text: "Subagent started", timestamp: "2026-05-29T00:00:00.000Z" },
                { type: "tool", text: "read: test.ts", timestamp: "2026-05-29T00:00:01.000Z" },
                { type: "usage", text: "100 in · 50 out", timestamp: "2026-05-29T00:00:02.000Z" },
                { type: "lifecycle", text: "Subagent completed", timestamp: "2026-05-29T00:00:03.000Z", status: "completed" },
              ],
            },
            usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 0 },
          },
        },
      },
      { expanded: false, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const lines = component.render(80);
    const rendered = lines.join("\n");

    // Metadata block present
    expect(rendered).toContain("scout");
    expect(rendered).toContain("12.3s");

    // No activity feed content — tool lines should NOT appear
    expect(rendered).not.toContain("read: test.ts");
    expect(rendered).not.toContain("Subagent started");

    // Output text is present
    expect(lines).toContain("subagent output here");

    // Exact separator lines: collapsed mode only has the metadata/output separator
    const separator = "─────────────────────────";
    expect(lines.filter((line: string) => line === separator)).toHaveLength(1);
  });

  // ── Slice 5: Graceful degradation when activityFeed absent ──

  it("final render succeeds when details has no activityFeed field (graceful degradation)", () => {
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir: makeAgentsDir() });
    const toolDef = extractToolDef(pi);
    const context = {
      args: { agent_type: "scout", prompt: "test" },
      toolCallId: "tcid-1",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: "/test",
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const component = toolDef.renderResult(
      {
        content: [{ type: "text", text: "legacy output" }],
        details: {
          agentId: "scout-legacy-1",
          agentType: "scout",
          model: "test/model",
          duration: 500,
          usage: { input: 100 },
          // no activityFeed field — legacy/spawner doesn't provide it
        },
      },
      { expanded: true, isPartial: false },
      { fg: (_c: string, t: string) => t, bold: (t: string) => t } as any,
      context,
    );

    const lines = component.render(80);
    const rendered = lines.join("\n");

    // Metadata still renders normally
    expect(rendered).toContain("scout");
    expect(rendered).toContain("(id: legacy-1)");
    expect(rendered).toContain("test/model");
    expect(rendered).toContain("0.5s");
    expect(rendered).toContain("100 input");

    // Separator between metadata and output
    expect(rendered).toContain("───");

    // Output text is present
    expect(rendered).toContain("legacy output");

    // No activity feed text
    expect(rendered).not.toContain("Subagent");
    expect(rendered).not.toContain("read");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// resolveModel — pure function tests
// ═══════════════════════════════════════════════════════════════════════════

describe("resolveModel", () => {

  it("returns args.model when present", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    const result = resolveModel("scout", { model: "anthropic/claude-sonnet" }, agentsDir);
    expect(result).toBe("anthropic/claude-sonnet");
  });

  it("returns agent definition model when args.model is absent", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout", { model: "minimax/MiniMax-M2.7" });

    const result = resolveModel("scout", {}, agentsDir);
    expect(result).toBe("minimax/MiniMax-M2.7");
  });

  it("returns undefined when neither args.model nor definition model", () => {
    const agentsDir = makeAgentsDir();
    writeAgentDef(agentsDir, "scout"); // no model

    const result = resolveModel("scout", {}, agentsDir);
    expect(result).toBeUndefined();
  });

  it("returns undefined when agent definition file does not exist", () => {
    const agentsDir = makeAgentsDir();

    const result = resolveModel("nonexistent", {}, agentsDir);
    expect(result).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// formatCallHeader — pure function tests
// ═══════════════════════════════════════════════════════════════════════════

describe("formatCallHeader", () => {

  function themeStub() {
    return {
      bold: (t: string) => `BOLD(${t})`,
      fg: (_c: string, t: string) => `FG(${t})`,
    };
  }

  it("renders agent type in bold and model in muted", () => {
    const result = formatCallHeader("scout", "minimax/MiniMax-M2.7", true, themeStub());
    const lines = result.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("BOLD(scout)  FG(minimax/MiniMax-M2.7)");
    expect(lines[1]).toBe("FG(running...)");
  });

  it("renders agent type without model when model is undefined", () => {
    const result = formatCallHeader("scout", undefined, true, themeStub());
    const lines = result.split("\n");
    expect(lines[0]).toBe("BOLD(scout)");
  });

  it("renders pending... when not started", () => {
    const result = formatCallHeader("scout", undefined, false, themeStub());
    const lines = result.split("\n");
    expect(lines[1]).toBe("FG(pending...)");
  });

  it("renders running... when started", () => {
    const result = formatCallHeader("scout", undefined, true, themeStub());
    const lines = result.split("\n");
    expect(lines[1]).toBe("FG(running...)");
  });
});
