#!/usr/bin/env node
/**
 * Real-workbench regression scenario for ticket 07.
 *
 * This deliberately observes the rendered Quick Open list through Electron's
 * Chrome DevTools Protocol (CDP). It does not use mocked vscode APIs or peek
 * at VS Code's internal editor-history state.
 */
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { createServer, get } from "node:http";

const root = resolve(import.meta.dirname, "..");
const codium = process.env.VSCODIUM_BIN ?? "codium";
const timeoutMs = 20_000;
if (typeof import.meta.dirname === "undefined" || typeof WebSocket === "undefined") {
  throw new Error("Ctrl+P workbench scenario requires Node.js 21.2+ (import.meta.dirname and WebSocket).");
}

const fixtureCandidates = [
  "history-containment-alpha.txt",
  "history-containment-bravo.txt",
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function requestJson(port, path) {
  return new Promise((resolve, reject) => {
    const request = get({ host: "127.0.0.1", port, path }, (response) => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
  });
}

async function eventually(description, read) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try { return await read(); } catch (error) { lastError = error; }
    await sleep(100);
  }
  throw new Error(`${description} timed out: ${lastError?.message ?? "no result"}`);
}

class Cdp {
  #socket;
  #nextId = 0;
  #pending = new Map();

  static async connect(port) {
    const target = await eventually("VSCodium workbench CDP target", async () => {
      const targets = await requestJson(port, "/json/list");
      const workbench = targets.find((candidate) => candidate.type === "page");
      assert.ok(workbench?.webSocketDebuggerUrl, "workbench CDP target is available");
      return workbench;
    });
    const cdp = new Cdp();
    cdp.#socket = new WebSocket(target.webSocketDebuggerUrl);
    cdp.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const resolve = cdp.#pending.get(message.id);
      cdp.#pending.delete(message.id);
      resolve?.(message);
    });
    await new Promise((resolve, reject) => {
      cdp.#socket.addEventListener("open", resolve, { once: true });
      cdp.#socket.addEventListener("error", reject, { once: true });
    });
    await cdp.command("Page.bringToFront");
    return cdp;
  }

  async command(method, params = {}) {
    const id = ++this.#nextId;
    const response = new Promise((resolve) => this.#pending.set(id, resolve));
    this.#socket.send(JSON.stringify({ id, method, params }));
    const message = await response;
    if (message.error) throw new Error(`${method}: ${message.error.message}`);
    return message.result;
  }

  async key(key, code, keyCode, modifiers = 0) {
    const event = { key, code, modifiers, windowsVirtualKeyCode: keyCode, nativeVirtualKeyCode: keyCode };
    await this.command("Input.dispatchKeyEvent", { type: "keyDown", ...event });
    await this.command("Input.dispatchKeyEvent", { type: "keyUp", ...event });
  }

  async insert(text) { await this.command("Input.insertText", { text }); }

  async quickOpenText() {
    const result = await this.command("Runtime.evaluate", {
      expression: "JSON.stringify([...document.querySelectorAll('.quick-input-widget')].filter((node) => node.offsetParent).map((node) => node.innerText))",
      returnByValue: true,
    });
    return JSON.parse(result.result.value);
  }

  async visibleInputPlaceholder() {
    const result = await this.command("Runtime.evaluate", {
      expression: "JSON.stringify([...document.querySelectorAll('input')].find((node) => node.offsetParent)?.placeholder ?? '')",
      returnByValue: true,
    });
    return JSON.parse(result.result.value);
  }

  async bodyText() {
    const result = await this.command("Runtime.evaluate", {
      expression: "document.body.innerText",
      returnByValue: true,
    });
    return result.result.value;
  }

  async visibleWebview() {
    const result = await this.command("Runtime.evaluate", {
      expression: "Boolean([...document.querySelectorAll('iframe')].find((node) => node.offsetParent && node.src.includes('extensionId=juniorsundar.vsconsult')))",
      returnByValue: true,
    });
    return result.result.value;
  }

  closeWorkbench() {
    this.#socket.send(JSON.stringify({ id: ++this.#nextId, method: "Browser.close" }));
  }

  async close() { this.#socket.close(); }
}

async function waitForQuickOpen(cdp, expected) {
  return eventually(`Quick Open to render ${expected}`, async () => {
    const lists = await cdp.quickOpenText();
    assert.ok(lists.some((list) => list.includes(expected)), `Quick Open currently renders ${JSON.stringify(lists)}`);
    return lists;
  });
}

async function dismissQuickOpen(cdp) {
  await cdp.key("Escape", "Escape", 27);
  await sleep(100);
}

async function invokeFilePicker(cdp) {
  await dismissQuickOpen(cdp);
  await sleep(500);
  await cdp.key("F1", "F1", 112);
  await eventually("Command Palette input", async () => {
    assert.equal(await cdp.visibleInputPlaceholder(), "Type the name of a command to run.");
  });
  await cdp.insert("vsconsult: Find File");
  await waitForQuickOpen(cdp, "vsconsult: Find File");
  await cdp.key("Enter", "Enter", 13);
  // The extension owns the WebView keyboard focus after its source resolves.
  await eventually("vsconsult picker WebView", async () => {
    assert.equal(await cdp.visibleWebview(), true, "vsconsult extension WebView is visible");
  });
  // The extension command focuses its WebView input; a short settle avoids
  // dispatching the first key before the embedded renderer receives focus.
  await sleep(500);
}

async function openCtrlP(cdp) {
  await cdp.key("p", "KeyP", 80, 2);
  return eventually("visible Ctrl+P Quick Open", async () => {
    assert.match(await cdp.visibleInputPlaceholder(), /Search files by name/);
    return cdp.quickOpenText();
  });
}

function assertContains(rendered, value, message) {
  assert.ok(rendered.includes(value), message);
}

function assertExcludes(rendered, value, message) {
  assert.ok(!rendered.includes(value), message);
}

function assertContainment(lists, accepted) {
  const rendered = lists.join("\n");
  for (const candidate of fixtureCandidates) {
    if (candidate === accepted) {
      assertContains(rendered, candidate, `accepted ${candidate} is in Ctrl+P`);
    } else {
      assertExcludes(rendered, candidate, `preview-only ${candidate} is absent from Ctrl+P`);
    }
  }
  const syntheticEntries = rendered.match(/vsconsult-preview/gi) ?? [];
  assert.ok(syntheticEntries.length <= 1, "Ctrl+P renders at most one stable synthetic preview entry");
}

async function run() {
  const base = await mkdtemp(join(tmpdir(), "vsconsult-history-"));
  const workspace = join(base, "workspace");
  const userData = join(base, "user-data");
  const extensions = join(base, "extensions");
  const port = await reservePort();
  let child;
  let cdp;
  try {
    await mkdir(workspace, { recursive: true });
    await Promise.all(fixtureCandidates.map((name) => writeFile(join(workspace, name), `${name}\n`)));
    child = spawn(codium, [
      "--new-window",
      `--user-data-dir=${userData}`,
      `--extensions-dir=${extensions}`,
      `--extensionDevelopmentPath=${root}`,
      "--disable-workspace-trust",
      `--remote-debugging-port=${port}`,
      workspace,
    ], { stdio: "ignore", detached: true });
    child.unref();
    cdp = await Cdp.connect(port);
    await eventually("VSCodium workbench to render", async () => {
      assert.match(await cdp.bodyText(), /EXPLORER/);
    });
    await invokeFilePicker(cdp);

    // Cycle both known candidates without accepting either one.
    await cdp.key("ArrowDown", "ArrowDown", 40);
    await sleep(350);
    await cdp.key("ArrowDown", "ArrowDown", 40);
    await sleep(350);
    await cdp.key("Escape", "Escape", 27);
    await sleep(250);
    let lists = await openCtrlP(cdp);
    const previewOnly = lists.join("\n");
    for (const candidate of fixtureCandidates) {
      assertExcludes(previewOnly, candidate, `preview-only ${candidate} is absent after exit`);
    }
    assert.ok((previewOnly.match(/vsconsult-preview/gi) ?? []).length <= 1, "cycling leaves at most one synthetic preview entry");

    // Run a new picker session, preview alpha, then accept it. This proves that
    // acceptance opens the real URI normally while preview-only bravo remains absent.
    await dismissQuickOpen(cdp);
    await invokeFilePicker(cdp);
    // Narrow to a single known candidate so acceptance is independent of the
    // platform's workspace-file enumeration order.
    await cdp.insert(fixtureCandidates[0]);
    await sleep(350);
    await cdp.key("ArrowDown", "ArrowDown", 40);
    await sleep(350);
    await cdp.key("Enter", "Enter", 13);
    await sleep(350);
    lists = await openCtrlP(cdp);
    assertContainment(lists, fixtureCandidates[0]);

    console.log("PASS Ctrl+P history containment in real VSCodium workbench");
  } finally {
    // Ask Electron itself to close. Killing only the CLI wrapper leaves the
    // workbench process running on VSCodium's Linux launcher.
    if (cdp) {
      try { cdp.closeWorkbench(); } catch { /* workbench already exited */ }
      await sleep(250);
      await cdp.close();
    }
    if (child?.pid) {
      try { process.kill(child.pid, "SIGTERM"); } catch { /* already exited */ }
    }
    await rm(base, { recursive: true, force: true });
  }
}

await run();
