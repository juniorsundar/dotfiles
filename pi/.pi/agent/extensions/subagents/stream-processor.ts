import type { ProgressEvent } from "./tail-progress";

export type StreamResult =
  | { done: true; finalText: string }
  | { done: false; error: string; partialText: string };

/**
 * Process stdout from `pi --mode json`, yielding typed progress events and
 * returning the final assistant text as the generator's terminal value.
 *
 * Input may be either complete NDJSON lines or arbitrary string chunks. The
 * processor is pure: it does not read or write files, and callers are
 * responsible for persisting raw events, progress events, logs, and output.
 */
export async function* processStream(
  input: AsyncIterable<string>,
): AsyncGenerator<ProgressEvent, StreamResult> {
  let lifecycleStartedEmitted = false;
  let textBuffer = "";
  let streamedText = "";
  let finalText = "";
  let pending = "";

  const emitParsed = function* (
    parsed: Record<string, unknown>,
  ): Generator<ProgressEvent, StreamResult | undefined> {
    const eventType = stringValue(parsed.type);

    if (eventType === "agent_start") {
      if (!lifecycleStartedEmitted) {
        lifecycleStartedEmitted = true;
        yield lifecycleEvent("started", "Subagent started");
      }
      return undefined;
    }

    if (eventType === "message_update") {
      const assistantEvent = objectValue(parsed.assistantMessageEvent);
      const subType = stringValue(assistantEvent?.type);

      if (subType === "text_delta") {
        const delta = stringValue(assistantEvent?.delta);
        textBuffer += delta;
        streamedText += delta;
        for (const sentence of flushCompletedSentences()) {
          yield {
            type: "assistant_text",
            text: sentence,
            timestamp: timestamp(),
          };
        }
      }

      // thinking_delta, thinking_start, thinking_end, and unknown sub-events are
      // intentionally suppressed to match the old stream-filter.sh behavior.
      return undefined;
    }

    if (eventType === "message_end") {
      const message = objectValue(parsed.message);
      if (stringValue(message?.role) === "assistant") {
        finalText = extractTextContent(message?.content);
      }

      const usage = usageValue(message?.usage);
      if (usage) {
        yield usageEvent(usage);
      }
      return undefined;
    }

    if (eventType === "tool_execution_start" || eventType === "tool_call") {
      yield {
        type: "tool",
        text: toolSummary(parsed),
        timestamp: timestamp(),
        status: "started",
      };
      return undefined;
    }

    if (eventType === "tool_execution_end" || eventType === "tool_result") {
      const toolName = stringValue(parsed.toolName) || "?";
      const result = objectValue(parsed.result);
      const isError = Boolean(result?.isError);
      yield {
        type: "tool",
        text: isError ? `Tool ${toolName} failed` : `Tool ${toolName} succeeded`,
        timestamp: timestamp(),
        status: isError ? "failed" : "succeeded",
      };
      return undefined;
    }

    if (eventType === "agent_end") {
      if (!finalText) {
        finalText = extractFinalTextFromMessages(parsed.messages);
      }

      yield lifecycleEvent("completed", "Subagent completed");

      const usage = sumUsageFromMessages(parsed.messages);
      if (usage && usageTotal(usage) > 0) {
        yield usageEvent(usage);
      }

      return { done: true, finalText };
    }

    // Unknown valid JSON event types are intentionally ignored.
    return undefined;
  };

  const processLine = function* (
    line: string,
  ): Generator<ProgressEvent, StreamResult | undefined> {
    if (line.length === 0) return undefined;

    const parsed = parseJsonObject(line);
    if (!parsed) return undefined;

    const result = yield* emitParsed(parsed);
    return result;
  };

  for await (const chunk of input) {
    const text = String(chunk);
    if (text.length === 0) continue;

    // Explicit NDJSON chunks: process every complete newline-terminated record
    // and keep the last partial line for the next chunk.
    if (text.includes("\n") || pending.includes("\n")) {
      const parts = (pending + text).split(/\r?\n/);
      pending = parts.pop() ?? "";
      for (const part of parts) {
        const result = yield* processLine(part);
        if (result) return result;
      }
      continue;
    }

    // Backward-compatible path for callers/tests that pass one complete line at
    // a time without trailing newlines. If concatenating pending + text forms a
    // JSON record, process it. Otherwise, if the new chunk is independently a
    // JSON record, treat the pending text as malformed and skip it.
    const combined = pending + text;
    if (parseJsonObject(combined)) {
      const result = yield* processLine(combined);
      pending = "";
      if (result) return result;
      continue;
    }

    if (pending && parseJsonObject(text)) {
      const result = yield* processLine(text);
      pending = "";
      if (result) return result;
      continue;
    }

    pending = combined;
  }

  if (pending.length > 0) {
    const result = yield* processLine(pending);
    if (result) return result;
  }

  return {
    done: false,
    error: "Stream truncated: no agent_end event received",
    partialText: finalText || streamedText.trim(),
  };

  function flushCompletedSentences(): string[] {
    const sentences: string[] = [];
    const boundary = /([^.!?。！？]+[.!?。！？])(?:\s|$)/gu;
    let match: RegExpExecArray | null;
    let lastFlushEnd = 0;

    while ((match = boundary.exec(textBuffer)) !== null) {
      const sentence = match[1].trim();
      if (sentence.length > 0) {
        sentences.push(sentence);
      }
      lastFlushEnd = match.index + match[0].length;
    }

    if (lastFlushEnd > 0) {
      textBuffer = textBuffer.slice(lastFlushEnd);
    }

    return sentences;
  }
}

