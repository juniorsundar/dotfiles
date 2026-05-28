import { describe, it, expect, afterEach } from "vitest";
import { spawn, execSync } from "child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const WRAPPER = resolve(__dirname, "subagent-wrapper.sh");
const TMUX_MANAGER = resolve(__dirname, "tmux-manager.sh");

function makeWorkDir() {
  return mkdtempSync(join(tmpdir(), "subagent-wrapper-test-"));
}

function runWrapper(
  taskDir: string,
  manifestPath: string,
  opts?: { cwd?: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((res, rej) => {
    const child = spawn("bash", [WRAPPER, taskDir, manifestPath], {
      cwd: opts?.cwd ?? taskDir,
      env: opts?.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("error", rej);
    child.on("close", (code) => res({ stdout, stderr, exitCode: code }));
    child.stdin.end();
  });
}

/** Kill the tmux server, ignoring errors. */
function killServer(workDir: string) {
  try {
    execSync(`tmux -S "${join(workDir, ".pi", "subagents.sock")}" kill-server`, { stdio: "pipe" });
  } catch {}
}

function listPaneTitles(workDir: string): string {
  try {
    return execSync(
      `tmux -S "${join(workDir, ".pi", "subagents.sock")}" list-panes -t subagents -F "#{pane_title}"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  } catch {
    return "";
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for condition");
}

describe("subagent-wrapper.sh", () => {
  const workDirs: string[] = [];

  afterEach(() => {
    for (const dir of workDirs.splice(0)) {
      try { killServer(dir); } catch {}
      try { rmSync(dir, { recursive: true, force: true }); } catch {}
    }
  });

  // ── Tracer Bullet: Happy path ──

  describe("tracer bullet: happy path", () => {
    it("[1.1] reads manifest, runs pi via tmux+stream-filter, exits 0", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      // Create task directory
      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      // Create a fake pi script that emits agent_end events and exits 0
      const fakePi = join(workDir, "fake-pi.sh");
      const fakePiContent = `#!/usr/bin/env bash
echo '{"type":"session"}'
echo '{"type":"agent_start"}'
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Hello from subagent."}]}}'
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"Hello from subagent."}]}],"willRetry":false}'
exit 0
`;
      writeFileSync(fakePi, fakePiContent);
      chmodSync(fakePi, 0o755);

      // Create manifest
      const manifestPath = join(workDir, "manifest.json");
      const manifest = {
        taskDir,
        agentId: "scout-0001",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      };
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const { stdout, stderr, exitCode } = await runWrapper(taskDir, manifestPath, {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);

      // output.md should contain the subagent text
      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd.trim()).toBe("Hello from subagent.");

      // events.jsonl should exist with valid JSON
      const eventsJsonl = readFileSync(join(taskDir, "events.jsonl"), "utf-8");
      expect(eventsJsonl.trim().split("\n").length).toBeGreaterThanOrEqual(2);

      // run.log should exist
      const runLog = readFileSync(join(taskDir, "run.log"), "utf-8");
      expect(runLog).toContain("completed");
    });

    it("[1.2] manifest env vars are passed to pi command", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      // Create a fake pi that echoes a custom env var to verify it was set
      const fakePi = join(workDir, "fake-pi.sh");
      const fakePiContent = `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"ENV_VAR='$CUSTOM_ENV'"}]}],"willRetry":false}'
exit 0
`;
      writeFileSync(fakePi, fakePiContent);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      const manifest = {
        taskDir,
        agentId: "scout-0002",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1", CUSTOM_ENV: "hello-world" },
      };
      writeFileSync(manifestPath, JSON.stringify(manifest));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });
      expect(exitCode).toBe(0);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("ENV_VAR=hello-world");
    });

    it("[1.3] command args with embedded newlines are preserved as one argv entry", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.py");
      writeFileSync(fakePi, `#!/usr/bin/env python3
