import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { spawnSubagent } from "./spawner";
import subagentEntryPoint from "./index";

// ── Mock @earendil-works/pi-tui ──

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

// ── Test helpers ──

let cleanups: (() => void)[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "e2e-error-"));
  mkdirSync(join(dir, ".pi"), { recursive: true });
  cleanups.push(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });
  return dir;
}

function makeAgentsDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "e2e-agents-"));
  cleanups.push(() => {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  });
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

function writeFakePi(dir: string, content: string): string {
  const path = join(dir, "fake-pi.sh");
  writeFileSync(path, content, "utf-8");
  chmodSync(path, 0o755);
  return path;
}

/** Extract the registered tool definition from a mock extension API. */
function extractToolDef(pi: ReturnType<typeof mockExtensionAPI>) {
  return pi.registerTool.mock.calls[0][0];
}

function mockExtensionAPI() {
  return {
    registerTool: vi.fn(),
    on: vi.fn(),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const cleanup of cleanups.splice(0)) {
    cleanup();
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// Error Path E2E Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("error path E2E", () => {
  // ── Slice 1: Tracer Bullet — Timeout ──

  it("timeout: spawnSubagent + renderResult full pipeline", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 1 });

    // Fake pi emits NDJSON events including usage, then blocks longer than timeout
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"read","args":{"file":"test.ts"}}
{"type":"tool_execution_end","toolName":"read","result":{}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Partial output."}],"usage":{"input":1500,"output":200,"cacheRead":100,"cacheWrite":0}}}
NDJSON
# Block — will be killed by timeout
exec tail -f /dev/null
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "timeout E2E",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-timeout-e2e",
    });

    // ── SpawnSubagentResult assertions ──

    expect(result.agentId).toBe("scout-timeout-e2e");
    expect(result.agentType).toBe("scout");

    // Output is timeout error
    expect(result.output).toContain("timed out");

    // Duration is set (wall clock from spawn to kill)
    expect(result.duration).toBeGreaterThan(0);

    // Usage captured from message_end events before timeout
    expect(result.usage).toBeDefined();
    expect(result.usage!.input).toBe(1500);
    expect(result.usage!.output).toBe(200);

    // Activity feed accumulated before timeout
    expect(result.activityFeed).toBeDefined();
    const feed = result.activityFeed!;
    expect(feed.expanded.lines.length).toBeGreaterThanOrEqual(1);
    expect(feed.expanded.lines[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
    });

    // ── renderResult assertions ──

    // Register the entry point to get the toolDef with renderResult
    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    // Build the result shape that execute() would produce
    const executeResult = {
      content: [{ type: "text", text: result.output }],
      details: {
        agentId: result.agentId,
        agentType: result.agentType,
        model: result.model,
        duration: result.duration,
        usage: result.usage,
        activityFeed: result.activityFeed,
      },
    };

    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (c: string, t: string) => `FG_${c.toUpperCase()}(${t})`,
    } as any;

    // Expanded final render — should show activity feed
    const expandedContext = {
      args: { agent_type: "scout", prompt: "timeout E2E" },
      toolCallId: "tcid-timeout",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const expandedComponent = toolDef.renderResult(
      executeResult,
      { expanded: true, isPartial: false },
      theme,
      expandedContext,
    );

    const expandedLines = expandedComponent.render(80);
    const expandedRendered = expandedLines.join("\n");

    // Metadata present
    expect(expandedRendered).toContain("BOLD(scout)");
    expect(expandedRendered).toContain("FG_MUTED( (id: timeout-e2e))");
    expect(expandedRendered).toContain("FG_MUTED(duration:");
    expect(expandedRendered).toContain("FG_MUTED(tokens:");
    expect(expandedRendered).toContain("1,500 input");
    expect(expandedRendered).toContain("200 output");

    // Activity feed visible — lifecycle and tool lines
    expect(expandedRendered).toContain("Subagent started");
    expect(expandedRendered).toContain("read: test.ts");

    // Two separators: one after metadata, one between feed and output
    const separator = "FG_DIM(─────────────────────────)";
    const sepCount = expandedLines.filter((l: string) => l === separator).length;
    expect(sepCount).toBe(2);

    // Structure ordering: metadata → separator → feed → separator → output
    const metaEndIdx = expandedLines.findIndex((l: string) => l === separator);
    const feedEndIdx = expandedLines.findIndex(
      (l: string, i: number) => i > metaEndIdx && l === separator,
    );
    const outputIdx = expandedLines.findIndex((l: string) => l.includes("timed out"));
    expect(metaEndIdx).toBeGreaterThanOrEqual(0);
    expect(feedEndIdx).toBeGreaterThan(metaEndIdx);
    expect(outputIdx).toBeGreaterThan(feedEndIdx);

    // Error output visible after feed
    expect(expandedRendered).toContain("timed out");

    // Collapsed final render — should NOT show activity feed
    const collapsedContext = {
      args: { agent_type: "scout", prompt: "timeout E2E" },
      toolCallId: "tcid-timeout-collapsed",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const collapsedComponent = toolDef.renderResult(
      executeResult,
      { expanded: false, isPartial: false },
      theme,
      collapsedContext,
    );

    const collapsedLines = collapsedComponent.render(80);
    const collapsedRendered = collapsedLines.join("\n");

    // Metadata present
    expect(collapsedRendered).toContain("BOLD(scout)");
    expect(collapsedRendered).toContain("FG_MUTED( (id: timeout-e2e))");

    // Activity feed NOT visible
    expect(collapsedRendered).not.toContain("Subagent started");
    expect(collapsedRendered).not.toContain("read: test.ts");

    // Only one separator (metadata → output, no feed)
    const collapsedSepCount = collapsedLines.filter((l: string) => l === separator).length;
    expect(collapsedSepCount).toBe(1);

    // Error output visible
    expect(collapsedRendered).toContain("timed out");

    // LLM-facing content is error message only (no feed text)
    expect(executeResult.content[0].text).toContain("timed out");
    expect(executeResult.content[0].text).not.toContain("Subagent started");
  }, 10000);

  // ── Slice 2: Crash ──

  it("crash: spawnSubagent + renderResult full pipeline", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi emits events then exits 1 without agent_end → stream truncation
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"bash","args":{"command":"ls"}}
{"type":"tool_execution_end","toolName":"bash","result":{"stdout":"src\ntest\n"}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Partial before crash."}],"usage":{"input":800,"output":120,"cacheRead":50,"cacheWrite":0}}}
NDJSON
exit 1
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "crash E2E",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-crash-e2e",
    });

    // ── SpawnSubagentResult assertions ──

    expect(result.agentId).toBe("scout-crash-e2e");
    expect(result.agentType).toBe("scout");

    // Output contains truncation/error message
    expect(result.output).toContain("[ERROR]");

    // Duration is set
    expect(result.duration).toBeGreaterThan(0);

    // Usage captured from message_end events before crash
    expect(result.usage).toBeDefined();
    expect(result.usage!.input).toBe(800);
    expect(result.usage!.output).toBe(120);

    // Activity feed accumulated before crash
    expect(result.activityFeed).toBeDefined();
    const feed = result.activityFeed!;
    expect(feed.expanded.lines.length).toBeGreaterThanOrEqual(1);
    expect(feed.expanded.lines[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
    });
    // Tool lines present
    expect(feed.expanded.lines.some((l) => l.text.includes("bash: ls"))).toBe(true);

    // ── renderResult assertions ──

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const executeResult = {
      content: [{ type: "text", text: result.output }],
      details: {
        agentId: result.agentId,
        agentType: result.agentType,
        model: result.model,
        duration: result.duration,
        usage: result.usage,
        activityFeed: result.activityFeed,
      },
    };

    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (c: string, t: string) => `FG_${c.toUpperCase()}(${t})`,
    } as any;

    // Expanded final render — should show activity feed
    const expandedContext = {
      args: { agent_type: "scout", prompt: "crash E2E" },
      toolCallId: "tcid-crash",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const expandedComponent = toolDef.renderResult(
      executeResult,
      { expanded: true, isPartial: false },
      theme,
      expandedContext,
    );

    const expandedLines = expandedComponent.render(80);
    const expandedRendered = expandedLines.join("\n");

    // Metadata present
    expect(expandedRendered).toContain("BOLD(scout)");
    expect(expandedRendered).toContain("FG_MUTED( (id: crash-e2e))");

    // Activity feed visible
    expect(expandedRendered).toContain("Subagent started");
    expect(expandedRendered).toContain("bash: ls");

    // Two separators
    const separator = "FG_DIM(─────────────────────────)";
    expect(expandedLines.filter((l: string) => l === separator).length).toBe(2);

    // Error output visible
    expect(expandedRendered).toContain("[ERROR]");

    // Collapsed final render — should NOT show activity feed
    const collapsedContext = {
      args: { agent_type: "scout", prompt: "crash E2E" },
      toolCallId: "tcid-crash-collapsed",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const collapsedComponent = toolDef.renderResult(
      executeResult,
      { expanded: false, isPartial: false },
      theme,
      collapsedContext,
    );

    const collapsedLines = collapsedComponent.render(80);
    const collapsedRendered = collapsedLines.join("\n");

    // Metadata present
    expect(collapsedRendered).toContain("BOLD(scout)");

    // Activity feed NOT visible
    expect(collapsedRendered).not.toContain("Subagent started");
    expect(collapsedRendered).not.toContain("bash: ls");

    // One separator only
    expect(collapsedLines.filter((l: string) => l === separator).length).toBe(1);

    // Error output visible
    expect(collapsedRendered).toContain("[ERROR]");

    // LLM-facing content is error only
    expect(executeResult.content[0].text).toContain("[ERROR]");
    expect(executeResult.content[0].text).not.toContain("Subagent started");
    expect(executeResult.content[0].text).not.toContain("bash: ls");
  }, 10000);

  // ── Slice 3: Cancellation ──

  it("cancellation: spawnSubagent + renderResult full pipeline", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout", { timeout: 10 });

    // Fake pi emits events then blocks until killed
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
cat << 'NDJSON'
{"type":"agent_start"}
{"type":"tool_execution_start","toolName":"grep","args":{"pattern":"TODO"}}
{"type":"tool_execution_end","toolName":"grep","result":{"stdout":"line 42\n"}}
{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Found TODOs."}],"usage":{"input":600,"output":90,"cacheRead":30,"cacheWrite":0}}}
NDJSON
# Block until killed by cancellation signal
exec tail -f /dev/null
`,
    );

    const controller = new AbortController();

    const abortTimer = setTimeout(() => {
      controller.abort();
    }, 300);

    const result = await spawnSubagent({
      agentType: "scout",
      task: "cancellation E2E",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-cancel-e2e",
      signal: controller.signal,
    });

    clearTimeout(abortTimer);

    // ── SpawnSubagentResult assertions ──

    expect(result.agentId).toBe("scout-cancel-e2e");
    expect(result.agentType).toBe("scout");

    // Output contains truncation error (killed mid-stream, no agent_end)
    expect(result.output).toContain("[ERROR]");

    // Duration is set
    expect(result.duration).toBeGreaterThan(0);

    // Usage captured from message_end events before cancellation
    expect(result.usage).toBeDefined();
    expect(result.usage!.input).toBe(600);
    expect(result.usage!.output).toBe(90);

    // Activity feed accumulated before cancellation
    expect(result.activityFeed).toBeDefined();
    const feed = result.activityFeed!;
    expect(feed.expanded.lines.length).toBeGreaterThanOrEqual(1);
    expect(feed.expanded.lines[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
    });
    expect(feed.expanded.lines.some((l) => l.text.includes("grep: TODO"))).toBe(true);

    // ── renderResult assertions ──

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const executeResult = {
      content: [{ type: "text", text: result.output }],
      details: {
        agentId: result.agentId,
        agentType: result.agentType,
        model: result.model,
        duration: result.duration,
        usage: result.usage,
        activityFeed: result.activityFeed,
      },
    };

    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (c: string, t: string) => `FG_${c.toUpperCase()}(${t})`,
    } as any;

    // Expanded final render — should show activity feed
    const expandedContext = {
      args: { agent_type: "scout", prompt: "cancellation E2E" },
      toolCallId: "tcid-cancel",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const expandedComponent = toolDef.renderResult(
      executeResult,
      { expanded: true, isPartial: false },
      theme,
      expandedContext,
    );

    const expandedLines = expandedComponent.render(80);
    const expandedRendered = expandedLines.join("\n");

    // Metadata present
    expect(expandedRendered).toContain("BOLD(scout)");
    expect(expandedRendered).toContain("FG_MUTED( (id: cancel-e2e))");

    // Activity feed visible
    expect(expandedRendered).toContain("Subagent started");
    expect(expandedRendered).toContain("grep: TODO");

    // Two separators
    const separator = "FG_DIM(─────────────────────────)";
    expect(expandedLines.filter((l: string) => l === separator).length).toBe(2);

    // Error output visible
    expect(expandedRendered).toContain("[ERROR]");

    // Collapsed final render — should NOT show activity feed
    const collapsedContext = {
      args: { agent_type: "scout", prompt: "cancellation E2E" },
      toolCallId: "tcid-cancel-collapsed",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const collapsedComponent = toolDef.renderResult(
      executeResult,
      { expanded: false, isPartial: false },
      theme,
      collapsedContext,
    );

    const collapsedLines = collapsedComponent.render(80);
    const collapsedRendered = collapsedLines.join("\n");

    // Metadata present
    expect(collapsedRendered).toContain("BOLD(scout)");

    // Activity feed NOT visible
    expect(collapsedRendered).not.toContain("Subagent started");
    expect(collapsedRendered).not.toContain("grep: TODO");

    // One separator only
    expect(collapsedLines.filter((l: string) => l === separator).length).toBe(1);

    // Error output visible
    expect(collapsedRendered).toContain("[ERROR]");

    // LLM-facing content is error only
    expect(executeResult.content[0].text).toContain("[ERROR]");
    expect(executeResult.content[0].text).not.toContain("Subagent started");
    expect(executeResult.content[0].text).not.toContain("grep: TODO");
  }, 10000);

  // ── Slice 4: Early crash (no feed) graceful degradation ──

  it("early crash: spawnSubagent + renderResult with no activity feed", async () => {
    const workDir = makeWorkDir();
    const agentsDir = makeAgentsDir();

    writeAgentDef(agentsDir, "scout");

    // Fake pi exits immediately without emitting any NDJSON events
    const piPath = writeFakePi(
      workDir,
      `#!/usr/bin/env bash
exit 1
`,
    );

    const result = await spawnSubagent({
      agentType: "scout",
      task: "early crash",
      agentsDir,
      workDir,
      piPath,
      generateId: () => "scout-early-crash",
    });

    // ── SpawnSubagentResult assertions ──

    expect(result.agentId).toBe("scout-early-crash");

    // No events emitted, so no usage, no activity feed
    expect(result.usage).toBeUndefined();
    expect(result.activityFeed).toBeUndefined();

    // Output is error
    expect(result.output).toContain("[ERROR]");

    // ── renderResult graceful degradation ──

    const pi = mockExtensionAPI();
    subagentEntryPoint(pi as any, { agentsDir });
    const toolDef = extractToolDef(pi);

    const executeResult = {
      content: [{ type: "text", text: result.output }],
      details: {
        agentId: result.agentId,
        agentType: result.agentType,
        model: result.model,
        duration: result.duration,
        usage: result.usage,
        // No activityFeed — graceful degradation
      },
    };

    const theme = {
      bold: (t: string) => `BOLD(${t})`,
      fg: (c: string, t: string) => `FG_${c.toUpperCase()}(${t})`,
    } as any;

    // Expanded final render — no feed, should show metadata + output
    const expandedContext = {
      args: { agent_type: "scout", prompt: "early crash" },
      toolCallId: "tcid-early",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const expandedComponent = toolDef.renderResult(
      executeResult,
      { expanded: true, isPartial: false },
      theme,
      expandedContext,
    );

    const expandedLines = expandedComponent.render(80);
    const expandedRendered = expandedLines.join("\n");

    // Metadata present
    expect(expandedRendered).toContain("BOLD(scout)");
    expect(expandedRendered).toContain("FG_MUTED( (id: early-crash))");

    // No activity feed text (nothing was emitted)
    expect(expandedRendered).not.toContain("Subagent started");

    // One separator (metadata → output, no feed)
    const separator = "FG_DIM(─────────────────────────)";
    expect(expandedLines.filter((l: string) => l === separator).length).toBe(1);

    // Error output visible
    expect(expandedRendered).toContain("[ERROR]");

    // Collapsed final render
    const collapsedContext = {
      args: { agent_type: "scout", prompt: "early crash" },
      toolCallId: "tcid-early-collapsed",
      invalidate: vi.fn(),
      lastComponent: undefined,
      state: {},
      cwd: workDir,
      executionStarted: true,
      argsComplete: true,
      isPartial: false,
      expanded: false,
      showImages: false,
      isError: false,
    } as any;

    const collapsedComponent = toolDef.renderResult(
      executeResult,
      { expanded: false, isPartial: false },
      theme,
      collapsedContext,
    );

    const collapsedLines = collapsedComponent.render(80);
    const collapsedRendered = collapsedLines.join("\n");

    // Metadata present
    expect(collapsedRendered).toContain("BOLD(scout)");

    // No feed text
    expect(collapsedRendered).not.toContain("Subagent started");

    // One separator
    expect(collapsedLines.filter((l: string) => l === separator).length).toBe(1);

    // Error output visible
    expect(collapsedRendered).toContain("[ERROR]");

    // LLM-facing content is error only
    expect(executeResult.content[0].text).toContain("[ERROR]");
  }, 10000);
});
