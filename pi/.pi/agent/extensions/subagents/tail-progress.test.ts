import { describe, it, expect, vi, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, appendFileSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { tailProgress } from "./tail-progress";

// ── Test helpers ──

let workDirs: string[] = [];

function makeWorkDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tail-test-"));
  workDirs.push(dir);
  return dir;
}

function makeProgressFile(dir: string): string {
  return join(dir, "progress.jsonl");
}

afterEach(() => {
  for (const dir of workDirs.splice(0)) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
  }
});

async function waitFor(predicate: () => boolean, timeoutMs = 1000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms waiting for condition`);
    }
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

// ── Slice 1: Tracer Bullet — Tailer starts before file exists, emits event after file appears ──

describe("tailProgress — tracer bullet", () => {
  it("starts before progress.jsonl exists, emits event after file is created with valid content", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    // Create an AbortController so we can stop the tailer after the test
    const controller = new AbortController();

    // Start tailing — file does not exist yet
    const events: unknown[] = [];
    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })) {
        events.push(event);
      }
    })();

    // Wait a tick so the tailer is polling before we create the file
    await new Promise((r) => setTimeout(r, 50));

    // Write a valid progress event line
    writeFileSync(
      filePath,
      JSON.stringify({ type: "lifecycle", text: "Subagent started", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n",
      "utf-8",
    );

    // Wait for the tailer to pick it up
    await new Promise((r) => setTimeout(r, 50));

    // Abort to stop the tailer
    controller.abort();

    // Wait for the tailer to finish
    await tailerPromise;

    // Verify the event was emitted
    expect(events.length).toBe(1);
    expect(events[0]).toMatchObject({
      type: "lifecycle",
      text: "Subagent started",
      status: "started",
    });
  });
});

// ── Slice 2: Incremental reading — only new lines after last read position ──

describe("tailProgress — incremental reading", () => {
  it("yields structured tool metadata fields when present in progress.jsonl", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    writeFileSync(
      filePath,
      JSON.stringify({
        type: "tool",
        text: "bash: ls -la /tmp",
        timestamp: "2026-01-01T00:00:00Z",
        status: "started",
        toolName: "bash",
        toolArgs: { command: "ls -la /tmp" },
        toolResultPreview: "file-a file-b",
      }) + "\n",
      "utf-8",
    );

    const controller = new AbortController();
    const iterator = tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })[Symbol.asyncIterator]();
    const result = await iterator.next();

    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      type: "tool",
      text: "bash: ls -la /tmp",
      status: "started",
      toolName: "bash",
      toolArgs: { command: "ls -la /tmp" },
      toolResultPreview: "file-a file-b",
    });

    controller.abort();
  });

  it("accepts legacy progress events that omit structured tool metadata fields", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    writeFileSync(
      filePath,
      JSON.stringify({
        type: "tool",
        text: "bash completed → ok",
        timestamp: "2026-01-01T00:00:00Z",
        status: "succeeded",
      }) + "\n",
      "utf-8",
    );

    const controller = new AbortController();
    const iterator = tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })[Symbol.asyncIterator]();
    const result = await iterator.next();

    expect(result.done).toBe(false);
    expect(result.value).toMatchObject({
      type: "tool",
      text: "bash completed → ok",
      status: "succeeded",
    });
    expect(result.value?.toolName).toBeUndefined();
    expect(result.value?.toolArgs).toBeUndefined();
    expect(result.value?.toolResultPreview).toBeUndefined();

    controller.abort();
  });

  it("emits only newly appended events, not previously read content", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    // Pre-create the file with 2 events
    const line1 = JSON.stringify({ type: "lifecycle", text: "event-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n";
    const line2 = JSON.stringify({ type: "tool", text: "event-2", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" }) + "\n";
    writeFileSync(filePath, line1 + line2, "utf-8");

    const controller = new AbortController();

    // Use manual iteration so we can read in phases
    const iterator = tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })[Symbol.asyncIterator]();

    // Phase 1: read the 2 pre-written events
    const result1 = await iterator.next();
    expect(result1.done).toBe(false);
    expect(result1.value).toMatchObject({ type: "lifecycle", text: "event-1" });

    const result2 = await iterator.next();
    expect(result2.done).toBe(false);
    expect(result2.value).toMatchObject({ type: "tool", text: "event-2" });

    // Phase 2: append a 3rd event
    const line3 = JSON.stringify({ type: "assistant_text", text: "event-3", timestamp: "2026-01-01T00:00:02Z" }) + "\n";
    appendFileSync(filePath, line3, "utf-8");

    // Phase 3: should only get the new event, not re-read event-1 or event-2
    const result3 = await iterator.next();
    expect(result3.done).toBe(false);
    expect(result3.value).toMatchObject({ type: "assistant_text", text: "event-3" });

    // Cleanup
    controller.abort();
  });
});

// ── Slice 3: Partial line buffering — incomplete lines buffered until complete ──

describe("tailProgress — partial line buffering", () => {
  it("buffers a partial line and emits only after the rest arrives (no silent discard)", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    // Write a complete event first so the tailer has a baseline read position
    const line1 = JSON.stringify({ type: "lifecycle", text: "event-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n";
    writeFileSync(filePath, line1, "utf-8");

    const controller = new AbortController();

    // Collect events in the background with a very short poll interval
    const events: unknown[] = [];
    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 1 })) {
        events.push(event);
      }
    })();

    await waitFor(() => events.length === 1);
    expect(events[0]).toMatchObject({ type: "lifecycle", text: "event-1" });

    // Phase A: append only a partial line (NO trailing newline)
    const partialStart = '{"type":"tool","text":"event-2","timestamp":"2026-01-01T00:00:01Z","status":"suc';
    appendFileSync(filePath, partialStart, "utf-8");

    // The partial should be buffered, NOT emitted — events should still be [event-1].
    await new Promise((r) => setTimeout(r, 50));
    expect(events.length).toBe(1);

    // Phase B: complete the partial with the rest + newline
    appendFileSync(filePath, 'ceeded"}\n', "utf-8");

    await waitFor(() => events.length === 2);
    expect(events[1]).toMatchObject({ type: "tool", text: "event-2", status: "succeeded" });

    controller.abort();
    await tailerPromise;
  });
});

// ── Slice 4: Invalid line handling — invalid lines ignored/reported via safe diagnostic path ──

describe("tailProgress — invalid line handling", () => {
  it("silently ignores invalid JSON lines without crashing, subsequent valid events still arrive", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    const controller = new AbortController();
    const events: unknown[] = [];
    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })) {
        events.push(event);
      }
    })();

    // Start before file exists
    await new Promise((r) => setTimeout(r, 30));

    // Write a valid event, an invalid line, then another valid event
    writeFileSync(
      filePath,
      JSON.stringify({ type: "lifecycle", text: "event-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n" +
        "this is not valid json\n" +
        JSON.stringify({ type: "tool", text: "event-3", timestamp: "2026-01-01T00:00:02Z", status: "succeeded" }) + "\n",
      "utf-8",
    );

    // Wait for tailer to pick up all lines
    await new Promise((r) => setTimeout(r, 50));

    // Should have 2 valid events (invalid line silently ignored), not crashed
    expect(events.length).toBe(2);
    expect(events[0]).toMatchObject({ type: "lifecycle", text: "event-1" });
    expect(events[1]).toMatchObject({ type: "tool", text: "event-3" });

    controller.abort();
    await tailerPromise;
  });

  it("skips valid JSON lines that are missing required fields", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    const warnCalls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnCalls.push(String(msg));
    });

    const controller = new AbortController();
    const events: unknown[] = [];
    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })) {
        events.push(event);
      }
    })();

    await new Promise((r) => setTimeout(r, 30));

    writeFileSync(
      filePath,
      JSON.stringify({ type: "tool", text: "missing timestamp" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 50));

    expect(events.length).toBe(0);
    expect(warnCalls.some((m) => m.includes("missing fields"))).toBe(true);

    warnSpy.mockRestore();
    controller.abort();
    await tailerPromise;
  });

  it("warns via console.warn for invalid lines without throwing", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    // Spy on console.warn
    const warnCalls: string[] = [];
    const warnSpy = vi.spyOn(console, "warn").mockImplementation((msg) => {
      warnCalls.push(String(msg));
    });

    const controller = new AbortController();
    const events: unknown[] = [];
    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })) {
        events.push(event);
      }
    })();

    await new Promise((r) => setTimeout(r, 30));

    // Write an invalid line
    writeFileSync(filePath, "garbage line\n", "utf-8");

    await new Promise((r) => setTimeout(r, 50));

    // Invalid line should trigger a console.warn
    expect(warnCalls.length).toBeGreaterThan(0);
    expect(warnCalls.some((m) => m.includes("progress") || m.includes("invalid") || m.includes("parse"))).toBe(true);

    // No events emitted
    expect(events.length).toBe(0);

    warnSpy.mockRestore();
    controller.abort();
    await tailerPromise;
  });
});

// ── Slice 5: Cancellation — stops tailing and cleans up ──

describe("tailProgress — cancellation", () => {
  it("stops emitting events after abort and the async iterable completes cleanly", async () => {
    const workDir = makeWorkDir();
    const filePath = makeProgressFile(workDir);

    // Pre-create file with one event
    writeFileSync(
      filePath,
      JSON.stringify({ type: "lifecycle", text: "event-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n",
      "utf-8",
    );

    const controller = new AbortController();
    const events: unknown[] = [];

    const tailerPromise = (async () => {
      for await (const event of tailProgress(filePath, { signal: controller.signal, pollIntervalMs: 10 })) {
        events.push(event);
      }
    })();

    // Wait for the first event to arrive
    await new Promise((r) => setTimeout(r, 50));
    expect(events.length).toBeGreaterThanOrEqual(1);

    // Abort the tailer
    controller.abort();

    // Wait for the tailer to finish
    await tailerPromise;

    const eventCountAfterAbort = events.length;

    // Append another event — it should NOT be emitted
    appendFileSync(
      filePath,
      JSON.stringify({ type: "tool", text: "event-after-abort", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" }) + "\n",
      "utf-8",
    );

    // Wait to ensure no late events arrive
    await new Promise((r) => setTimeout(r, 50));

    // No new events after abort
    expect(events.length).toBe(eventCountAfterAbort);
  });
});

// ── Slice 6: Per-instance isolation — concurrent instances cannot mix progress ──

describe("tailProgress — per-instance isolation", () => {
  it("concurrent tailers on separate files do not mix events", async () => {
    const workDir = makeWorkDir();
    const filePathA = join(workDir, "progress-a.jsonl");
    const filePathB = join(workDir, "progress-b.jsonl");

    // Pre-create both files with one event each
    writeFileSync(
      filePathA,
      JSON.stringify({ type: "lifecycle", text: "a-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n",
      "utf-8",
    );
    writeFileSync(
      filePathB,
      JSON.stringify({ type: "lifecycle", text: "b-1", timestamp: "2026-01-01T00:00:00Z", status: "started" }) + "\n",
      "utf-8",
    );

    const controller = new AbortController();
    const eventsA: unknown[] = [];
    const eventsB: unknown[] = [];

    const tailerA = (async () => {
      for await (const event of tailProgress(filePathA, { signal: controller.signal, pollIntervalMs: 10 })) {
        eventsA.push(event);
      }
    })();

    const tailerB = (async () => {
      for await (const event of tailProgress(filePathB, { signal: controller.signal, pollIntervalMs: 10 })) {
        eventsB.push(event);
      }
    })();

    // Wait for both to pick up initial events
    await new Promise((r) => setTimeout(r, 50));
    expect(eventsA.length).toBe(1);
    expect(eventsA[0]).toMatchObject({ text: "a-1" });
    expect(eventsB.length).toBe(1);
    expect(eventsB[0]).toMatchObject({ text: "b-1" });

    // Append event to only file A
    appendFileSync(
      filePathA,
      JSON.stringify({ type: "tool", text: "a-2", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 50));

    // Tailer A gets the event, Tailer B does not
    expect(eventsA.length).toBe(2);
    expect(eventsA[1]).toMatchObject({ text: "a-2" });
    expect(eventsB.length).toBe(1); // unchanged

    // Append event to only file B
    appendFileSync(
      filePathB,
      JSON.stringify({ type: "tool", text: "b-2", timestamp: "2026-01-01T00:00:01Z", status: "succeeded" }) + "\n",
      "utf-8",
    );

    await new Promise((r) => setTimeout(r, 50));

    // Tailer B gets the event, Tailer A unchanged
    expect(eventsB.length).toBe(2);
    expect(eventsB[1]).toMatchObject({ text: "b-2" });
    expect(eventsA.length).toBe(2); // unchanged

    controller.abort();
    await Promise.all([tailerA, tailerB]);
  });
});