import json
import sys
args = sys.argv[1:]
text = f"argc={len(args)} arg1={args[0] if args else ''!r}"
event = {
    "type": "agent_end",
    "messages": [
        {"role": "user", "content": []},
        {"role": "assistant", "content": [{"type": "text", "text": text}]},
    ],
    "willRetry": False,
}
print(json.dumps(event))
`);
      chmodSync(fakePi, 0o755);

      const newlineArg = "line1\nline2";
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "scout-newline",
        command: ["python3", fakePi, newlineArg],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });
      expect(exitCode).toBe(0);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("argc=1");
      expect(outputMd).toContain("line1\\nline2");
    });
  });

  // ── Slice 2: Exit code propagation ──

  describe("exit code propagation", () => {
    it("[2.1] pi exits 0 → wrapper exits 0", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"ok"}]}],"willRetry":false}'
exit 0
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "test-0001",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });
      expect(exitCode).toBe(0);
    });

    it("[2.2] pi exits non-zero → wrapper exits with same code", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"partial output"}]}],"willRetry":false}'
exit 2
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "test-0002",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });

      // Wrapper should propagate pi's exit code
      expect(exitCode).toBe(2);

      // output.md should still contain the partial output from agent_end
      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("partial output");
    });
  });

  // ── Slice 3: Nonzero exit error output ──

  describe("nonzero exit error output", () => {
    it("[3.1] pi exits non-zero without agent_end → output.md contains an error message", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"session"}'
echo '{"type":"message_end","message":{"role":"assistant","content":[{"type":"text","text":"Partial text before crash."}]}}'
exit 7
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "test-0003",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });

      expect(exitCode).toBe(7);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("[ERROR]");
      expect(outputMd).toContain("Partial text before crash.");
    });
  });

  // ── Slice 4: Missing output.md after pi exits ──

  describe("missing output.md fallback", () => {
    it("[4.1] pi exits 0 but output.md is missing → wrapper writes error and exits nonzero", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"This output is deleted."}]}],"willRetry":false}'
# Simulate the stream filter failing to leave output.md behind after handling agent_end.
sleep 0.2
rm -f "$TEST_TASK_DIR/output.md"
exit 0
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "test-0004",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1", TEST_TASK_DIR: taskDir },
      }));

      const { exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir });

      expect(exitCode).toBe(1);

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("[ERROR]");
      expect(outputMd).toContain("no output.md");
    });
  });

  // ── Slice 5: Pane cleanup on error/termination ──

  describe("pane cleanup", () => {
    async function runAndSignal(signal: NodeJS.Signals, expectedCode: number, agentId: string) {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
sleep 30
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId,
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const child = spawn("bash", [WRAPPER, taskDir, manifestPath], {
        cwd: workDir,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      await waitUntil(() => listPaneTitles(workDir).includes(agentId));

      child.kill(signal);
      const exitCode = await new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code));
      });

      expect(exitCode).toBe(expectedCode);
      await waitUntil(() => !listPaneTitles(workDir).includes(agentId));
    }

    it("[5.1] SIGTERM kills the running subagent pane", async () => {
      await runAndSignal("SIGTERM", 143, "cleanup-term");
    });

    it("[5.2] SIGINT kills the running subagent pane", async () => {
      await runAndSignal("SIGINT", 130, "cleanup-int");
    });
  });

  // ── Slice 6: Detached server when not inside tmux ──

  describe("detached server", () => {
    it("[6.1] with $TMUX unset, wrapper succeeds and logs attach hint", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"detached ok"}]}],"willRetry":false}'
exit 0
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "detached-0001",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const env = { ...process.env, TMUX: "" };
      const { stderr, exitCode } = await runWrapper(taskDir, manifestPath, { cwd: workDir, env });

      expect(exitCode).toBe(0);
      expect(stderr).toContain("attach");
      expect(stderr).toContain(join(workDir, ".pi", "subagents.sock"));

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("detached ok");
    });
  });

  // ── Slice 7: Existing tmux environment ──

  describe("inside existing tmux", () => {
    it("[7.1] with $TMUX set, wrapper succeeds and opens a visible subagent pane", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
sleep 0.5
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"inside tmux ok"}]}],"willRetry":false}'
exit 0
`);
      chmodSync(fakePi, 0o755);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "inside-0001",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const child = spawn("bash", [WRAPPER, taskDir, manifestPath], {
        cwd: workDir,
        env: { ...process.env, TMUX: "/tmp/fake-tmux,123,0" },
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stderr = "";
      child.stderr.on("data", (data: Buffer) => { stderr += data.toString(); });

      await waitUntil(() => listPaneTitles(workDir).includes("inside-0001"));

      const exitCode = await new Promise<number | null>((resolve) => {
        child.on("close", (code) => resolve(code));
      });

      expect(exitCode).toBe(0);
      expect(stderr).not.toContain("detached");

      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("inside tmux ok");
    });
  });
});