function parseJsonObject(line: string): Record<string, unknown> | undefined {
  if (line.length === 0) return undefined;
  try {
    const parsed = JSON.parse(line) as unknown;
    return objectValue(parsed) ?? undefined;
  } catch {
    // Malformed JSON is skipped silently; callers may log raw invalid lines.
    return undefined;
  }
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface Usage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

function usageValue(value: unknown): Usage | undefined {
  const usage = objectValue(value);
  if (!usage) return undefined;
  return {
    input: numberValue(usage.input),
    output: numberValue(usage.output),
    cacheRead: numberValue(usage.cacheRead),
    cacheWrite: numberValue(usage.cacheWrite),
  };
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function usageTotal(usage: Usage): number {
  return usage.input + usage.output + usage.cacheRead + usage.cacheWrite;
}

function usageEvent(usage: Usage): ProgressEvent {
  return {
    type: "usage",
    text: `Tokens: ${usage.input} input, ${usage.output} output, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write`,
    timestamp: timestamp(),
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
  };
}

function lifecycleEvent(
  status: "started" | "completed",
  text: string,
): ProgressEvent {
  return {
    type: "lifecycle",
    text,
    timestamp: timestamp(),
    status,
  };
}

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content
    .map((block) => objectValue(block))
    .filter((block): block is Record<string, unknown> =>
      Boolean(block && block.type === "text"),
    )
    .map((block) => stringValue(block.text))
    .join("\n");
}

function extractFinalTextFromMessages(messagesValue: unknown): string {
  if (!Array.isArray(messagesValue)) return "";

  for (let i = messagesValue.length - 1; i >= 0; i--) {
    const message = objectValue(messagesValue[i]);
    if (stringValue(message?.role) !== "assistant") continue;

    const text = extractTextContent(message?.content);
    if (text) return text;
  }

  return "";
}

function sumUsageFromMessages(messagesValue: unknown): Usage | undefined {
  if (!Array.isArray(messagesValue)) return undefined;

  const total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  for (const messageValue of messagesValue) {
    const message = objectValue(messageValue);
    const usage = usageValue(message?.usage);
    if (!usage) continue;

    total.input += usage.input;
    total.output += usage.output;
    total.cacheRead += usage.cacheRead;
    total.cacheWrite += usage.cacheWrite;
  }

  return total;
}

function toolSummary(parsed: Record<string, unknown>): string {
  const toolName = stringValue(parsed.toolName) || "?";
  const args = parsed.args ?? {};
  let argsText: string;
  try {
    argsText = JSON.stringify(args);
  } catch {
    argsText = "{}";
  }

  let summary = `[${toolName}] ${argsText}`;
  if (summary.length > 120) {
    summary = `${summary.slice(0, 117)}...`;
  }
  return summary;
}

function timestamp(): string {
  return new Date().toISOString();
}
