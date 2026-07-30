import type { SourceSession } from "./picker/source.js";
import type { GrepCandidate } from "./picker/types.js";

export interface RipgrepSpawner {
  rgPath: string;
  spawn(
    rgPath: string,
    args: string[],
    opts: { cwd: string; stdio?: any },
  ): ChildProcessLike;
}

export interface ChildProcessLike {
  stdout: { on(event: "data", cb: (chunk: Buffer) => void): void };
  stderr: { on(event: "data", cb: (chunk: Buffer) => void): void };
  on(
    event: "close",
    cb: (code: number | null, signal: string | null) => void,
  ): void;
  kill(signal?: string): void;
}

/**
 * Creates a searchWorkspace(query, signal) primitive backed by the
 * provided RipgrepSpawner. In production the spawner wraps the real
 * `child_process.spawn` with `rgPath` from `@vscode/ripgrep`; tests
 * supply a fake child process that emits canned lines.
 *
 * @param spawner The ripgrep binary path and spawn factory.
 * @param cwd   Workspace-root directory for the child process and for
 *               resolving absolute paths from ripgrep-relative paths.
 */
export function createSearchWorkspace(
  spawner: RipgrepSpawner,
  cwd: string,
  debounceMs = 150,
  excludes?: readonly string[],
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let nextResolve: ((value: void) => void) | undefined;

  return (
    query: string,
    signal: AbortSignal,
  ): SourceSession<GrepCandidate> => {
    // Empty query → empty snapshot, never spawn.
    if (query === "") {
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      return { candidates: [] };
    }

    // Binary unavailable — error, no in-JS fallback (ADR-0005).
    if (!spawner.rgPath) {
      throw new Error("ripgrep binary not found — cannot search workspace");
    }

    // Cancel a pending debounce from the previous keystroke.
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }

    const updates = (async function* () {
      // Wait for the debounce window. If a newer call arrives before
      // this resolves, the timer is replaced and this generator hangs
      // (abandoned by the host).
      await new Promise<void>((resolve) => {
        nextResolve = resolve;
        timer = setTimeout(() => {
          timer = undefined;
          resolve();
        }, debounceMs);
      });

      // Only spawn if we haven't been superseded by a newer call.
      // (If nextResolve was replaced, a newer generator is waiting.)
      yield* streamMatches(spawner, cwd, query, signal, excludes);
    })();

    return { candidates: [], updates };
  };
}

/**
 * Async generator that spawns ripgrep, parses `rg --json` match
 * objects, and yields one-candidate batches as they arrive.
 *
 * Non-match events (`begin`, `end`, `summary`) are silently skipped.
 * Malformed JSON lines are skipped (non-fatal).
 */
async function* streamMatches(
  spawner: RipgrepSpawner,
  cwd: string,
  query: string,
  signal: AbortSignal,
  excludes?: readonly string[],
): AsyncGenerator<GrepCandidate[], void, undefined> {
  // If already aborted, return immediately without spawning.
  if (signal.aborted) return;

  // Build args: rg --json <query> with optional exclude globs.
  const args = ["--json"];
  if (excludes) {
    for (const pattern of excludes) {
      args.push("--glob", `!${pattern}`);
    }
  }
  args.push(query);

  const child = spawner.spawn(spawner.rgPath, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  });

  // A queue of candidate batches waiting to be yielded.
  const queue: GrepCandidate[][] = [];
  // Resolver for the async generator when the queue is empty.
  let nextResolve: ((value: void) => void) | null = null;
  let closed = false;

  const enqueueBatch = (batch: GrepCandidate[]): void => {
    if (batch.length === 0) return;
    if (nextResolve) {
      queue.push(batch);
      nextResolve();
      nextResolve = null;
    } else {
      queue.push(batch);
    }
  };

  const settle = (): void => {
    if (closed) return;
    closed = true;
    if (nextResolve) {
      nextResolve();
      nextResolve = null;
    }
  };

  let buffer = "";
  let pendingBatch: GrepCandidate[] = [];

  child.on("close", () => {
    // Flush remaining buffer as one last candidate.
    if (buffer.trim().length > 0) {
      const candidate = parseMatchLine(buffer.trim(), cwd);
      if (candidate) pendingBatch.push(candidate);
    }
    // Emit any trailing batch, then settle.
    enqueueBatch(pendingBatch);
    settle();
  });

  // Propagate abort to the child process and end the stream.
  // Clear any batches that were enqueued but not yet yielded — they
  // must not be emitted after the caller has aborted.
  signal.addEventListener("abort", () => {
    child.kill();
    queue.length = 0;
    settle();
  });

  child.stdout.on("data", (chunk: Buffer) => {
    if (closed) return;
    buffer += chunk.toString("utf8");
    const lines = buffer.split("\n");
    // The last element may be an incomplete line; keep it in the buffer.
    buffer = lines.pop()!;

    for (const line of lines) {
      if (line.length === 0) continue;
      const candidate = parseMatchLine(line, cwd);
      if (candidate) pendingBatch.push(candidate);
    }

    enqueueBatch(pendingBatch);
    pendingBatch = [];
  });

  const waitNext = (): Promise<void> => {
    if (queue.length > 0) return Promise.resolve();
    if (closed) return Promise.resolve();
    return new Promise<void>((resolve) => {
      nextResolve = resolve;
    });
  };

  while (true) {
    await waitNext();
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (closed) break;
  }
}

// ---- rg --json match parser ----

interface RgMatchObject {
  type: string;
  data: {
    path?: { text: string };
    lines?: { text: string };
    line_number?: number;
    absolute_offset?: number;
    submatches?: Array<{
      match: { text: string };
      start: number;
      end: number;
    }>;
  };
}

/**
 * Parses one `rg --json` line. Returns a GrepCandidate if the line is
 * a `type: "match"` object with the required fields, or undefined for
 * non-match events and malformed lines.
 */
function parseMatchLine(
  line: string,
  cwd: string,
): GrepCandidate | undefined {
  let obj: RgMatchObject;
  try {
    obj = JSON.parse(line) as RgMatchObject;
  } catch {
    return undefined;
  }

  if (obj.type !== "match") return undefined;

  const pathText = obj.data?.path?.text;
  const lineText = obj.data?.lines?.text;
  const lineNumber = obj.data?.line_number;
  if (pathText === undefined || lineText === undefined || lineNumber === undefined) {
    return undefined;
  }

  // ripgrep submatches[0].start is 0-based; column is 1-based.
  const column =
    obj.data.submatches && obj.data.submatches.length > 0
      ? obj.data.submatches[0].start + 1
      : 1;

  const relativePath = pathText;
  // Ripgrep reports paths relative to cwd when spawned with cwd set.
  const absolutePath = cwd.endsWith("/")
    ? `${cwd}${relativePath}`
    : `${cwd}/${relativePath}`;

  return {
    id: `${relativePath}:${lineNumber}:${column}`,
    label: lineText,
    relativePath,
    absolutePath,
    lineNumber,
    column,
  };
}
