import type { ProgressEvent } from "./tail-progress";
import { cleanDisplayText } from "./activity-feed-tool-formatting";

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
  let thinkingBuffer = "";
  let thinkingBlockSawDelta = false;
  let streamedText = "";
  let finalText = "";
  let pending = "";
  const startedToolIds = new Set<string>();
  const completedToolIds = new Set<string>();

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
        streamedText += delta;
      }

      if (subType === "thinking_start") {
        thinkingBuffer = "";
        thinkingBlockSawDelta = false;
      }

      if (subType === "thinking_delta") {
        const delta = stringValue(assistantEvent?.delta);
        if (delta) thinkingBlockSawDelta = true;
        thinkingBuffer += delta;
        const drained = drainReadableChunks(thinkingBuffer);
        thinkingBuffer = drained.rest;
        for (const thought of drained.chunks) {
          yield {
            type: "thinking",
            text: thought,
            timestamp: timestamp(),
          };
        }
      }

      if (subType === "thinking_end") {
        const content = stringValue(assistantEvent?.content);
        if (!thinkingBlockSawDelta && !thinkingBuffer && content) {
          thinkingBuffer = content;
        }
        const drained = drainReadableChunks(thinkingBuffer, { force: true });
        thinkingBuffer = drained.rest;
        for (const thought of drained.chunks) {
          yield {
            type: "thinking",
            text: thought,
            timestamp: timestamp(),
          };
        }
      }

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
      const toolCallId = stringValue(parsed.toolCallId) || stringValue(parsed.id);
      if (toolCallId && startedToolIds.has(toolCallId)) {
        return undefined;
      }
      if (toolCallId) {
        startedToolIds.add(toolCallId);
      }
      yield {
        type: "tool",
        text: toolStartSummary(parsed),
        timestamp: timestamp(),
        status: "started",
        toolCallId: toolCallId || undefined,
        toolName: stringValue(parsed.toolName) || undefined,
        toolArgs: objectValue(parsed.args) ?? objectValue(parsed.input),
      };
      return undefined;
    }

    if (eventType === "tool_execution_update") {
      const toolName = stringValue(parsed.toolName) || "?";
      const preview = toolResultPreview(parsed);
      const toolCallId = stringValue(parsed.toolCallId) || stringValue(parsed.id);
      if (preview) {
        yield {
          type: "tool",
          text: truncateDisplayText(`${toolName} output → ${preview}`, 220),
          timestamp: timestamp(),
          status: "started",
          toolCallId: toolCallId || undefined,
          toolName: stringValue(parsed.toolName) || undefined,
          toolResultPreview: preview || undefined,
        };
      }
      return undefined;
    }

    if (eventType === "tool_execution_end" || eventType === "tool_result") {
      const toolCallId = stringValue(parsed.toolCallId) || stringValue(parsed.id);
      if (toolCallId && completedToolIds.has(toolCallId)) {
        return undefined;
      }
      if (toolCallId) {
        completedToolIds.add(toolCallId);
      }
      const toolName = stringValue(parsed.toolName) || "?";
      const result = objectValue(parsed.result);
      const isError = Boolean(parsed.isError ?? result?.isError);
      const preview = toolResultPreview(parsed);
      yield {
        type: "tool",
        text: toolCompletionSummary(toolName, parsed, isError),
        timestamp: timestamp(),
        status: isError ? "failed" : "succeeded",
        toolCallId: toolCallId || undefined,
        toolName: stringValue(parsed.toolName) || undefined,
        toolResultPreview: preview || undefined,
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

  function drainReadableChunks(
    buffer: string,
    options: { force?: boolean } = {},
  ): { chunks: string[]; rest: string } {
    const chunks: string[] = [];
    const boundary = /([^.!?。！？]+[.!?。！？])(?:\s|$)/gu;
    let match: RegExpExecArray | null;
    let lastFlushEnd = 0;

    while ((match = boundary.exec(buffer)) !== null) {
      const chunk = cleanDisplayText(match[1]);
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      lastFlushEnd = match.index + match[0].length;
    }

    let rest = lastFlushEnd > 0 ? buffer.slice(lastFlushEnd) : buffer;

    if (!options.force && rest.length > 240) {
      const splitAt = chooseSplitPoint(rest, 220);
      const chunk = cleanDisplayText(rest.slice(0, splitAt));
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      rest = rest.slice(splitAt);
    }

    if (options.force) {
      const chunk = cleanDisplayText(rest);
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
      rest = "";
    }

    return { chunks, rest };
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

function toolStartSummary(parsed: Record<string, unknown>): string {
  const toolName = stringValue(parsed.toolName) || "?";
  const args = objectValue(parsed.args) ?? objectValue(parsed.input) ?? {};
  return truncateDisplayText(`${toolName}: ${toolArgPreview(args)}`, 180);
}

function toolArgPreview(args: Record<string, unknown>): string {
  const preview =
    stringValue(args.command) ||
    stringValue(args.path) ||
    stringValue(args.file) ||
    stringValue(args.pattern) ||
    stringValue(args.query) ||
    stringValue(args.url) ||
    stringValue(args.prompt) ||
    stringValue(args.task) ||
    stringValue(args.subject);

  return preview ? cleanDisplayText(preview) : cleanDisplayText(JSON.stringify(args));
}

function toolCompletionSummary(
  toolName: string,
  parsed: Record<string, unknown>,
  isError: boolean,
): string {
  const preview = toolResultPreview(parsed);
  const verb = isError ? "failed" : "completed";
  return preview
    ? truncateDisplayText(`${toolName} ${verb} → ${preview}`, 220)
    : `${toolName} ${verb}`;
}

function toolResultPreview(parsed: Record<string, unknown>): string {
  const result = objectValue(parsed.result) ?? objectValue(parsed.partialResult);
  const resultError = objectValue(result?.error);
  const parsedError = objectValue(parsed.error);
  const text =
    extractTextContent(result?.content) ||
    extractTextContent(parsed.content) ||
    stringValue(result?.content) ||
    stringValue(parsed.content) ||
    stringValue(result?.error) ||
    stringValue(resultError?.message) ||
    stringValue(result?.message) ||
    stringValue(result?.stderr) ||
    stringValue(parsed.error) ||
    stringValue(parsedError?.message) ||
    stringValue(parsed.message);
  return truncateDisplayText(cleanDisplayText(text), 180);
}

function truncateDisplayText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function chooseSplitPoint(value: string, preferred: number): number {
  if (value.length <= preferred) return value.length;
  const whitespace = value.lastIndexOf(" ", preferred);
  return whitespace > 80 ? whitespace : preferred;
}

function timestamp(): string {
  return new Date().toISOString();
}
