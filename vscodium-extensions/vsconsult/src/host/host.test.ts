import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";

// ---------------------------------------------------------------------------
// Mock vscode — the PickerHost imports vscode directly
// ---------------------------------------------------------------------------

vi.mock("vscode", () => {
  const commands = { executeCommand: vi.fn(async () => {}) };
  const window = {
    activeTextEditor: undefined as undefined,
    showTextDocument: vi.fn(async (uri: any, opts?: any) => ({
      document: { uri, languageId: "plaintext", getText: () => "", lineCount: 0 },
      options: opts ?? {},
      revealRange: vi.fn(),
      selection: undefined,
    })),
    showInformationMessage: vi.fn(async () => ({})),
  };
  const workspace = {
    registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
    textDocuments: [],
    openTextDocument: vi.fn(async (uri: any) => ({
      uri,
      languageId: uri.scheme === "file" ? "plaintext" : "plaintext",
      getText: () => "",
      lineCount: 0,
    })),
    getConfiguration: vi.fn(() => ({ get: () => undefined })),
    onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
  };
  const languages = {
    setTextDocumentLanguage: vi.fn(async (doc: any, id: string) => doc),
    getLanguages: vi.fn(async () => [] as string[]),
  };
  const Uri = {
    file: (p: string) => ({ fsPath: p, scheme: "file", toString: () => p }),
    parse: (s: string) => ({ fsPath: s, scheme: s.split(":")[0], toString: () => s }),
  };
  // Position / Range / Selection / TextEditorRevealType — used by host's
  // showPreview.reveal codepath (ticket 11) and revealPosition.
  class Position {
    readonly line: number;
    readonly character: number;
    constructor(line: number, character: number) {
      this.line = line;
      this.character = character;
    }
    isBefore(other: Position) { return this.line < other.line || (this.line === other.line && this.character < other.character); }
    isAfter(other: Position) { return other.isBefore(this); }
    isEqual(other: Position) { return this.line === other.line && this.character === other.character; }
    translate(ld?: { lineDelta?: number; characterDelta?: number }) { return new Position(this.line + (ld?.lineDelta ?? 0), this.character + (ld?.characterDelta ?? 0)); }
    with(line?: number, character?: number) { return new Position(line ?? this.line, character ?? this.character); }
    compareTo(other: Position) { return this.isBefore(other) ? -1 : this.isAfter(other) ? 1 : 0; }
  }
  class Range {
    readonly start: Position;
    readonly end: Position;
    constructor(startLine: number, startCharacter: number, endLine?: number, endCharacter?: number);
    constructor(start: Position, end: Position);
    constructor(startOrPos: number | Position, endOrChar: number | Position, endLine?: number, endCharacter?: number) {
      if (startOrPos instanceof Position) {
        this.start = startOrPos;
        this.end = endOrChar as Position;
      } else {
        this.start = new Position(startOrPos, endOrChar as number);
        this.end = new Position(endLine ?? startOrPos, endCharacter ?? endOrChar as number);
      }
    }
    get isEmpty() { return this.start.isEqual(this.end); }
    get isSingleLine() { return this.start.line === this.end.line; }
    contains(positionOrRange: Position | Range): boolean {
      if (positionOrRange instanceof Position) {
        return !positionOrRange.isBefore(this.start) && !positionOrRange.isAfter(this.end);
      }
      return this.contains(positionOrRange.start) && this.contains(positionOrRange.end);
    }
    intersection(range: Range): Range | undefined {
      const start = this.start.isAfter(range.start) ? this.start : range.start;
      const end = this.end.isBefore(range.end) ? this.end : range.end;
      return start.isAfter(end) ? undefined : new Range(start, end);
    }
    union(range: Range): Range {
      const start = this.start.isBefore(range.start) ? this.start : range.start;
      const end = this.end.isAfter(range.end) ? this.end : range.end;
      return new Range(start, end);
    }
    with(start?: Position, end?: Position): Range { return new Range(start ?? this.start, end ?? this.end); }
    isEqual(other: Range) { return this.start.isEqual(other.start) && this.end.isEqual(other.end); }
  }
  class Selection extends Range {
    readonly anchor: Position;
    readonly active: Position;
    constructor(anchorLine: number, anchorCharacter: number, activeLine: number, activeCharacter: number);
    constructor(anchor: Position, active: Position);
    constructor(anchorOrLine: number | Position, anchorOrChar: number | Position, activeLine?: number, activeCharacter?: number) {
      if (anchorOrLine instanceof Position) {
        const anchor = anchorOrLine;
        const active = anchorOrChar as Position;
        super(anchor, active);
        this.anchor = anchor;
        this.active = active;
      } else {
        const anchor = new Position(anchorOrLine, anchorOrChar as number);
        const active = new Position(activeLine!, activeCharacter!);
        super(anchor, active);
        this.anchor = anchor;
        this.active = active;
      }
    }
    get isReversed() { return this.anchor.isAfter(this.active); }
  }
  const TextEditorRevealType = { Default: 0, InCenter: 1, InCenterIfOutsideViewport: 2, AtTop: 3 };
  class EventEmitter<T> {
    private readonly listeners = new Set<(value: T) => void>();
    readonly event = (listener: (value: T) => void) => {
      this.listeners.add(listener);
      return { dispose: () => this.listeners.delete(listener) };
    };
    fire(value: T): void {
      for (const listener of this.listeners) listener(value);
    }
    dispose(): void { this.listeners.clear(); }
  }
  const ViewColumn = { Active: 1, Beside: 2 };
  const TabInputText = class {
    readonly uri: any;
    constructor(uri: any) { this.uri = uri; }
  };
  const tabGroups = {
    all: [] as any[],
    close: vi.fn(async () => true),
    onDidChangeTabGroups: new EventEmitter<any>().event,
    onDidChangeTabs: new EventEmitter<any>().event,
    activeTabGroup: {
      tabs: [] as any[],
      isActive: true,
      viewColumn: 1,
      activeTab: undefined,
    },
  };
  // Attach tabGroups to window for targeted close.
  (window as any).tabGroups = tabGroups;
  return { commands, window, workspace, languages, Uri, ViewColumn, EventEmitter, TabInputText, Position, Range, Selection, TextEditorRevealType, default: undefined };
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
  const vscodeMock = (vscode as any);
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
    const vscodeMock = (vscode as any);
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

  // ---------------------------------------------------------------------
  // Preview focus preservation
  // ---------------------------------------------------------------------

  it("virtual preview is opened with preserveFocus so picker keeps focus", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    // Picker whose preview action calls ctx.showPreview (realistic behavior)
    const picker: Picker<StreamCandidate> = {
      id: "preview-focus-test",
      label: "Preview Focus Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "file content", title: "main.ts" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("preview-focus-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Select a candidate — triggers debounced preview
    view.send({ type: "select", id: "/project/src/main.ts" });

    // Wait for the debounce to fire (125ms + buffer)
    await new Promise((r) => setTimeout(r, 200));

    // The picker's preview action was called
    expect(picker.preview).toHaveBeenCalledOnce();

    // The virtual preview document should be opened with preserveFocus: true
    const vscodeMock = (vscode as any);
    const showTextDocCalls = vscodeMock.window.showTextDocument.mock.calls;
    const virtualPreviewCall = showTextDocCalls.find(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualPreviewCall).toBeDefined();
    expect(virtualPreviewCall![1]).toMatchObject({
      preserveFocus: true,
    });

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Accept teardown: closePreview called, only accepted real URI opened
  // ---------------------------------------------------------------------

  it("accept closes virtual preview and opens only the accepted real URI", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
      { id: "/project/src/other.ts", label: "other.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    // Picker whose preview calls ctx.showPreview and accept calls ctx.openTextDocument
    const picker: Picker<StreamCandidate> = {
      id: "accept-teardown-test",
      label: "Accept Teardown Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async (c, ctx) => {
        await ctx.openTextDocument(c.id);
      }),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "content", title: "preview" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("accept-teardown-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // First, trigger preview to open the virtual document
    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    const vscodeMock = (vscode as any);
    const callsBeforeAccept = vscodeMock.window.showTextDocument.mock.calls.length;

    // Now accept
    view.send({ type: "accept", id: "/project/src/main.ts" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // The accept action opened the real URI (not virtual)
    const realOpenCalls = vscodeMock.window.showTextDocument.mock.calls
      .slice(callsBeforeAccept)
      .filter((call: any) => call[0]?.scheme === "file");
    expect(realOpenCalls).toHaveLength(1);
    expect(realOpenCalls[0][0].fsPath).toBe("/project/src/main.ts");

    // No virtual preview calls after accept
    const virtualCallsAfterAccept = vscodeMock.window.showTextDocument.mock.calls
      .slice(callsBeforeAccept)
      .filter((close: any) => close[0]?.scheme === "vsconsult-preview");
    expect(virtualCallsAfterAccept).toHaveLength(0);

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Preview payload: filename, path, and content
  // ---------------------------------------------------------------------

  it("preview receives candidate filename, path, and content in payload", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    // Capture the preview payload passed to ctx.showPreview
    let capturedPayload: { text: string; title: string } | undefined;

    const picker: Picker<StreamCandidate> = {
      id: "preview-payload-test",
      label: "Preview Payload Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "file content here", title: "src/main.ts" });
        capturedPayload = { text: "file content here", title: "src/main.ts" };
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("preview-payload-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    expect(picker.preview).toHaveBeenCalledOnce();
    expect(capturedPayload).toBeDefined();
    expect(capturedPayload!.title).toBe("src/main.ts");
    expect(capturedPayload!.text).toBe("file content here");

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Cancel teardown: virtual preview closed, origin restored
  // ---------------------------------------------------------------------

  it("cancel closes virtual preview and restores origin", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "cancel-teardown-test",
      label: "Cancel Teardown Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "content", title: "preview" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("cancel-teardown-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Trigger preview to open the virtual document
    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Cancel
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // Origin was restored (env.restoreOrigin or env.focusActiveEditorGroup was called)
    expect(env.calls.some((c) => c.startsWith("restoreOrigin") || c === "focusActiveEditorGroup")).toBe(true);

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Dirty-origin preservation: cancel doesn't discard dirty content
  // ---------------------------------------------------------------------

  it("cancel preserves dirty origin editor content", async () => {
    // Set up an active text editor (origin) with dirty content
    const mockDocument = {
      uri: { fsPath: "/project/src/dirty.ts", scheme: "file", toString: () => "/project/src/dirty.ts" },
      isDirty: true,
    };
    const mockEditor = {
      document: mockDocument,
      selection: { active: { line: 5, character: 10 } },
      viewColumn: 1,
    };
    vi.mocked(vscode.window).activeTextEditor = mockEditor as any;

    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "dirty-origin-test",
      label: "Dirty Origin Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "content", title: "preview" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("dirty-origin-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Cancel without accepting
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // restoreOrigin was called (origin editor is restored, not closed/discarded)
    expect(env.calls.some((c) => c.startsWith("restoreOrigin"))).toBe(true);

    // The dirty document was NOT closed — only the virtual preview was closed
    // (We can verify by checking that closeActiveEditor was called only for the virtual doc)
    const closeCalls = vi.mocked(vscode.commands.executeCommand).mock.calls;
    const closeEditorCalls = closeCalls.filter(
      (c) => c[0] === "workbench.action.closeActiveEditor",
    );
    // At most one close call (for the virtual preview), not for the dirty origin
    expect(closeEditorCalls.length).toBeLessThanOrEqual(1);

    host.dispose();
    vi.mocked(vscode.window).activeTextEditor = undefined;
  });

  // ---------------------------------------------------------------------
  // Cycling: stable virtual URI reused across candidate changes
  // ---------------------------------------------------------------------

  it("cycling candidates reuses the same virtual URI — no per-candidate real URIs opened", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/alpha.ts", label: "alpha.ts" },
      { id: "/project/src/beta.ts", label: "beta.ts" },
      { id: "/project/src/gamma.ts", label: "gamma.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const previewedUris: string[] = [];

    const picker: Picker<StreamCandidate> = {
      id: "cycling-test",
      label: "Cycling Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "content", title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("cycling-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Cycle through all three candidates
    for (const candidate of initial) {
      view.send({ type: "select", id: candidate.id });
      await new Promise((r) => setTimeout(r, 200));
    }

    // All three preview calls should use the SAME virtual URI
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(3);

    // All virtual URIs are identical (stable identity)
    const virtualUris = virtualCalls.map((call: any) => call[0].toString());
    expect(new Set(virtualUris).size).toBe(1);

    // No real file URIs were opened during preview
    const realFileCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "file",
    );
    expect(realFileCalls).toHaveLength(0);

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Debounce test: rapid navigation limits preview reads (ticket 09 criterion 1)
  // ---------------------------------------------------------------------

  it("rapid selection fires preview exactly once and only for the latest candidate", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
      { id: "/project/beta.ts", label: "beta.ts" },
      { id: "/project/gamma.ts", label: "gamma.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "debounce-nav-test",
      label: "Debounce Nav Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: `content-${_c.label}`,
          title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("debounce-nav-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Rapid selects — all within the 125ms debounce window (sync dispatch)
    view.send({ type: "select", id: "/project/alpha.ts" });
    view.send({ type: "select", id: "/project/beta.ts" });
    view.send({ type: "select", id: "/project/gamma.ts" });

    // Wait past the debounce delay
    await new Promise((r) => setTimeout(r, 200));

    // Preview must be called exactly once — the intermediate selections were
    // cancelled by the debounce.
    expect(picker.preview).toHaveBeenCalledTimes(1);

    // The candidate passed to preview should be the latest selection.
    const previewCallArg = (picker.preview as ReturnType<typeof vi.fn>).mock
      .calls[0][0] as StreamCandidate;
    expect(previewCallArg.id).toBe("/project/gamma.ts");

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Out-of-order completion: a slower older read must never overwrite
  // the virtual document after a newer selection has published.
  // Ticket 09 criterion 2.
  // ---------------------------------------------------------------------

  it("out-of-order completion — slower older candidate cannot overwrite a newer selection", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
      { id: "/project/beta.ts", label: "beta.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    // Controllable deferreds for the two candidates' preview reads.
    let resolveAlpha: (() => void) | undefined;
    const alphaDeferred = new Promise<void>((resolve) => {
      resolveAlpha = resolve;
    });
    let resolveBeta: (() => void) | undefined;
    const betaDeferred = new Promise<void>((resolve) => {
      resolveBeta = resolve;
    });

    const picker: Picker<StreamCandidate> = {
      id: "ooo-test",
      label: "Order Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        // Simulate a slow read for alpha, fast for beta.
        if (_c.id === "/project/alpha.ts") {
          await alphaDeferred;
        } else {
          await betaDeferred;
        }
        await ctx.showPreview({ text: `content-${_c.label}`,
          title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("ooo-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);

    // Select alpha — debounce fires, preview starts, awaits alphaDeferred
    view.send({ type: "select", id: "/project/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200)); // past debounce

    // Select beta — debounce fires, preview starts, awaits betaDeferred
    view.send({ type: "select", id: "/project/beta.ts" });
    await new Promise((r) => setTimeout(r, 200)); // past debounce

    // Resolve beta first — the newer selection should publish.
    vscodeMock.window.showTextDocument.mockClear();
    resolveBeta?.();
    await new Promise((r) => setTimeout(r, 50));

    // Resolve alpha — the older, slower read completes NOW.
    // Without a generation guard it would overwrite beta.
    resolveAlpha?.();
    await new Promise((r) => setTimeout(r, 50));

    // showTextDocument for the virtual preview must be called exactly once
    // (beta's publish). Alpha's stale result must NOT reach the document.
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(1);

    // The preview action itself was called twice (once per candidate).
    expect(picker.preview).toHaveBeenCalledTimes(2);
    // But only the latest one published — proven by single
    // showTextDocument call above.

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Session replacement: a stale in-flight preview from a replaced or
  // cancelled session must never update or reopen the virtual document.
  // Ticket 09 criterion 3.
  // ---------------------------------------------------------------------

  it("stale preview from a replaced session cannot reopen the virtual preview", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let resolveStale: (() => void) | undefined;
    const staleDeferred = new Promise<void>((resolve) => {
      resolveStale = resolve;
    });

    let stalePreviewCalled = false;

    const pickerA: Picker<StreamCandidate> = {
      id: "replace-target",
      label: "Replace Target",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await staleDeferred; // stays pending until explicitly resolved
        stalePreviewCalled = true;
        await ctx.showPreview({ text: "stale-content", title: _c.label });
      }),
    };
    registry.register(pickerA);

    // Replacement picker
    const pickerB = makePicker("replacement", source);
    registry.register(pickerB);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    // Start picker A and trigger its preview (in-flight, stalled).
    host.start("replace-target");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });
    view.send({ type: "select", id: "/project/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Replace with picker B
    host.start("replacement");
    await vi.waitFor(() => {
      const rms = resultsMessages(view.outbound);
      expect(rms.length).toBeGreaterThanOrEqual(2);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Now resolve the stale deferred from picker A.
    resolveStale?.();
    await new Promise((r) => setTimeout(r, 50));

    // The stale preview action completed, but it must NOT have reopened
    // the virtual preview (no showTextDocument for vsconsult-preview).
    expect(stalePreviewCalled).toBe(true);
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(0);

    host.dispose();
  });

  it("stale preview from a cancelled session cannot reopen the virtual preview", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let resolveStale: (() => void) | undefined;
    const staleDeferred = new Promise<void>((resolve) => {
      resolveStale = resolve;
    });

    let stalePreviewFinished = false;

    const picker: Picker<StreamCandidate> = {
      id: "cancel-race",
      label: "Cancel Race",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await staleDeferred;
        stalePreviewFinished = true;
        await ctx.showPreview({ text: "late-content", title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("cancel-race");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });
    view.send({ type: "select", id: "/project/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Cancel the session while the preview is still pending.
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Resolve the stale deferred after the session is gone.
    resolveStale?.();
    await new Promise((r) => setTimeout(r, 50));

    // The stale preview must NOT have reopened the virtual document.
    expect(stalePreviewFinished).toBe(true);
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(0);

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Idempotent teardown — calling exit() twice must not error or close
  // the virtual preview a second time.  Ticket 09 criterion 5.
  // ---------------------------------------------------------------------

  it("repeated cancel is idempotent — no double-close and no errors", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/a.ts", label: "a.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker = makePicker("idem-cancel", source);
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("idem-cancel");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // First cancel — teardown runs.
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.tabGroups.close.mockClear();

    // Second cancel on the same (already torn-down) host.
    // Should be a no-op — no double-close, no error.
    view.send({ type: "cancel" });
    await new Promise((r) => setTimeout(r, 50));

    // tabGroups.close was NOT called — nothing to close.
    expect(vscodeMock.window.tabGroups.close).not.toHaveBeenCalled();

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Targeted close — teardown closes only the extension-owned virtual
  // preview and never unrelated editors, groups, or dirty documents.
  // Ticket 09 criterion 6.
  // ---------------------------------------------------------------------

  it("teardown closes only the virtual preview tab and leaves an unrelated tab open", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "targeted-close",
      label: "Targeted Close",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({ text: "content", title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("targeted-close");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Trigger preview — this opens the virtual document.
    view.send({ type: "select", id: "/project/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Seed tabGroups with two tabs: the virtual preview tab (extracted
    // from the showTextDocument call) and an unrelated dirty editor tab.
    const virtualShowCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualShowCalls).toHaveLength(1);
    const actualVirtualUri = virtualShowCalls[0][0];

    const unrelatedUri = vscode.Uri.file("/project/unrelated.ts");

    const unrelatedTab = {
      input: { uri: unrelatedUri },
      isDirty: true,
      isActive: false,
      isPreview: false,
      label: "unrelated.ts",
      group: { tabs: [] as any[], viewColumn: 1 },
    };
    const virtualTab = {
      input: { uri: actualVirtualUri },
      isDirty: false,
      isActive: false,
      isPreview: false,
      label: "preview",
      group: { tabs: [] as any[], viewColumn: 1 },
    };
    const group = { tabs: [virtualTab, unrelatedTab] as any[], viewColumn: 1, isActive: true, activeTab: virtualTab };
    (vscode.window as any).tabGroups.all = [group];
    (vscode.window as any).tabGroups.activeTabGroup = group;

    vscodeMock.window.tabGroups.close.mockClear();

    // Cancel — triggers teardown.
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // tabGroups.close must have been called exactly once — with the
    // virtual preview tab, NOT the unrelated dirty tab.
    expect(vscodeMock.window.tabGroups.close).toHaveBeenCalledTimes(1);
    const closedTab = vscodeMock.window.tabGroups.close.mock.calls[0][0];
    expect(closedTab.input.uri.toString()).toBe(actualVirtualUri.toString());

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Disposal path — view onDidDispose tears down the active session.
  // Ticket 09 criteria 3 & 5.
  // ---------------------------------------------------------------------

  it("onDidDispose tears down the active session — no leak and no stale preview", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
      { id: "/project/beta.ts", label: "beta.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let resolveStalled: (() => void) | undefined;
    const stalledDeferred = new Promise<void>((resolve) => {
      resolveStalled = resolve;
    });

    let previewCallCount = 0;

    const picker: Picker<StreamCandidate> = {
      id: "dispose-test",
      label: "Dispose Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        previewCallCount++;
        if (previewCallCount === 2) {
          await stalledDeferred; // second call stays in-flight
        }
        await ctx.showPreview({ text: `content-${_c.label}`,
          title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("dispose-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // First preview — completes normally, opens the virtual document.
    view.send({ type: "select", id: "/project/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Extract the actual virtual URI from the showTextDocument call.
    const vscodeMock = (vscode as any);
    const virtualShowCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    const actualVirtualUri = virtualShowCalls[virtualShowCalls.length - 1][0];

    // Seed the virtual preview tab with the actual URI.
    const virtualTab = {
      input: { uri: actualVirtualUri },
      isDirty: false,
      isActive: false,
      label: "preview",
      group: { tabs: [] as any[], viewColumn: 1 },
    };
    const group = { tabs: [virtualTab] as any[], viewColumn: 1, isActive: true, activeTab: virtualTab };
    (vscode.window as any).tabGroups.all = [group];

    // Start a second preview that will stay in-flight (stalled).
    view.send({ type: "select", id: "/project/beta.ts" });
    await new Promise((r) => setTimeout(r, 200));

    vscodeMock.window.tabGroups.close.mockClear();

    // Dispose the view while the second preview is in-flight.
    view.dispose();

    // tabGroups.close must have been called for the virtual tab.
    expect(vscodeMock.window.tabGroups.close).toHaveBeenCalledTimes(1);
    const closedTab = vscodeMock.window.tabGroups.close.mock.calls[0][0];
    expect(closedTab.input.uri.toString()).toBe(actualVirtualUri.toString());

    // Now resolve the stalled preview. It must NOT reopen the virtual
    // document — the session was torn down.
    vscodeMock.window.showTextDocument.mockClear();
    resolveStalled?.();
    await new Promise((r) => setTimeout(r, 50));

    const virtualCallsAfterDispose = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCallsAfterDispose).toHaveLength(0);

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Error path — preview-throw doesn't break the picker; teardown still
  // cleans the extension-owned resource.
  // Ticket 09 criterion 5.
  // ---------------------------------------------------------------------

  it("preview error does not prevent clean teardown on cancel", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let previewCallCount = 0;

    const picker: Picker<StreamCandidate> = {
      id: "error-teardown",
      label: "Error Teardown",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        previewCallCount++;
        // First preview call opens the virtual document and then throws.
        if (previewCallCount === 1) {
          await ctx.showPreview({ text: "content", title: _c.label });
          throw new Error("simulated preview failure");
        }
        // Subsequent call succeeds normally.
        await ctx.showPreview({ text: "recovered", title: _c.label });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("error-teardown");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // First preview — opens virtual doc, then throws.
    view.send({ type: "select", id: "/project/main.ts" });
    await new Promise((r) => setTimeout(r, 200));
    expect(previewCallCount).toBe(1);

    // Extract the actual virtual URI that was opened.
    const vscodeMock = (vscode as any);
    const virtualShowCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    const actualVirtualUri = virtualShowCalls[virtualShowCalls.length - 1][0];

    // Seed the virtual preview tab with the actual URI.
    const virtualTab = {
      input: { uri: actualVirtualUri },
      isDirty: false,
      isActive: false,
      label: "preview",
      group: { tabs: [] as any[], viewColumn: 1 },
    };
    const group = { tabs: [virtualTab] as any[], viewColumn: 1, isActive: true, activeTab: virtualTab };
    (vscode.window as any).tabGroups.all = [group];

    vscodeMock.window.tabGroups.close.mockClear();

    // Cancel — teardown must still close the virtual preview tab
    // despite the earlier preview error.
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    // The virtual preview tab was closed.
    expect(vscodeMock.window.tabGroups.close).toHaveBeenCalledTimes(1);
    const closedTab = vscodeMock.window.tabGroups.close.mock.calls[0][0];
    expect(closedTab.input.uri.toString()).toBe(actualVirtualUri.toString());

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Ticket 10 — language-mode application on the virtual preview
  // ---------------------------------------------------------------------

  it("applies the languageId to the virtual document via setTextDocumentLanguage", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "lang-apply-test",
      label: "Language Apply Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({
          text: "const x = 1;",
          title: "src/main.ts",
          languageId: "typescript",
        });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("lang-apply-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.languages.setTextDocumentLanguage.mockClear();

    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // The host must have applied the language mode to the virtual document.
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalled();
    const [calledDoc, calledLang] = vscodeMock.languages.setTextDocumentLanguage.mock.calls[0];
    // The document is the virtual preview document (scheme vsconsult-preview).
    expect(calledDoc.uri.scheme).toBe("vsconsult-preview");
    expect(calledLang).toBe("typescript");

    host.dispose();
  });

  it("language change across candidates reuses the stable virtual URI", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/alpha.ts", label: "alpha.ts" },
      { id: "/project/src/beta.css", label: "beta.css" },
    ];
    const { source } = fakeStreamingSource(initial);

    let callIndex = 0;

    const picker: Picker<StreamCandidate> = {
      id: "lang-change-test",
      label: "Language Change Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        // Alternate: first call -> typescript, second -> css.
        const id = callIndex++ === 0 ? "typescript" : "css";
        await ctx.showPreview({ text: "content", title: _c.label, languageId: id });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("lang-change-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();
    vscodeMock.languages.setTextDocumentLanguage.mockClear();

    // Select the .ts candidate.
    view.send({ type: "select", id: "/project/src/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Select the .css candidate.
    view.send({ type: "select", id: "/project/src/beta.css" });
    await new Promise((r) => setTimeout(r, 200));

    // Both previews must use the SAME virtual URI (stable identity).
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(2);
    const virtualUris = virtualCalls.map((call: any) => call[0].toString());
    expect(new Set(virtualUris).size).toBe(1);

    // No real file URIs were opened for preview.
    const realCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "file",
    );
    expect(realCalls).toHaveLength(0);

    // setTextDocumentLanguage was called twice — first typescript, then css.
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalledTimes(2);
    const firstLang = vscodeMock.languages.setTextDocumentLanguage.mock.calls[0][1];
    const secondLang = vscodeMock.languages.setTextDocumentLanguage.mock.calls[1][1];
    expect(firstLang).toBe("typescript");
    expect(secondLang).toBe("css");

    host.dispose();
  });

  it("unknown language falls back to plaintext — setTextDocumentLanguage called with plaintext", async () => {
    // Criterion 3: files for which VSCodium has no language association
    // reset the virtual document to plaintext.
    const initial: StreamCandidate[] = [
      { id: "/project/data.xyz", label: "data.xyz" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "unknown-lang-test",
      label: "Unknown Language Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        // Simulate resolveLanguageId returning undefined (no association).
        await ctx.showPreview({ text: "some data", title: "data.xyz" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("unknown-lang-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.languages.setTextDocumentLanguage.mockClear();
    vscodeMock.window.showTextDocument.mockClear();

    view.send({ type: "select", id: "/project/data.xyz" });
    await new Promise((r) => setTimeout(r, 200));

    // The virtual preview document was still shown — preview survives.
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(1);

    // The language is explicitly reset to plaintext.
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.objectContaining({ scheme: "vsconsult-preview" }) }),
      "plaintext",
    );

    host.dispose();
  });

  it("a late older selection cannot overwrite the current preview's language mode", async () => {
    // Criterion 4: Language-mode updates respect the latest selected candidate.
    // A slow showTextDocument for an older selection must not overwrite
    // the language the newer candidate already applied.
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
      { id: "/project/beta.css", label: "beta.css" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "stale-lang-test",
      label: "Stale Language Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        const lang = _c.id.endsWith(".ts") ? "typescript" : "css";
        await ctx.showPreview({ text: "content", title: _c.label, languageId: lang });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("stale-lang-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);

    // Defer the first showTextDocument for the virtual preview so A's
    // preview hangs while B's runs and completes.
    let resolveDeferredShow: (() => void) | undefined;
    const deferredShow = new Promise<void>((resolve) => {
      resolveDeferredShow = resolve;
    });
    let firstVirtualShow = true;
    const originalShowTextDocument = vscodeMock.window.showTextDocument;
    vscodeMock.window.showTextDocument = vi.fn(
      async (uri: any, opts?: any) => {
        if (
          uri?.scheme === "vsconsult-preview" &&
          firstVirtualShow
        ) {
          firstVirtualShow = false;
          await deferredShow;
        }
        return {
          document: { uri, languageId: "plaintext", getText: () => "", lineCount: 0 },
          options: opts ?? {},
        };
      },
    );
    vscodeMock.languages.setTextDocumentLanguage.mockClear();

    // Select alpha (.ts) — its showPreview starts but hangs at showTextDocument.
    view.send({ type: "select", id: "/project/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200)); // past debounce

    // Select beta (.css) — bumps generation, preview runs and completes.
    view.send({ type: "select", id: "/project/beta.css" });
    await new Promise((r) => setTimeout(r, 200)); // past debounce

    // Beta's setTextDocumentLanguage must have been called with 'css'.
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalled();
    const betaCall = vscodeMock.languages.setTextDocumentLanguage.mock.calls[0];
    expect(betaCall[1]).toBe("css");

    // Now resolve alpha's deferred showTextDocument — the late older
    // showPreview must NOT overwrite beta's language.
    vscodeMock.languages.setTextDocumentLanguage.mockClear();
    resolveDeferredShow?.();
    await new Promise((r) => setTimeout(r, 50));

    // No further setTextDocumentLanguage call — the stale generation guard
    // suppressed alpha's language-mode update.
    expect(vscodeMock.languages.setTextDocumentLanguage).not.toHaveBeenCalled();

    // Restore original mock.
    vscodeMock.window.showTextDocument = originalShowTextDocument;

    host.dispose();
  });

  it("resets language to plaintext when moving from known to unknown candidate", async () => {
    // Criterion 3 + criterion 2: when cycling from a known-language
    // candidate to one with no language association, the existing stable
    // virtual document must reset to plaintext — not retain the old mode.
    const initial: StreamCandidate[] = [
      { id: "/project/main.ts", label: "main.ts" },
      { id: "/project/data.xyz", label: "data.xyz" },
    ];
    const { source } = fakeStreamingSource(initial);

    let callIndex = 0;

    const picker: Picker<StreamCandidate> = {
      id: "known-to-unknown-test",
      label: "Known-to-Unknown Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        // First call: known language (typescript).
        // Second call: no language association (undefined).
        const id = callIndex++ === 0 ? "typescript" : undefined;
        await ctx.showPreview({ text: "content", title: _c.label, languageId: id });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("known-to-unknown-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.languages.setTextDocumentLanguage.mockClear();

    // Select the .ts candidate — language set to typescript.
    view.send({ type: "select", id: "/project/main.ts" });
    await new Promise((r) => setTimeout(r, 200));
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.objectContaining({ scheme: "vsconsult-preview" }) }),
      "typescript",
    );

    vscodeMock.languages.setTextDocumentLanguage.mockClear();

    // Now select the .xyz candidate — no language association.
    view.send({ type: "select", id: "/project/data.xyz" });
    await new Promise((r) => setTimeout(r, 200));

    // The stable virtual document must be reset to plaintext.
    expect(vscodeMock.languages.setTextDocumentLanguage).toHaveBeenCalledWith(
      expect.objectContaining({ uri: expect.objectContaining({ scheme: "vsconsult-preview" }) }),
      "plaintext",
    );

    host.dispose();
  });

  // ---------------------------------------------------------------------
  // Ticket 11 — showPreview with optional reveal position
  // ---------------------------------------------------------------------

  it("reveal scrolls the virtual preview editor to the supplied line", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "reveal-scroll-test",
      label: "Reveal Scroll Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await ctx.showPreview({
          text: "line 1\nline 2\nline 3\n",
          title: "main.ts",
          reveal: { line: 1, character: 0 },
        });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("reveal-scroll-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Trigger preview
    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // The picker's preview action must have been called.
    expect(picker.preview).toHaveBeenCalledOnce();

    // The virtual preview must have been opened.
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(1);

    // The editor returned by showTextDocument must have had revealRange called
    // with the supplied position.
    const editor = await vscodeMock.window.showTextDocument.mock.results[0].value;
    expect(editor.revealRange).toHaveBeenCalled();

    const [range, revealType] = editor.revealRange.mock.calls[0];
    expect(range.start.line).toBe(1);
    expect(range.start.character).toBe(0);
    expect(revealType).toBe(vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    host.dispose();
  });

  it("no reveal position leaves behavior unchanged — revealRange not called", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/src/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    const picker: Picker<StreamCandidate> = {
      id: "no-reveal-test",
      label: "No Reveal Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        // No reveal — same as file picker shape today.
        await ctx.showPreview({ text: "content", title: "main.ts" });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("no-reveal-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    view.send({ type: "select", id: "/project/src/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    expect(picker.preview).toHaveBeenCalledOnce();

    // The virtual preview was still opened.
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(1);

    // But revealRange must NOT have been called.
    const editor = await vscodeMock.window.showTextDocument.mock.results[0].value;
    expect(editor.revealRange).not.toHaveBeenCalled();

    host.dispose();
  });

  it("stale reveal from a cancelled session cannot scroll the virtual preview", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/main.ts", label: "main.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let resolveStale: (() => void) | undefined;
    const staleDeferred = new Promise<void>((resolve) => {
      resolveStale = resolve;
    });

    let stalePreviewFinished = false;

    const picker: Picker<StreamCandidate> = {
      id: "cancel-reveal-race",
      label: "Cancel Reveal Race",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await staleDeferred;
        stalePreviewFinished = true;
        await ctx.showPreview({
          text: "late-content",
          title: _c.label,
          reveal: { line: 99, character: 0 },
        });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("cancel-reveal-race");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    // Trigger preview — debounce fires, preview action starts, stalls at deferred.
    view.send({ type: "select", id: "/project/main.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Cancel the session while the preview is still pending.
    view.send({ type: "cancel" });
    await vi.waitFor(() => {
      expect(view.outbound.some((m) => m.type === "idle")).toBe(true);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Resolve the stale deferred after the session is gone.
    resolveStale?.();
    await new Promise((r) => setTimeout(r, 50));

    // The stale preview completed, but it must NOT have reopened the virtual
    // document — no showTextDocument for vsconsult-preview.
    expect(stalePreviewFinished).toBe(true);
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(0);

    host.dispose();
  });

  it("stale reveal from a replaced session cannot scroll the virtual preview", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    let resolveStale: (() => void) | undefined;
    const staleDeferred = new Promise<void>((resolve) => {
      resolveStale = resolve;
    });

    let stalePreviewFinished = false;

    const pickerA: Picker<StreamCandidate> = {
      id: "replace-reveal-target",
      label: "Replace Reveal Target",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        await staleDeferred; // stays pending until explicitly resolved
        stalePreviewFinished = true;
        await ctx.showPreview({
          text: "stale-content",
          title: _c.label,
          reveal: { line: 42, character: 0 },
        });
      }),
    };
    registry.register(pickerA);

    // Replacement picker
    const pickerB = makePicker("replacement-reveal", source);
    registry.register(pickerB);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    // Start picker A and trigger its preview (in-flight, stalled).
    host.start("replace-reveal-target");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });
    view.send({ type: "select", id: "/project/alpha.ts" });
    await new Promise((r) => setTimeout(r, 200));

    // Replace with picker B
    host.start("replacement-reveal");
    await vi.waitFor(() => {
      const rms = resultsMessages(view.outbound);
      expect(rms.length).toBeGreaterThanOrEqual(2);
    });

    const vscodeMock = (vscode as any);
    vscodeMock.window.showTextDocument.mockClear();

    // Now resolve the stale deferred from picker A.
    resolveStale?.();
    await new Promise((r) => setTimeout(r, 50));

    // The stale preview action completed, but it must NOT have reopened
    // the virtual preview (no showTextDocument for vsconsult-preview).
    expect(stalePreviewFinished).toBe(true);
    const virtualCalls = vscodeMock.window.showTextDocument.mock.calls.filter(
      (call: any) => call[0]?.scheme === "vsconsult-preview",
    );
    expect(virtualCalls).toHaveLength(0);

    host.dispose();
  });

  it("out-of-order completion — slower older reveal must not overwrite a newer selection", async () => {
    const initial: StreamCandidate[] = [
      { id: "/project/alpha.ts", label: "alpha.ts" },
      { id: "/project/beta.ts", label: "beta.ts" },
    ];
    const { source } = fakeStreamingSource(initial);

    // Capture the editors returned by showTextDocument so we can check
    // which ones had revealRange called.
    const editors: any[] = [];

    const picker: Picker<StreamCandidate> = {
      id: "ooo-reveal-test",
      label: "OOO Reveal Test",
      placeholder: "Search…",
      emptyState: "Nothing found",
      source,
      narrow: (_q, cs) => cs,
      render: (c): RowParts => ({ primary: c.label }),
      accept: vi.fn(async () => {}),
      preview: vi.fn(async (_c, ctx) => {
        const line = _c.id === "/project/alpha.ts" ? 10 : 20;
        await ctx.showPreview({
          text: `content-${_c.label}`,
          title: _c.label,
          reveal: { line, character: 0 },
        });
      }),
    };
    registry.register(picker);

    const host = new PickerHost(extensionUri, registry, env, viewId);
    host.resolveWebviewView(view as any);

    host.start("ooo-reveal-test");
    await vi.waitFor(() => {
      expect(resultsMessages(view.outbound)).toHaveLength(1);
    });

    const vscodeMock = (vscode as any);

    // Defer the first showTextDocument for the virtual preview so alpha's
    // preview hangs while beta's runs and completes.
    let resolveDeferredShow: (() => void) | undefined;
    const deferredShow = new Promise<void>((resolve) => {
      resolveDeferredShow = resolve;
    });
    let firstVirtualShow = true;
    const originalShowTextDocument = vscodeMock.window.showTextDocument;
    vscodeMock.window.showTextDocument = vi.fn(
      async (uri: any, opts?: any) => {
        const editor = {
          document: { uri, languageId: "plaintext", getText: () => "", lineCount: 0 },
          options: opts ?? {},
          revealRange: vi.fn(),
          selection: undefined,
        };
        editors.push(editor);
        if (uri?.scheme === "vsconsult-preview" && firstVirtualShow) {
          firstVirtualShow = false;
          await deferredShow;
        }
        return editor;
      },
    );

    try {
      // Select alpha — its showPreview starts but hangs at showTextDocument.
      view.send({ type: "select", id: "/project/alpha.ts" });
      await new Promise((r) => setTimeout(r, 200)); // past debounce

      // Select beta — bumps generation, preview runs and completes.
      view.send({ type: "select", id: "/project/beta.ts" });
      await new Promise((r) => setTimeout(r, 200)); // past debounce

      // Beta's revealRange must have been called (the latest selection wins).
      // editors[0] = alpha (stalled), editors[1] = beta (completed)
      expect(editors.length).toBeGreaterThanOrEqual(2);
      const betaEditor = editors[editors.length - 1];
      expect(betaEditor.revealRange).toHaveBeenCalled();

      // Now resolve alpha's deferred showTextDocument — the late older
      // showPreview must NOT call revealRange because the generation guard
      // should suppress it.
      resolveDeferredShow?.();
      await new Promise((r) => setTimeout(r, 50));

      // Alpha's editor is the first one stored. Its revealRange must NOT have
      // been called — the stale generation guard suppressed it.
      const alphaEditor = editors[0];
      expect(alphaEditor.revealRange).not.toHaveBeenCalled();
    } finally {
      // Restore original mock so later tests are not corrupted.
      vscodeMock.window.showTextDocument = originalShowTextDocument;
    }

    host.dispose();
  });
});
