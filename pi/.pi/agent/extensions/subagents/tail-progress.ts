import { statSync, readFileSync, existsSync } from "fs";

export interface ProgressEvent {
  type: "lifecycle" | "tool" | "assistant_text" | "terminal" | "usage";
  text: string;
  timestamp: string;
  status?: "started" | "succeeded" | "failed" | "completed";
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export interface TailProgressOptions {
  signal?: AbortSignal;
  pollIntervalMs?: number;
}

/**
 * Tail a progress.jsonl file, yielding ProgressEvents as they are appended.
 * Starts before the file exists and begins emitting after it appears.
 * Best-effort: errors parsing individual lines are silently ignored.
 * Cancellable via AbortSignal.
 */
export async function* tailProgress(
  filePath: string,
  options: TailProgressOptions = {},
): AsyncIterable<ProgressEvent> {
  const { signal, pollIntervalMs = 100 } = options;

  // Wait for file to exist
  while (!existsSync(filePath)) {
    if (signal?.aborted) return;
    await sleep(pollIntervalMs, signal);
  }

  let readOffset = 0; // byte offset up to where we've read from the file
  let partialBuffer = ""; // unprocessed content buffered from last read

  while (true) {
    if (signal?.aborted) return;

    let currentSize: number;
    try {
      currentSize = statSync(filePath).size;
    } catch {
      // File may have been deleted between existsSync and statSync
      await sleep(pollIntervalMs, signal);
      continue;
    }

    // Handle truncation: reset state if file shrank
    if (currentSize < readOffset) {
      readOffset = 0;
      partialBuffer = "";
    }

    if (currentSize > readOffset) {
      // Read new bytes since last read position (TOCTOU-safe: catch if file disappears).
      // Uses Buffer (not utf-8 string) so byte offsets match statSync().size exactly,
      // even with non-ASCII content.
      let newBytes: string;
      try {
        const buf = readFileSync(filePath);
        newBytes = buf.subarray(readOffset).toString("utf-8");
      } catch {
        // File may have been deleted between statSync and readFileSync
        await sleep(pollIntervalMs, signal);
        continue;
      }
      readOffset = currentSize;

      // Combine with any partial from previous read
      const combined = partialBuffer + newBytes;

      // Split into lines — last element may be partial (no trailing newline)
      const lines = combined.split("\n");

      // Process all complete lines (everything except the last element)
      for (let i = 0; i < lines.length - 1; i++) {
        const line = lines[i];
        if (line.length === 0) continue;
        try {
          const parsed = JSON.parse(line);
          // Runtime shape validation: ensure required fields are present
          if (typeof parsed.type === "string" && typeof parsed.text === "string" && typeof parsed.timestamp === "string") {
            yield parsed as ProgressEvent;
          } else {
            console.warn(
              `[tail-progress] Skipping event with missing fields in ${filePath}: ${line.slice(0, 80)}`,
            );
          }
        } catch {
          // Invalid JSON — warn for diagnostics, then continue
          console.warn(
            `[tail-progress] Skipping invalid JSON line in ${filePath}: ${line.slice(0, 80)}`,
          );
        }
      }

      // The last element is either a partial line or empty (if content ended with newline)
      partialBuffer = lines[lines.length - 1];
    }

    await sleep(pollIntervalMs, signal);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }
  });
}
