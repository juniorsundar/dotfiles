import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock vscode — the PickerHost imports vscode directly
// ---------------------------------------------------------------------------

vi.mock("vscode", () => {
  const commands = { executeCommand: vi.fn(async () => {}) };
  const window = {
    activeTextEditor: undefined as undefined,
    showTextDocument: vi.fn(async () => ({})),
    showInformationMessage: vi.fn(async () => ({})),
  };
  const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => p }),
  };
  const ViewColumn = { Active: 1, Beside: 2 };
  return { commands, window, Uri, ViewColumn, default: undefined };
});

// ---------------------------------------------------------------------------
// Imports (after mock)
// ---------------------------------------------------------------------------

import { PickerHost } from "./host.js";
import { createRegistry } from "../picker/registry.js";
import type { Picker } from "../picker/registry.js";
import type { Source, SourceSession } from "../picker/source.js";
import type { Candidate, RowParts } from "../picker/types.js";
import type { PickerContext } from "../picker/context.js";
import type { HostEnv } from "./lifecycle.js";
import type { InboundMessage, OutboundMessage } from "./protocol.js";
import * as vscode from "vscode";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal candidate for tests. */
interface StreamCandidate extends Candidate {
  extra?: string;
}

/** Fake HostEnv that records calls. */
function fakeEnv(): HostEnv & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    restoreOrigin: vi.fn(async (origin) => {
      calls.push(`restoreOrigin:${origin.uri}`);
    }),
    focusActiveEditorGroup: vi.fn(async () => {
      calls.push("focusActiveEditorGroup");
    }),
    closePanel: vi.fn(async () => {
      calls.push("closePanel");
    }),
  };
}

/**
 * Fake webview view that captures outbound messages and exposes the
 * inbound message handler so tests can feed inbound messages.
 */
function fakeWebviewView() {
  let inboundHandler: ((msg: InboundMessage) => void) | undefined;
  let disposeHandler: (() => void) | undefined;
  const outbound: OutboundMessage[] = [];

  return {
    outbound,
    webview: {
      options: {},
      html: "",
      cspSource: "csp-source",
      onDidReceiveMessage: vi.fn((handler: (msg: InboundMessage) => void) => {
        inboundHandler = handler;
        return { dispose: vi.fn() };
      }),
      postMessage: vi.fn(async (msg: OutboundMessage) => {
        outbound.push(msg);
      }),
    },
    visible: true,
    onDidDispose: vi.fn((handler: () => void) => {
      disposeHandler = handler;
      return { dispose: vi.fn() };
    }),
    /** Feed an inbound message into the host. */
    send(msg: InboundMessage) {
      inboundHandler?.(msg);
    },
    /** Trigger view dispose. */
    dispose() {
      disposeHandler?.();
    },
    /** Reset captured messages. */
    clear() {
      outbound.length = 0;
    },
  };
}

// ---------------------------------------------------------------------------
// Fake streaming source
// ---------------------------------------------------------------------------

/**
 * Creates a controllable streaming source. The test controls when batches
 * are yielded via the returned `emitBatch` helper.
 */
function fakeStreamingSource(initialCandidates: StreamCandidate[]) {
  let resolveBatch: ((batch: StreamCandidate[]) => void) | undefined;
  const batches: StreamCandidate[][] = [];

  async function* updates(): AsyncGenerator<StreamCandidate[]> {
    while (true) {
      const batch = await new Promise<StreamCandidate[]>((resolve) => {
        resolveBatch = resolve;
      });
      batches.push(batch);
      yield batch;
    }
  }

  const source: Source<StreamCandidate> = (_query, _signal) => ({
    candidates: initialCandidates,
    updates: updates(),
  });

  return {
    source,
    /** Emit a batch of streamed candidates. */
    emitBatch(batch: StreamCandidate[]) {
      resolveBatch?.(batch);
    },
    /** All batches that have been yielded so far. */
    emittedBatches(): StreamCandidate[][] {
      return [...batches];
    },
  };
}

// ---------------------------------------------------------------------------
// Helper: build a minimal picker for tests
// ---------------------------------------------------------------------------

