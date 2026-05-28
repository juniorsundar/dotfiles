import { describe, it, expect, afterEach } from "vitest";
import { spawn, execFileSync } from "child_process";
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, symlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const BASH_PATH = execFileSync("bash", ["-lc", "command -v bash"], { encoding: "utf-8" }).trim();

function makeTaskDir() {
  return mkdtempSync(join(tmpdir(), "stream-filter-test-"));
}

function runScript(
  taskDir: string,
  manifestPath: string,
  stdinLines: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(BASH_PATH, [join(__dirname, "stream-filter.sh"), taskDir, manifestPath], {
      stdio: ["pipe", "pipe", "pipe"],
      env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => { stdout += data.toString(); });
    child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });

    // Write stdin lines
    for (const line of stdinLines) {
      child.stdin.write(line + "\n");
    }
    child.stdin.end();
  });
}

describe("stream-filter.sh", () => {
  const taskDirs: string[] = [];

  afterEach(() => {
    for (const dir of taskDirs.splice(0)) {
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  describe("tracer bullet: agent_end happy path", () => {
    it("appends events to events.jsonl and writes output.md + run.log on agent_end", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "session" }),
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({ type: "message_start", message: { role: "user", content: [{ type: "text", text: "hello" }] } }),
        JSON.stringify({ type: "message_end", message: { role: "user", content: [{ type: "text", text: "hello" }] } }),
        JSON.stringify({
          type: "agent_end",
          messages: [
            { role: "user", content: [{ type: "text", text: "hello" }] },
            { role: "assistant", content: [{ type: "text", text: "Hi there!" }] },
          ],
          willRetry: false,
        }),
      ];

      const { stdout, stderr, exitCode } = await runScript(taskDir, manifestPath, events);

      // Check events.jsonl
      const eventsJsonl = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
      const recordedLines = eventsJsonl.trim().split("\n");
      expect(recordedLines).toHaveLength(5);
      expect(recordedLines[0]).toBe(events[0]);

      // Check output.md
      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd.trim()).toBe("Hi there!");

      // Check run.log
      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("completed");

      // Check exit code
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
    });
  });

  describe("progress events", () => {
    it("creates progress.jsonl with lifecycle start and completion events", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressPath = join(taskDir, "progress.jsonl");
      expect(existsSync(progressPath)).toBe(true);

      const progressEvents = readFileSync(progressPath, "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      const lifecycleEvents = progressEvents.filter((event) => event.type === "lifecycle");
      expect(lifecycleEvents).toEqual([
        expect.objectContaining({ type: "lifecycle", status: "started" }),
        expect.objectContaining({ type: "lifecycle", status: "completed" }),
      ]);
      for (const progressEvent of progressEvents) {
        expect(typeof progressEvent.text).toBe("string");
        expect(progressEvent.text.length).toBeGreaterThan(0);
        expect(Number.isNaN(Date.parse(progressEvent.timestamp))).toBe(false);
      }
    });

    it("appends a tool started progress event", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_123", toolName: "bash", args: { command: "ls -la /tmp" } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(progressEvents).toContainEqual(expect.objectContaining({
        type: "tool",
        status: "started",
        text: expect.stringContaining("[bash]"),
      }));
      const toolEvent = progressEvents.find((event) => event.type === "tool" && event.status === "started");
      expect(toolEvent.text).toContain("ls -la");
      expect(Number.isNaN(Date.parse(toolEvent.timestamp))).toBe(false);
    });

    it("appends a tool succeeded progress event", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_123", toolName: "bash", result: { content: [{ type: "text", text: "ok" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(progressEvents).toContainEqual(expect.objectContaining({
        type: "tool",
        status: "succeeded",
        text: expect.stringContaining("bash"),
      }));
      const toolEvent = progressEvents.find((event) => event.type === "tool" && event.status === "succeeded");
      expect(Number.isNaN(Date.parse(toolEvent.timestamp))).toBe(false);
    });

    it("appends a tool failed progress event", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_456", toolName: "bash", result: { isError: true, content: [{ type: "text", text: "command not found" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(progressEvents).toContainEqual(expect.objectContaining({
        type: "tool",
        status: "failed",
        text: expect.stringContaining("bash"),
      }));
      const toolEvent = progressEvents.find((event) => event.type === "tool" && event.status === "failed");
      expect(Number.isNaN(Date.parse(toolEvent.timestamp))).toBe(false);
    });

    it("appends assistant text progress as readable chunks", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const textDelta = (delta: string) => JSON.stringify({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta },
      });

      const events = [
        textDelta("Hello "),
        textDelta("world. "),
        textDelta("Still drafting"),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const assistantEvents = progressEvents.filter((event) => event.type === "assistant_text");

      expect(assistantEvents).toEqual([
        expect.objectContaining({ text: "Hello world." }),
      ]);
      expect(progressEvents).not.toContainEqual(expect.objectContaining({ text: "Hello " }));
      expect(progressEvents).not.toContainEqual(expect.objectContaining({ text: "Still drafting" }));
      expect(Number.isNaN(Date.parse(assistantEvents[0].timestamp))).toBe(false);
    });

    it("appends a terminal completed progress event on agent_end", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(progressEvents).toContainEqual(expect.objectContaining({
        type: "terminal",
        status: "completed",
        text: expect.stringContaining("completed"),
      }));
      const terminalEvent = progressEvents.find((event) => event.type === "terminal" && event.status === "completed");
      expect(Number.isNaN(Date.parse(terminalEvent.timestamp))).toBe(false);
    });

    it("preserves partial progress and appends a terminal failed event when agent_end is missing", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_123", toolName: "bash", args: { command: "ls" } }),
        JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Partial answer." }] } }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(1);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));

      expect(progressEvents).toContainEqual(expect.objectContaining({ type: "tool", status: "started" }));
      expect(progressEvents).toContainEqual(expect.objectContaining({
        type: "terminal",
        status: "failed",
        text: expect.stringContaining("missing agent_end"),
      }));
    });

    it("continues progress production after malformed JSON", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "agent_start" }),
        "this is not valid json",
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_123", toolName: "bash", args: { command: "pwd" } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      const progressEvents = readFileSync(join(taskDir, "progress.jsonl"), "utf-8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      expect(progressEvents).toContainEqual(expect.objectContaining({ type: "lifecycle", status: "started" }));
      expect(progressEvents).toContainEqual(expect.objectContaining({ type: "tool", status: "started" }));
      expect(progressEvents).toContainEqual(expect.objectContaining({ type: "terminal", status: "completed" }));

      const eventsJsonl = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
      expect(eventsJsonl).not.toContain("this is not valid json");
      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("warning: skipping malformed JSON line");
    });

    it("fails fast when the task directory is missing", async () => {
      const taskDir = makeTaskDir();
      rmSync(taskDir, { recursive: true, force: true });

      const { stderr, exitCode } = await runScript(taskDir, join(taskDir, "manifest.json"), []);

      expect(exitCode).toBe(1);
      expect(stderr).toContain(`task dir missing: ${taskDir}`);
    });

    it("keeps pane view, raw event stream, and final output stable while writing progress", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Scanning codebase. " } }),
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Found relevant files." } }),
        JSON.stringify({ type: "tool_call", toolCallId: "call_1", toolName: "read", args: { path: "/tmp/test.txt" } }),
        JSON.stringify({ type: "tool_result", toolCallId: "call_1", toolName: "read", result: { content: [{ type: "text", text: "file contents" }] } }),
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_2", toolName: "bash", args: { command: "ls -la" } }),
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_2", toolName: "bash", result: { isError: true, content: [{ type: "text", text: "failed" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "Final answer." }] }], willRetry: false }),
      ];

      const { stdout, exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(0);
      expect(stdout).toBe([
        "Scanning codebase.",
        "Found relevant files.",
        "[read] {\"path\":\"/tmp/test.txt\"}",
        "  ✓ read",
        "[bash] {\"command\":\"ls -la\"}",
        "  ✗ bash",
        "",
      ].join("\n"));
      expect(readFileSync(join(taskDir, "events.jsonl"), "utf-8").trim().split("\n")).toEqual(events);
      expect(readFileSync(join(taskDir, "output.md"), "utf-8").trim()).toBe("Final answer.");
      expect(existsSync(join(taskDir, "progress.jsonl"))).toBe(true);
    });
  });

  describe("tool_execution_start rendering", () => {
    it("renders tool name and truncated args to stdout", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_123", toolName: "bash", args: { command: "ls -la /tmp" } }),
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_123", toolName: "bash", result: { content: [{ type: "text", text: "file1\nfile2" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      // Should contain tool name
      expect(stdout).toContain("bash");
      // Should contain truncated args
      expect(stdout).toContain("ls -la");
    });
  });

  describe("tool_execution_end rendering", () => {
    it("renders success indicator for successful tool results", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_123", toolName: "bash", result: { content: [{ type: "text", text: "ok" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      expect(stdout).toContain("✓");
    });

    it("renders failure indicator for failed tool results", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_456", toolName: "bash", result: { isError: true, content: [{ type: "text", text: "command not found" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      expect(stdout).toContain("✗");
    });
  });

  describe("text_delta buffering", () => {
    it("buffers text_delta and renders completed sentences to stdout", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const textDelta = (delta: string) => JSON.stringify({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta },
      });

      const events = [
        textDelta("Hello world. "),
        textDelta("This is a "),
        textDelta("test. "),
        textDelta("More text without ending"),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      // Complete sentences should appear
      expect(stdout).toContain("Hello world.");
      expect(stdout).toContain("This is a test.");
      // Incomplete sentence should NOT appear
      expect(stdout).not.toContain("More text without ending");
    });

    it("renders sentences ending with ! and ?", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const textDelta = (delta: string) => JSON.stringify({
        type: "message_update",
        assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta },
      });

      const events = [
        textDelta("Wow! "),
        textDelta("Really? "),
        textDelta("Okay."),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      expect(stdout).toContain("Wow!");
      expect(stdout).toContain("Really?");
      expect(stdout).toContain("Okay.");
    });
  });

  describe("thinking_delta suppression", () => {
    it("does not render thinking_delta to stdout", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "secret reasoning" } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);

      expect(stdout).not.toContain("secret reasoning");
      expect(stdout).not.toContain("thinking");
    });
  });

  describe("message_end text extraction", () => {
    it("extracts assistant text from message_end for output.md", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "message_start", message: { role: "assistant", content: [] } }),
        JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Hello world." }, { type: "thinking", thinking: "internal" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "Hello world." }] }], willRetry: false }),
      ];

      await runScript(taskDir, manifestPath, events);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd.trim()).toBe("Hello world.");
    });

    it("extracts assistant text from message_end without jq in PATH", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const binDir = makeTaskDir();
      taskDirs.push(binDir);
      mkdirSync(binDir, { recursive: true });
      const pythonPath = execFileSync("bash", ["-lc", "command -v python3"], { encoding: "utf-8" }).trim();
      const datePath = execFileSync("bash", ["-lc", "command -v date"], { encoding: "utf-8" }).trim();
      symlinkSync(pythonPath, join(binDir, "python3"));
      symlinkSync(datePath, join(binDir, "date"));

      const events = [
        JSON.stringify({ type: "message_start", message: { role: "assistant", content: [] } }),
        JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Hello from message_end." }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events, { ...process.env, PATH: binDir });

      expect(exitCode).toBe(0);
      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd.trim()).toBe("Hello from message_end.");
    });
  });

  describe("tool_call/tool_result aliases", () => {
    it("handles tool_call as alias for tool_execution_start", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_call", toolCallId: "call_1", toolName: "read", args: { path: "/tmp/test" } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);
      expect(stdout).toContain("read");
      expect(stdout).toContain("/tmp/test");
    });

    it("handles tool_result as alias for tool_execution_end", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "tool_result", toolCallId: "call_1", toolName: "read", result: { content: [{ type: "text", text: "content" }] } }),
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stdout } = await runScript(taskDir, manifestPath, events);
      expect(stdout).toContain("✓");
      expect(stdout).toContain("read");
    });
  });

  describe("malformed JSON handling", () => {
    it("skips malformed JSON with warning to run.log and continues processing", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "session" }),
        "this is not valid json",
        "{also bad",
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      // Should not crash
      expect(exitCode).toBe(0);

      // events.jsonl should still contain valid events only
      const eventsJsonl = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
      const lines = eventsJsonl.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(2); // only valid JSON lines

      // run.log should contain warnings
      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("warning: skipping malformed JSON line");
    });
  });

  describe("missing agent_end handling", () => {
    it("writes partial output with error prefix when agent_end is missing", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      // Simulate a stream where agent_end is never received
      const messageEndPreamble = JSON.stringify({
        type: "message_end",
        message: { role: "assistant", content: [{ type: "text", text: "Partial output text that was captured before crash." }] },
      });
      const events = [
        JSON.stringify({ type: "session" }),
        JSON.stringify({ type: "turn_start" }),
        messageEndPreamble,
        JSON.stringify({ type: "tool_execution_end", toolCallId: "call_x", toolName: "bash", result: { content: [{ type: "text", text: "ok" }] } }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);

      expect(exitCode).toBe(1);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("[ERROR]");
      expect(outputMd).toContain("Partial output text that was captured before crash.");

      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("error: missing agent_end");
    });

    it("handles empty stdin (no events at all)", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const { exitCode } = await runScript(taskDir, manifestPath, []);

      expect(exitCode).toBe(1);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd.trim()).toContain("[ERROR]");
    });
  });

  describe("run.log warnings", () => {
    it("records malformed JSON warnings without writing to stderr", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      // The script reads from stdin (simulating piped pi stdout).
      // To test stderr capture, we need to verify the script passes stderr through.
      // The script itself doesn't generate stderr — it inherits from pi.
      // This is validated by checking that the script's own stderr is empty during happy path.
      // For the acceptance criteria: the script is piped like:
      //   pi --mode json 2>"$LOG_FILE" | stream-filter.sh
      // The stderr capture is done by the shell redirect, not the script itself.
      // The script's responsibility is to write its own errors to run.log.
      // We verify this via the malformed JSON test (warnings written to run.log).
      
      // Verify that the script writes error messages to run.log
      const events = [
        "not json",
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { stderr } = await runScript(taskDir, manifestPath, events);
      
      // Script shouldn't emit to its own stderr
      expect(stderr).toBe("");
      
      // But warnings should go to run.log
      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("warning: skipping malformed JSON line");
    });
  });

  describe("exit code propagation", () => {
    it("exits 0 on successful agent_end", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const events = [
        JSON.stringify({ type: "agent_end", messages: [{ role: "user", content: [] }, { role: "assistant", content: [{ type: "text", text: "done" }] }], willRetry: false }),
      ];

      const { exitCode } = await runScript(taskDir, manifestPath, events);
      expect(exitCode).toBe(0);
    });

    it("exits nonzero on missing agent_end", async () => {
      const taskDir = makeTaskDir();
      taskDirs.push(taskDir);

      const manifestPath = join(taskDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test task" }));

      const { exitCode } = await runScript(taskDir, manifestPath, []);
      expect(exitCode).toBe(1);
    });
  });
});
