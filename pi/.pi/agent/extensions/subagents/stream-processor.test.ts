import { describe, it, expect } from "vitest";
import { processStream, type StreamResult } from "./stream-processor";

// Helper: create an async iterable from an array of lines/chunks
async function* linesFrom(lines: string[]): AsyncIterable<string> {
  for (const line of lines) {
    yield line;
  }
}

async function collectStream(lines: string[]): Promise<{
  events: unknown[];
  result: StreamResult;
}> {
  const it = processStream(linesFrom(lines))[Symbol.asyncIterator]();
  const events: unknown[] = [];
  let next = await it.next();
  while (!next.done) {
    events.push(next.value);
    next = await it.next();
  }
  return { events, result: next.value };
}

describe("processStream", () => {
  // ── Slice 1: Tracer Bullet ──
  describe("tracer bullet: agent_start → lifecycle event", () => {
    it("emits a lifecycle event with status started on agent_start", async () => {
      const events = [JSON.stringify({ type: "agent_start" })];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      expect(results.length).toBe(1);
      const event = results[0] as Record<string, unknown>;
      expect(event).toMatchObject({ type: "lifecycle", text: "Subagent started", status: "started" });
      expect(Number.isNaN(Date.parse(event.timestamp as string))).toBe(false);
    });

    it("emits lifecycle only once even with multiple agent_start events", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({ type: "agent_start" }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);
      expect(results.length).toBe(1);
      expect(results[0]).toMatchObject({ type: "lifecycle", status: "started" });
    });
  });

  // ── Slice 2: JSON Validation ──
  describe("JSON validation", () => {
    it("silently skips malformed JSON lines and continues processing", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        "this is not valid json",
        "{also invalid",
        JSON.stringify({ type: "agent_start" }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const lifecycleEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "lifecycle",
      );
      expect(lifecycleEvents.length).toBe(1);
    });

    it("skips empty lines", async () => {
      const events = ["", JSON.stringify({ type: "agent_start" }), ""];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);
      expect(results.length).toBe(1);
      expect(results[0]).toMatchObject({ type: "lifecycle", status: "started" });
    });
  });

  // ── Slice 3: text_delta Accumulation + Sentence Flushing ──
  describe("text_delta accumulation and sentence flushing", () => {
    const textDelta = (delta: string) =>
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta } });

    it("accumulates text_delta content and flushes on sentence boundaries", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        textDelta("Hello "),
        textDelta("world. "),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const assistantEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "assistant_text",
      );
      expect(assistantEvents.length).toBe(1);
      expect(assistantEvents[0]).toMatchObject({ type: "assistant_text", text: "Hello world." });
    });

    it("flushes on ! and ? boundaries", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        textDelta("Wow! "),
        textDelta("Really? "),
        textDelta("Okay."),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const assistantEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "assistant_text",
      );
      expect(assistantEvents.length).toBe(3);
      expect(assistantEvents[0]).toMatchObject({ text: "Wow!" });
      expect(assistantEvents[1]).toMatchObject({ text: "Really?" });
      expect(assistantEvents[2]).toMatchObject({ text: "Okay." });
    });

    it("does not flush incomplete sentences", async () => {
      const events = [JSON.stringify({ type: "agent_start" }), textDelta("Still drafting")];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const assistantEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "assistant_text",
      );
      expect(assistantEvents.length).toBe(0);
    });
  });

  // ── Slice 4: Thinking Suppression ──
  describe("thinking suppression", () => {
    const thinkingEvent = (thinkType: string, delta?: string) =>
      JSON.stringify({ type: "message_update", assistantMessageEvent: { type: thinkType, contentIndex: 0, delta } });

    it("suppresses thinking_delta", async () => {
      const events = [JSON.stringify({ type: "agent_start" }), thinkingEvent("thinking_delta", "secret")];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);
      expect(results.length).toBe(1);
      expect(results[0]).toMatchObject({ type: "lifecycle" });
    });

    it("suppresses thinking_start and thinking_end", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        thinkingEvent("thinking_start"),
        thinkingEvent("thinking_end"),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);
      expect(results.length).toBe(1);
      expect(results[0]).toMatchObject({ type: "lifecycle" });
    });
  });

  // ── Slice 5: message_end — text extraction + usage ──
  describe("message_end text extraction and usage", () => {
    it("extracts text from assistant message content blocks", async () => {
      const { events, result } = await collectStream([
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", content: [{ type: "text", text: "Hello world." }, { type: "thinking", thinking: "x" }] },
        }),
        JSON.stringify({ type: "agent_end", messages: [], willRetry: false }),
      ]);

      expect(events.some((event) => (event as Record<string, unknown>).type === "assistant_text")).toBe(false);
      expect(result).toMatchObject({ done: true, finalText: "Hello world." });
    });

    it("emits a usage event when message.usage is present", async () => {
      const events = [
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", content: [{ type: "text", text: "answer" }], usage: { input: 150, output: 80, cacheRead: 300, cacheWrite: 25 } },
        }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const usageEvents = results.filter((r) => (r as Record<string, unknown>).type === "usage");
      expect(usageEvents.length).toBe(1);
      expect(usageEvents[0]).toMatchObject({ type: "usage", input: 150, output: 80, cacheRead: 300, cacheWrite: 25 });
    });

    it("does not emit usage when message.usage is absent", async () => {
      const events = [
        JSON.stringify({
          type: "message_end",
          message: { role: "assistant", content: [{ type: "text", text: "no usage" }] },
        }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const usageEvents = results.filter((r) => (r as Record<string, unknown>).type === "usage");
      expect(usageEvents.length).toBe(0);
    });
  });

  // ── Slice 6: tool_execution_start ──
  describe("tool_execution_start", () => {
    it("emits a tool event with status started and truncated summary", async () => {
      const events = [
        JSON.stringify({ type: "tool_execution_start", toolCallId: "call_123", toolName: "bash", args: { command: "ls -la /tmp" } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const toolEvents = results.filter((r) => (r as Record<string, unknown>).type === "tool");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({ type: "tool", status: "started" });
      expect((toolEvents[0] as { text: string }).text).toContain("bash");
    });

    it("handles tool_call as alias", async () => {
      const events = [
        JSON.stringify({ type: "tool_call", toolCallId: "call_1", toolName: "read", args: { path: "/tmp/test" } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const toolEvents = results.filter((r) => (r as Record<string, unknown>).type === "tool");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({ type: "tool", status: "started" });
    });

    it("truncates summary to 120 characters", async () => {
      const longArg = "x".repeat(200);
      const events = [
        JSON.stringify({ type: "tool_execution_start", toolCallId: "x", toolName: "bash", args: { command: longArg } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);
      expect((results[0] as { text: string }).text.length).toBeLessThanOrEqual(123);
    });
  });

  // ── Slice 7: tool_execution_end ──
  describe("tool_execution_end", () => {
    it("emits tool event with status succeeded when result.isError is falsy", async () => {
      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "c1", toolName: "bash", result: { content: [{ type: "text", text: "ok" }] } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const toolEvents = results.filter((r) => (r as Record<string, unknown>).type === "tool");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({ type: "tool", status: "succeeded" });
    });

    it("emits tool event with status failed when result.isError is true", async () => {
      const events = [
        JSON.stringify({ type: "tool_execution_end", toolCallId: "c2", toolName: "bash", result: { isError: true, content: [{ type: "text", text: "err" }] } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const toolEvents = results.filter((r) => (r as Record<string, unknown>).type === "tool");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({ type: "tool", status: "failed" });
    });

    it("handles tool_result as alias", async () => {
      const events = [
        JSON.stringify({ type: "tool_result", toolCallId: "c3", toolName: "read", result: { content: [{ type: "text", text: "c" }] } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const toolEvents = results.filter((r) => (r as Record<string, unknown>).type === "tool");
      expect(toolEvents.length).toBe(1);
      expect(toolEvents[0]).toMatchObject({ type: "tool", status: "succeeded" });
    });
  });

  // ── Slice 8: agent_end ──
  describe("agent_end", () => {
    it("emits lifecycle completed event", async () => {
      const events = [
        JSON.stringify({ type: "agent_end", messages: [], willRetry: false }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const lifecycleCompleted = results.find(
        (r) => (r as Record<string, unknown>).type === "lifecycle" && (r as Record<string, unknown>).status === "completed",
      );
      expect(lifecycleCompleted).toBeDefined();
    });

    it("falls back to messages array when message_end not received", async () => {
      const { events, result } = await collectStream([
        JSON.stringify({
          type: "agent_end",
          messages: [{ role: "assistant", content: [{ type: "text", text: "Fallback." }] }],
          willRetry: false,
        }),
      ]);

      const lifecycleCompleted = events.find(
        (r) => (r as Record<string, unknown>).type === "lifecycle" && (r as Record<string, unknown>).status === "completed",
      );
      expect(lifecycleCompleted).toBeDefined();
      expect(result).toMatchObject({ done: true, finalText: "Fallback." });
    });

    it("sums total usage from all messages and emits usage event", async () => {
      const events = [
        JSON.stringify({
          type: "agent_end",
          messages: [
            { role: "assistant", content: [], usage: { input: 100, output: 50, cacheRead: 200, cacheWrite: 10 } },
            { role: "assistant", content: [], usage: { input: 80, output: 40 } },
          ],
          willRetry: false,
        }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const usageEvents = results.filter((r) => (r as Record<string, unknown>).type === "usage");
      expect(usageEvents.length).toBe(1);
      expect(usageEvents[0]).toMatchObject({ input: 180, output: 90, cacheRead: 200, cacheWrite: 10 });
    });

    it("skips null usage fields when summing", async () => {
      const events = [
        JSON.stringify({
          type: "agent_end",
          messages: [
            { role: "assistant", content: [], usage: { input: 50, output: 30 } },
            { role: "assistant", content: [] },
            { role: "assistant", content: [], usage: null },
          ],
          willRetry: false,
        }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const usageEvents = results.filter((r) => (r as Record<string, unknown>).type === "usage");
      expect(usageEvents.length).toBe(1);
      expect(usageEvents[0]).toMatchObject({ input: 50, output: 30 });
    });
  });

  // ── Slice 9: Stream Truncation ──
  describe("stream truncation", () => {
    it("yields error signal with partial text when stream ends without agent_end", async () => {
      const events = [
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({ type: "message_end", message: { role: "assistant", content: [{ type: "text", text: "Partial." }] } }),
      ];
      const it = processStream(linesFrom(events))[Symbol.asyncIterator]();

      // Collect yielded events
      const results: unknown[] = [];
      let result = await it.next();
      while (!result.done) {
        results.push(result.value);
        result = await it.next();
      }
      // result.value is StreamResult
      const streamResult = result.value as { done: boolean; error: string; partialText: string };
      expect(streamResult.done).toBe(false);
      expect(streamResult.error).toContain("truncated");
      expect(streamResult.partialText).toBe("Partial.");
    });

    it("returns empty partialText when no text was captured", async () => {
      const { result } = await collectStream([JSON.stringify({ type: "agent_start" })]);
      expect(result.done).toBe(false);
      expect((result as { partialText: string }).partialText).toBe("");
    });

    it("returns accumulated text_delta content as partialText", async () => {
      const { result } = await collectStream([
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Partial draft" } }),
      ]);
      expect(result.done).toBe(false);
      expect((result as { partialText: string }).partialText).toBe("Partial draft");
    });

    it("returns flushed text_delta content as partialText", async () => {
      const { events, result } = await collectStream([
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Flushed sentence. " } }),
      ]);
      expect(events).toEqual([
        expect.objectContaining({ type: "assistant_text", text: "Flushed sentence." }),
      ]);
      expect(result.done).toBe(false);
      expect((result as { partialText: string }).partialText).toBe("Flushed sentence.");
    });
  });

  // ── Slice 10: Multi-byte + Partial Chunks ──
  describe("multi-byte and partial chunk handling", () => {
    it("handles multi-byte UTF-8 characters in text_delta", async () => {
      const textDelta = (delta: string) =>
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta } });

      const events = [
        JSON.stringify({ type: "agent_start" }),
        textDelta("こんにちは世界。 "), // Japanese: "Hello world."
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const assistantEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "assistant_text",
      );
      expect(assistantEvents.length).toBe(1);
      expect(assistantEvents[0]).toMatchObject({ text: "こんにちは世界。" });
    });

    it("handles lines that arrive as part of a multi-line JSON payload (gracefully)", async () => {
      // Lines are complete NDJSON records; the processor receives complete lines.
      // Test that a line with internal newlines in JSON string values doesn't break parsing.
      const events = [
        JSON.stringify({ type: "agent_start" }),
        JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", contentIndex: 1, delta: "Line 1\nLine 2." } }),
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      const assistantEvents = results.filter(
        (r) => (r as Record<string, unknown>).type === "assistant_text",
      );
      expect(assistantEvents.length).toBe(1);
      expect(assistantEvents[0]).toMatchObject({ text: "Line 1\nLine 2." });
    });

    it("handles partial JSON lines split across chunks", async () => {
      const first = JSON.stringify({ type: "agent_start" });
      const second = JSON.stringify({ type: "message_update", assistantMessageEvent: { type: "text_delta", delta: "Chunked." } });
      const events = [
        first.slice(0, 8),
        `${first.slice(8)}\n${second.slice(0, 30)}`,
        `${second.slice(30)}\n`,
      ];
      const stream = processStream(linesFrom(events));
      const results: unknown[] = [];
      for await (const event of stream) results.push(event);

      expect(results).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "lifecycle", status: "started" }),
        expect.objectContaining({ type: "assistant_text", text: "Chunked." }),
      ]));
    });
  });
});
