import { describe, it, expect, afterEach, beforeAll, afterAll } from "vitest";
import { spawn, execSync } from "child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, symlinkSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";

const SCRIPT = resolve(__dirname, "tmux-manager.sh");

function makeWorkDir() {
  return mkdtempSync(join(tmpdir(), "tmux-manager-test-"));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("timed out waiting for condition");
}

function runScript(
  args: string[],
  opts: { cwd: string; env?: Record<string, string> }
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn("bash", [SCRIPT, ...args], {
      cwd: opts.cwd,
      env: opts.env ? { ...process.env, ...opts.env } : process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });
    child.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    child.on("error", reject);
    child.on("close", (exitCode) => {
      resolvePromise({ stdout, stderr, exitCode });
    });

    child.stdin.end();
  });
}

/** Kill the tmux server at the given socket path, ignoring errors if it doesn't exist. */
function killServer(socketPath: string) {
  try {
    execSync(`tmux -S "${socketPath}" kill-server`, { stdio: "pipe" });
  } catch {
    // server may not exist — that's fine
  }
}

describe("tmux-manager.sh", () => {
  const workDirs: string[] = [];

  afterEach(() => {
    for (const dir of workDirs.splice(0)) {
      try {
        const sock = join(dir, ".pi", "subagents.sock");
        killServer(sock);
      } catch {}
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  });

  // ── Phase 2: attach-hint ──

  describe("attach-hint", () => {
    it("[2.1] prints the correct tmux -S <socket-path> attach command", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      const { stdout, stderr, exitCode } = await runScript(["attach-hint"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("tmux");
      expect(stdout).toContain("attach");
      expect(stdout).toContain(join(workDir, ".pi", "subagents.sock"));
    });

    it("[2.2] doesn't require a running tmux server", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, exitCode } = await runScript(["attach-hint"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stdout).toContain("tmux");
      expect(stdout).toContain("attach");
    });
  });

  // ── Phase 1: ensure-server ──

  describe("ensure-server", () => {
    it("[1.1] creates a tmux server at $(pwd)/.pi/subagents.sock if it doesn't exist", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const socketPath = join(workDir, ".pi", "subagents.sock");
      const sockStat = statSync(socketPath);
      expect(sockStat.isSocket()).toBe(true);

      const sessions = execSync(`tmux -S "${socketPath}" list-sessions -F "#{session_name}"`, {
        encoding: "utf-8",
      }).trim();
      expect(sessions).toContain("subagents");
    });

    it("[1.2] stale socket file recovery — creates server when stale socket exists", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      const socketPath = join(workDir, ".pi", "subagents.sock");
      writeFileSync(socketPath, "");

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const sockStat = statSync(socketPath);
      expect(sockStat.isSocket()).toBe(true);

      const sessions = execSync(
        `tmux -S "${socketPath}" list-sessions -F "#{session_name}"`,
        { encoding: "utf-8" }
      ).trim();
      expect(sessions).toContain("subagents");
    });

    it("[1.4] auto-creates .pi directory if it doesn't exist", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const socketPath = join(workDir, ".pi", "subagents.sock");
      const sockStat = statSync(socketPath);
      expect(sockStat.isSocket()).toBe(true);
    });

    it("[1.5] handles spaces in working directory path", async () => {
      const workDir = makeWorkDir() + " test space dir";
      workDirs.push(workDir);
      mkdirSync(workDir, { recursive: true });

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const socketPath = join(workDir, ".pi", "subagents.sock");
      const sessions = execSync(
        `tmux -S "${socketPath}" list-sessions -F "#{session_name}"`,
        { encoding: "utf-8" }
      ).trim();
      expect(sessions).toContain("subagents");
    });

    it("[1.6] is idempotent — succeeds if the server already exists", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      await runScript(["ensure-server"], { cwd: workDir });

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
      });

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const socketPath = join(workDir, ".pi", "subagents.sock");
      const sessions = execSync(
        `tmux -S "${socketPath}" list-sessions -F "#{session_name}"`,
        { encoding: "utf-8" }
      ).trim();
      expect(sessions).toContain("subagents");
    });
  });

  // ── Phase 3: open-pane ──

  describe("open-pane", () => {
    it("[3.1] creates a new pane named with the agent-id on the subagents session", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      await runScript(["ensure-server"], { cwd: workDir });

      const socketPath = join(workDir, ".pi", "subagents.sock");

      const agentId = "scout-a3f1";
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test" }));

      const { stdout, stderr, exitCode } = await runScript(
        ["open-pane", agentId, manifestPath, "sleep 30"],
        { cwd: workDir }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      const paneId = stdout.trim();
      expect(paneId).toBeTruthy();
      expect(paneId).toMatch(/^%\d+$/);

      const panes = execSync(
        `tmux -S "${socketPath}" list-panes -t subagents -F "#{pane_id}|#{pane_title}"`,
        { encoding: "utf-8" }
      ).trim();

      const paneLines = panes.split("\n");
      expect(paneLines.length).toBeGreaterThanOrEqual(2);
      expect(panes).toContain(agentId);
    });

    it("[3.2] runs the subagent wrapper by default, passing the manifest path", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      await runScript(["ensure-server"], { cwd: workDir });

      const markerPath = join(workDir, "wrapper-args.txt");
      const fakeWrapper = join(workDir, "fake-wrapper.sh");
      writeFileSync(fakeWrapper, `#!/usr/bin/env bash
printf '%s\n' "$@" > "${markerPath}"
sleep 30
`);

      const agentId = "wrapper-default";
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ taskDir: join(workDir, "task") }));

      const { stdout, stderr, exitCode } = await runScript(
        ["open-pane", agentId, manifestPath],
        { cwd: workDir, env: { SUBAGENT_WRAPPER_PATH: fakeWrapper } }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout.trim()).toMatch(/^%\d+$/);

      await waitUntil(() => existsSync(markerPath));

      const args = readFileSync(markerPath, "utf-8").trim().split("\n");
      expect(args).toEqual([manifestPath]);
    });

    it("[3.3] default wrapper command completes from manifest taskDir", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      const taskDir = join(workDir, "task");
      mkdirSync(taskDir, { recursive: true });

      const fakePi = join(workDir, "fake-pi.sh");
      writeFileSync(fakePi, `#!/usr/bin/env bash
echo '{"type":"agent_end","messages":[{"role":"user","content":[]},{"role":"assistant","content":[{"type":"text","text":"manager default ok"}]}],"willRetry":false}'
exit 0
`);

      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({
        taskDir,
        agentId: "manager-default",
        command: ["bash", fakePi],
        env: { PI_SUBAGENT_CHILD: "1" },
      }));

      const { stderr, exitCode } = await runScript(
        ["open-pane", "manager-default", manifestPath],
        { cwd: workDir }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      await waitUntil(() => existsSync(join(taskDir, "output.md")));
      const outputMd = readFileSync(join(taskDir, "output.md"), "utf-8");
      expect(outputMd).toContain("manager default ok");
    });
  });

  // ── Phase 4: kill-pane ──

  describe("kill-pane", () => {
    it("[4.1] terminates a specific pane by pane ID", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      await runScript(["ensure-server"], { cwd: workDir });

      const socketPath = join(workDir, ".pi", "subagents.sock");
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test" }));

      // Open two panes so we can kill one and verify the other survives
      const { stdout: paneOut1 } = await runScript(
        ["open-pane", "agent-one", manifestPath, "sleep 30"],
        { cwd: workDir }
      );
      const { stdout: paneOut2 } = await runScript(
        ["open-pane", "agent-two", manifestPath, "sleep 30"],
        { cwd: workDir }
      );

      const pane1Id = paneOut1.trim();
      const pane2Id = paneOut2.trim();

      // Verify both exist before killing
      let panes = execSync(
        `tmux -S "${socketPath}" list-panes -t subagents -F "#{pane_id}"`,
        { encoding: "utf-8" }
      ).trim();
      expect(panes).toContain(pane1Id);
      expect(panes).toContain(pane2Id);

      // Kill pane1
      const { stdout, stderr, exitCode } = await runScript(
        ["kill-pane", pane1Id],
        { cwd: workDir }
      );

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");

      // Verify pane1 is gone, pane2 still exists
      panes = execSync(
        `tmux -S "${socketPath}" list-panes -t subagents -F "#{pane_id}"`,
        { encoding: "utf-8" }
      ).trim();

      expect(panes).not.toContain(pane1Id);
      expect(panes).toContain(pane2Id);
    });
  });

  // ── Phase 5: missing tmux ──

  describe("missing tmux", () => {
    // Create a test bin directory with only bash, not tmux
    let testBinDir: string;
    let NO_TMUX: Record<string, string>;

    beforeAll(() => {
      testBinDir = mkdtempSync(join(tmpdir(), "no-tmux-bin-"));
      const realBash = execSync("which bash", { encoding: "utf-8" }).trim();
      symlinkSync(realBash, join(testBinDir, "bash"));
      NO_TMUX = { PATH: testBinDir };
    });

    afterAll(() => {
      try { rmSync(testBinDir, { recursive: true, force: true }); } catch {}
    });

    it("[5.1] ensure-server prints error and exits nonzero when tmux is absent", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, stderr, exitCode } = await runScript(["ensure-server"], {
        cwd: workDir,
        env: NO_TMUX,
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("tmux is not installed");
    });

    it("[5.2] attach-hint prints error and exits nonzero when tmux is absent", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, stderr, exitCode } = await runScript(["attach-hint"], {
        cwd: workDir,
        env: NO_TMUX,
      });

      expect(exitCode).toBe(1);
      expect(stderr).toContain("tmux is not installed");
    });

    it("[5.3] open-pane prints error and exits nonzero when tmux is absent", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, stderr, exitCode } = await runScript(
        ["open-pane", "test-agent", "/tmp/manifest.json"],
        { cwd: workDir, env: NO_TMUX }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("tmux is not installed");
    });

    it("[5.4] kill-pane prints error and exits nonzero when tmux is absent", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);

      const { stdout, stderr, exitCode } = await runScript(
        ["kill-pane", "%0"],
        { cwd: workDir, env: NO_TMUX }
      );

      expect(exitCode).toBe(1);
      expect(stderr).toContain("tmux is not installed");
    });
  });

  // ── Phase 6: socket path consistency ──

  describe("socket path consistency", () => {
    it("[6.1] all operations use $(pwd)/.pi/subagents.sock consistently", async () => {
      const workDir = makeWorkDir();
      workDirs.push(workDir);
      mkdirSync(join(workDir, ".pi"), { recursive: true });

      const expectedSocket = join(workDir, ".pi", "subagents.sock");

      // attach-hint references the socket
      const hint = await runScript(["attach-hint"], { cwd: workDir });
      expect(hint.stdout).toContain(expectedSocket);

      // ensure-server creates the socket
      await runScript(["ensure-server"], { cwd: workDir });
      const sockStat = statSync(expectedSocket);
      expect(sockStat.isSocket()).toBe(true);

      // open-pane targets the same socket
      const manifestPath = join(workDir, "manifest.json");
      writeFileSync(manifestPath, JSON.stringify({ task: "test" }));
      const open = await runScript(["open-pane", "agent-check", manifestPath, "sleep 30"], { cwd: workDir });
      expect(open.exitCode).toBe(0);

      // kill-pane targets the same socket
      const paneId = open.stdout.trim();
      const kill = await runScript(["kill-pane", paneId], { cwd: workDir });
      expect(kill.exitCode).toBe(0);
    });
  });
});