function makePicker(
  id: string,
  source: Source<StreamCandidate>,
  opts?: { queryDriven?: boolean },
): Picker<StreamCandidate> {
  return {
    id,
    label: `${id} picker`,
    placeholder: "Search…",
    emptyState: "Nothing found",
    queryDriven: opts?.queryDriven,
    source,
    narrow: (_q, cs) => cs, // identity narrow — query-driven style
    render: (c): RowParts => ({ primary: c.label, secondary: c.extra }),
    accept: vi.fn(async (_c, _ctx) => {}),
    preview: vi.fn(async (_c, _ctx) => {}),
  };
}

// ---------------------------------------------------------------------------
// Helpers for extracting results from outbound messages
// ---------------------------------------------------------------------------

function resultsMessages(outbound: OutboundMessage[]) {
  return outbound.filter((m): m is Extract<OutboundMessage, { type: "results" }> =>
    m.type === "results",
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PickerHost — streaming source support", () => {
  const vscodeMock = vi.mocked(vscode);
  let env: ReturnType<typeof fakeEnv>;
  let view: ReturnType<typeof fakeWebviewView>;
  let registry: ReturnType<typeof createRegistry>;
  const extensionUri = { fsPath: "/ext", scheme: "file", toString: () => "/ext" } as any;
  const viewId = "vsconsult.picker";

  beforeEach(() => {
    env = fakeEnv();
    view = fakeWebviewView();
    registry = createRegistry();
    vscodeMock.window.activeTextEditor = undefined;
  });

  it("re-sends reset when a newly created webview becomes ready", async () => {
    const source: Source<StreamCandidate> = (_query, _signal) => ({
      candidates: [{ id: "i1", label: "initial" }],
    });
    registry.register(makePicker("cold-start", source));

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    await host.start("cold-start");
    view.send({ type: "query", query: "main" });

    // Model a cold webview: messages posted before its script sent `ready`
    // were not observed by the page.
    view.clear();
    view.send({ type: "ready" });

    await vi.waitFor(() => {
      const resetIndex = view.outbound.findIndex((message) => message.type === "reset");
      const queryIndex = view.outbound.findIndex(
        (message) => message.type === "setQuery" && message.query === "main",
      );

      expect(resetIndex).toBeGreaterThanOrEqual(0);
      expect(queryIndex).toBeGreaterThan(resetIndex);
    });

    host.dispose();
  });

  it("appends streamed batches to the visible set and posts incremental results", async () => {
    const initial: StreamCandidate[] = [{ id: "i1", label: "initial" }];
    const { source, emitBatch } = fakeStreamingSource(initial);

    const picker = makePicker("stream", source);
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    // Start the picker — initial batch should arrive
    const startPromise = host.start("stream");

    // Yield to let the source resolve its initial batch
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const firstResults = resultsMessages(view.outbound)[0];
    expect(firstResults.rows).toHaveLength(1);
    expect(firstResults.rows[0].primary).toBe("initial");

    // Now emit a streamed batch
    emitBatch([
      { id: "s1", label: "streamed-1" },
      { id: "s2", label: "streamed-2" },
    ]);

    // The host should post a second results message with both batches
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(2);
    });

    const secondResults = resultsMessages(view.outbound)[1];
    expect(secondResults.rows).toHaveLength(3);
    expect(secondResults.rows.map((r) => r.primary)).toEqual([
      "initial",
      "streamed-1",
      "streamed-2",
    ]);

    // Emit another batch — all should accumulate
    emitBatch([{ id: "s3", label: "streamed-3" }]);

    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(3);
    });

    const thirdResults = resultsMessages(view.outbound)[2];
    expect(thirdResults.rows).toHaveLength(4);
    expect(thirdResults.rows.map((r) => r.primary)).toEqual([
      "initial",
      "streamed-1",
      "streamed-2",
      "streamed-3",
    ]);

    host.dispose();
  });

  it("re-narrows after each streamed batch using the picker's narrow function", async () => {
    // Picker that narrows by exact label match
    const source = fakeStreamingSource([{ id: "i1", label: "alpha" }]);
    const picker: Picker<StreamCandidate> = {
      id: "narrow-test",
      label: "Narrow Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source: source.source,
      narrow: (q, cs) => (q ? cs.filter((c) => c.label.includes(q)) : cs),
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(),
      preview: vi.fn(),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("narrow-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Set a query via inbound message
    view.send({ type: "query", query: "beta" });
    await vi.waitFor(() => {
      // query causes re-render: 1 results message from start + 1 from query
      expect(resultsMessages(view.outbound)).toHaveLength(2);
    });

    // Query is "beta", so alpha is narrowed out (0 results)
    const afterQuery = resultsMessages(view.outbound)[1];
    expect(afterQuery.rows).toHaveLength(0);

    // Now emit a batch containing "beta"
    source.emitBatch([{ id: "s1", label: "beta" }]);

    // The narrowed results should include "beta"
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(3);
    });

    const afterStream = resultsMessages(view.outbound)[2];
    expect(afterStream.rows).toHaveLength(1);
    expect(afterStream.rows[0].primary).toBe("beta");

    host.dispose();
  });

  it("stream completion does not error — host stops consuming gracefully", async () => {
    let resolveBatch: ((batch: StreamCandidate[]) => void) | undefined;

    async function* controlledUpdates(): AsyncGenerator<StreamCandidate[]> {
      while (true) {
        const batch = await new Promise<StreamCandidate[]>((resolve) => {
          resolveBatch = resolve;
        });
        yield batch;
      }
    }

    const source: Source<StreamCandidate> = (_query, _signal) => ({
      candidates: [{ id: "i1", label: "initial" }],
      updates: controlledUpdates(),
    });

    const picker = makePicker("complete-test", source);
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("complete-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Emit a batch then end the stream by rejecting the generator.
    // In a real stream this happens when the iterable completes.
    resolveBatch?.([{ id: "s1", label: "streamed" }]);

    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(2);
    });

    // The stream generator never resolves again — but the host should
    // be fine (it awaits the for-await which blocks until next yield
    // or completion). No error message should have been posted.
    const errorMessages = view.outbound.filter(
      (m) => m.type === "status" && (m as any).error,
    );
    expect(errorMessages).toHaveLength(0);

    host.dispose();
  });

  it("signals source completion when the stream ends naturally", async () => {
    // A FINITE streaming source: yields two batches, then completes.
    async function* finiteUpdates(): AsyncGenerator<StreamCandidate[]> {
      yield [{ id: "s1", label: "batch-1" }];
      yield [{ id: "s2", label: "batch-2" }];
      // generator returns — stream is complete
    }

    const source: Source<StreamCandidate> = (_query, _signal) => ({
      candidates: [{ id: "i1", label: "initial" }],
      updates: finiteUpdates(),
    });

    const picker = makePicker("finite-stream", source);
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("finite-stream");

    // Wait for: initial results + 2 streamed batches = 3 results messages,
    // plus a completion signal.
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(3);
    });

    // The host must signal that the source has completed (no further batches).
    // This is a dedicated `complete` message so the webview can stop its
    // loading indicator.
    await vi.waitFor(() => {
      expect(
        view.outbound.some((m) => m.type === "complete"),
      ).toBe(true);
    });

    host.dispose();
  });

  it("cancel aborts the source controller so late batches do not arrive", async () => {
    const initial: StreamCandidate[] = [{ id: "i1", label: "initial" }];
    const { source, emitBatch } = fakeStreamingSource(initial);

    const picker = makePicker("cancel-test", source);
    registry.register(picker);

    // Make sure there's no active text editor — cancel will focus the editor group
    const vscodeMock = vi.mocked(vscode);
    vscodeMock.window.activeTextEditor = undefined;

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("cancel-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Send cancel — should restore origin / focus editor group, post idle
    view.send({ type: "cancel" });

    // Wait for idle message (exit completed)
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // Late batch should not cause additional results — session is cleared
    emitBatch([{ id: "late", label: "too-late" }]);
    await new Promise((r) => setTimeout(r, 50));

    const finalResults = resultsMessages(view.outbound);
    expect(finalResults).toHaveLength(1);
    expect(finalResults[0].rows).toHaveLength(1);
    expect(finalResults[0].rows[0].primary).toBe("initial");

    // Aborted streams must NOT signal completion — only natural stream end does.
    expect(view.outbound.some((m) => m.type === "complete")).toBe(false);

    host.dispose();
  });

  it("accept aborts the source controller and tears down session", async () => {
    const initial: StreamCandidate[] = [{ id: "i1", label: "pick-me" }];
    const { source, emitBatch } = fakeStreamingSource(initial);

    const picker = makePicker("accept-test", source);
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("accept-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Accept the candidate
    view.send({ type: "accept", id: "i1" });

    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // Late batch should not cause additional results
    emitBatch([{ id: "late", label: "too-late" }]);
    await new Promise((r) => setTimeout(r, 50));

    const finalResults = resultsMessages(view.outbound);
    expect(finalResults).toHaveLength(1);

    host.dispose();
  });

  it("query-driven picker re-runs source on query change and aborts old source", async () => {
    const signals: AbortSignal[] = [];
    const batches: StreamCandidate[][] = [];
    let resolveBatch1: ((b: StreamCandidate[]) => void) | undefined;
    let resolveBatch2: ((b: StreamCandidate[]) => void) | undefined;

    const source: Source<StreamCandidate> = (query, signal) => {
      signals.push(signal);
      const isFirst = signals.length === 1;
      return {
        candidates: [{ id: `${isFirst ? "old" : "new"}-init`, label: `init-${query}` }],
        updates: (async function* () {
          const batch = await new Promise<StreamCandidate[]>((resolve) => {
            if (isFirst) resolveBatch1 = resolve; else resolveBatch2 = resolve;
          });
          batches.push(batch);
          yield batch;
        })(),
      };
    };

    const picker = makePicker("qr", source, { queryDriven: true });
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    // Start with empty query — first source run
    host.start("qr");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });
    expect(signals).toHaveLength(1);

    // Change query — should abort first source, re-run with new query
    view.send({ type: "query", query: "new-q" });
    await vi.waitFor(() => {
      expect(signals).toHaveLength(2);
    });

    // First signal should be aborted
    expect(signals[0].aborted).toBe(true);
    // Second signal should not be aborted
    expect(signals[1].aborted).toBe(false);

    // Emit batch from second source run
    resolveBatch2?.([{ id: "new-batch", label: "new-result" }]);
    await vi.waitFor(() => {
      const last = resultsMessages(view.outbound).at(-1);
      expect(last?.rows.some((r) => r.primary === "new-result")).toBe(true);
    });

    // Late batch from first source should not arrive (it was aborted)
    resolveBatch1?.([{ id: "old-late", label: "stale" }]);
    await new Promise((r) => setTimeout(r, 50));
    const staleInResults = resultsMessages(view.outbound)
      .flatMap((m) => m.rows)
      .some((r) => r.primary === "stale");
    expect(staleInResults).toBe(false);

    host.dispose();
  });

  it("pre-materialized picker does NOT re-source on query change — only narrows", async () => {
    const sourceCallCount = { value: 0 };
    const source: Source<StreamCandidate> = (_q, _signal) => {
      sourceCallCount.value++;
      return {
        candidates: [
          { id: "a", label: "alpha" },
          { id: "b", label: "beta" },
        ],
      };
    };

    const picker: Picker<StreamCandidate> = {
      id: "premat",
      label: "Pre-materialized",
      placeholder: "Search…",
      emptyState: "Nothing found",
      // queryDriven: false (default — pre-materialized)
      source,
      narrow: (q, cs) => (q ? cs.filter((c) => c.label.includes(q)) : cs),
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(),
      preview: vi.fn(),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("premat");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });
    expect(sourceCallCount.value).toBe(1);

    // Change query — should NOT re-source, only narrow
    view.send({ type: "query", query: "alpha" });
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(2);
    });
    // Source was NOT called again
    expect(sourceCallCount.value).toBe(1);
    // But results are narrowed
    const narrowed = resultsMessages(view.outbound)[1];
    expect(narrowed.rows).toHaveLength(1);
    expect(narrowed.rows[0].primary).toBe("alpha");

    host.dispose();
  });
});
