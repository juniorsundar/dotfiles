import { describe, expect, it, vi } from "vitest";

import {
  EXCERPT_MAX_BYTES,
  FULL_PREVIEW_MAX_BYTES,
  readPreviewContent,
  type PreviewFilePrimitives,
} from "./previewContent.js";

// ---------------------------------------------------------------------------
// Independent source of truth: byte limits from the spec, not derived from
// the implementation under test.
// ---------------------------------------------------------------------------

const ONE_MIB = 1024 * 1024; // 1 MiB — spec literal

function fakePrimitives(overrides?: Partial<PreviewFilePrimitives>): {
  primitives: PreviewFilePrimitives;
  readBytesCalls: { path: string; maxBytes: number }[];
} {
  const readBytesCalls: { path: string; maxBytes: number }[] = [];
  const primitives: PreviewFilePrimitives = {
    stat: overrides?.stat ?? vi.fn(async () => ({ size: 0 })),
    readBytes: overrides?.readBytes ?? vi.fn(async () => new Uint8Array()),
    decode: overrides?.decode,
  };
  // Wrap readBytes to record the requested cap (bounded I/O observability).
  const origReadBytes = primitives.readBytes;
  primitives.readBytes = async (path, maxBytes) => {
    readBytesCalls.push({ path, maxBytes });
    return origReadBytes(path, maxBytes);
  };
  return { primitives, readBytesCalls };
}

// ---------------------------------------------------------------------------
// Slice 1 — Files up to and including 1 MiB receive a complete textual preview
// ---------------------------------------------------------------------------

describe("readPreviewContent — small/ordinary files (<= 1 MiB)", () => {
  it("returns the complete decoded text and marks the preview as not truncated", async () => {
    const content = "export function add(a, b) { return a + b; }\n";
    const bytes = Buffer.from(content, "utf8");
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: bytes.length })),
      readBytes: vi.fn(async () => bytes),
    });

    const result = await readPreviewContent("/project/src/add.ts", primitives);

    expect(result.text).toBe(content);
    expect(result.truncated).toBe(false);
    expect(result.binary).toBe(false);
    expect(result.error).toBeUndefined();
    expect(result.size).toBe(bytes.length);
    // stat then a single bounded read
    expect(primitives.stat).toHaveBeenCalledOnce();
    expect(readBytesCalls).toHaveLength(1);
    // The byte cap passed to readBytes is bounded by the full-preview cap.
    expect(readBytesCalls[0]!.maxBytes).toBeLessThanOrEqual(ONE_MIB);
  });

  it("at the exact 1 MiB boundary still returns a complete, untruncated preview", async () => {
    const bytes = Buffer.alloc(ONE_MIB, 0x41); // 'A' repeated
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: ONE_MIB })),
      readBytes: vi.fn(async () => bytes),
    });

    const result = await readPreviewContent("/project/big.txt", primitives);

    expect(result.size).toBe(ONE_MIB);
    expect(result.truncated).toBe(false);
    expect(result.text).toHaveLength(ONE_MIB);
    // Independent byte-limit check: the full-preview constant matches spec.
    expect(FULL_PREVIEW_MAX_BYTES).toBe(ONE_MIB);
  });
});

// ---------------------------------------------------------------------------
// Slice 2 — Files larger than 1 MiB read at most the first 512 KiB and show
// a clear truncation notice. The read is bounded: the primitive is never
// asked for more than 512 KiB, and the implementation never loads the whole
// file only to truncate it afterward.
// ---------------------------------------------------------------------------

describe("readPreviewContent — large files (> 1 MiB)", () => {
  it("reads no more than the first 512 KiB and marks the preview truncated", async () => {
    const HALF_MIB = 512 * 1024; // 512 KiB — spec literal (independent)
    const fileSize = ONE_MIB + 4096; // larger than the full-preview cap
    // Only the first 512 KiB will be requested; return exactly that many bytes.
    const excerpt = Buffer.alloc(HALF_MIB, 0x41); // 'A'
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: fileSize })),
      readBytes: vi.fn(async (_path, maxBytes) => excerpt.subarray(0, maxBytes)),
    });

    const result = await readPreviewContent("/project/huge.txt", primitives);

    // Independent byte-limit assertion: never asked for more than 512 KiB.
    expect(readBytesCalls).toHaveLength(1);
    expect(readBytesCalls[0]!.maxBytes).toBe(HALF_MIB);
    // The excerpt cap constant matches the spec literal.
    expect(EXCERPT_MAX_BYTES).toBe(HALF_MIB);
    // Truncated flag is set.
    expect(result.truncated).toBe(true);
    expect(result.size).toBe(fileSize);
    // The body is the excerpt itself (the truncation notice is exposed
    // separately so callers can compose it without re-deriving it).
    expect(result.text).toHaveLength(HALF_MIB);
  });

  it("exposes a clear truncation notice string that callers compose into the payload", async () => {
    const fileSize = ONE_MIB + 1;
    const excerpt = Buffer.alloc(EXCERPT_MAX_BYTES, 0x41);
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: fileSize })),
      readBytes: vi.fn(async (_p, n) => excerpt.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/huge.txt", primitives);

    expect(result.truncated).toBe(true);
    // The notice is observable on the result so it cannot be silently dropped.
    expect(result.truncationNotice).toBeTruthy();
    expect(typeof result.truncationNotice).toBe("string");
    // It must mention both that content is truncated and the file's true size,
    // so a user cannot mistake the excerpt for the complete file.
    expect(result.truncationNotice).toMatch(/truncat/i);
    expect(result.truncationNotice).toContain(String(fileSize));
  });
});

// ---------------------------------------------------------------------------
// Slice 3 — A multibyte UTF-8 character crossing the excerpt boundary is
// decoded safely. The expected text comes from an independently constructed
// fixture (a known-good string), not recomputed by the same slicing logic.
// ---------------------------------------------------------------------------

describe("readPreviewContent — UTF-8 boundary safety", () => {
  it("trims an incomplete trailing multibyte sequence so the excerpt is valid UTF-8", async () => {
    // Worked example: 524287 ASCII bytes, then the 3-byte char "€"
    // (U+20AC -> 0xE2 0x82 0xAC) starting at byte index 524287, then enough
    // padding to push the file past the 1 MiB full-preview cap so it is
    // truncated. We read EXCERPT_MAX_BYTES (524288), which includes only the
    // first byte (0xE2) of "€".
    const prefix = "A".repeat(524287);
    const euro = "€"; // 3 UTF-8 bytes
    const padding = "B".repeat(600_000); // pushes total size > 1 MiB
    const full = Buffer.from(prefix + euro + padding, "utf8");
    expect(full.length).toBeGreaterThan(ONE_MIB); // sanity

    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: full.length })),
      readBytes: vi.fn(async (_p, n) => full.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/utf8-boundary.txt", primitives);

    // The byte cap is the excerpt limit.
    expect(readBytesCalls[0]!.maxBytes).toBe(EXCERPT_MAX_BYTES);
    expect(result.truncated).toBe(true);
    // Independent expected value: the known-good prefix only. The incomplete
    // 0xE2 must NOT survive as a U+FFFD replacement character.
    const expected = prefix;
    expect(result.text).toBe(expected);
    // The result round-trips as valid UTF-8 (no replacement char introduced).
    expect(result.text).not.toContain("\uFFFD");
    expect(Buffer.from(result.text, "utf8").toString("utf8")).toBe(result.text);
  });

  it("keeps a multibyte char that ends exactly on the excerpt boundary", async () => {
    // 524285 ASCII bytes + "€" (3 bytes) -> char ends exactly at byte 524288.
    const prefix = "A".repeat(524285);
    const euro = "€";
    const padding = "B".repeat(600_000);
    const full = Buffer.from(prefix + euro + padding, "utf8");
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: full.length })),
      readBytes: vi.fn(async (_p, n) => full.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/utf8-exact.txt", primitives);

    expect(result.truncated).toBe(true);
    // The complete char is included.
    expect(result.text).toBe(prefix + euro);
    expect(result.text).not.toContain("\uFFFD");
  });
});

// ---------------------------------------------------------------------------
// Slice 4 — Binary-looking content displays metadata and an explanatory
// fallback rather than corrupted text. Detection is explicitly best-effort
// per ADR 0004.
// ---------------------------------------------------------------------------

describe("readPreviewContent — binary-looking content", () => {
  it("flags a NUL-containing file as binary and returns an explanatory fallback, not raw bytes", async () => {
    // Independent known fixture: a few printable bytes then a NUL byte.
    const bytes = Buffer.from("PK\x03\x04\x00\x00binary\x00junk", "latin1");
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: bytes.length })),
      readBytes: vi.fn(async () => bytes),
    });

    const result = await readPreviewContent("/project/asset.bin", primitives);

    expect(result.binary).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.size).toBe(bytes.length);
    // The displayed text is an explanatory fallback, NOT the raw bytes.
    expect(result.text).not.toContain("\x00");
    // It conveys both that the file is binary and its size (metadata).
    expect(result.text).toMatch(/binary/i);
    expect(result.text).toContain(String(bytes.length));
    expect(result.text).toContain("/project/asset.bin");
  });

  it("does not flag an all-printable text file as binary", async () => {
    const bytes = Buffer.from("hello world\nplain text file\n", "utf8");
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: bytes.length })),
      readBytes: vi.fn(async () => bytes),
    });

    const result = await readPreviewContent("/project/hello.txt", primitives);

    expect(result.binary).toBe(false);
    expect(result.text).toBe("hello world\nplain text file\n");
  });
});

// ---------------------------------------------------------------------------
// Slice 5 — Stat, read, and decode failures are non-fatal and leave the
// picker usable. readPreviewContent returns an error result rather than
// throwing, so a failed candidate does not end the picker session.
// ---------------------------------------------------------------------------

describe("readPreviewContent — non-fatal errors", () => {
  it("returns an error result when stat rejects, without throwing", async () => {
    const statErr = Object.assign(new Error("ENOENT: no such file"), {
      code: "ENOENT",
    });
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => {
        throw statErr;
      }),
      readBytes: vi.fn(async () => new Uint8Array()),
    });

    const result = await readPreviewContent("/project/missing.txt", primitives);

    expect(result.error).toBeTruthy();
    expect(typeof result.error).toBe("string");
    expect(result.text).toBe(result.error); // the fallback *is* the message
    expect(result.binary).toBe(false);
    expect(result.truncated).toBe(false);
    // No size was reported because stat failed.
    expect(result.size).toBe(0);
    // readBytes must not be called when stat already failed.
    expect(readBytesCalls).toHaveLength(0);
  });

  it("returns an error result when read rejects, without throwing", async () => {
    const readErr = Object.assign(new Error("EACCES: permission denied"), {
      code: "EACCES",
    });
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: 100 })),
      readBytes: vi.fn(async () => {
        throw readErr;
      }),
    });

    const result = await readPreviewContent("/project/locked.txt", primitives);

    expect(result.error).toBeTruthy();
    expect(result.error).toContain("permission denied");
    expect(result.text).toBe(result.error);
    expect(result.size).toBe(100); // stat succeeded before read failed
    expect(result.truncated).toBe(false);
  });

  it("returns an error result when decode throws, without throwing", async () => {
    // Simulate a decode failure (e.g. an injected decoder rejects the bytes).
    // The file is not binary-looking (no NUL), so it reaches the decode path.
    const bytes = Buffer.from("plain text but decode will fail", "utf8");
    const decodeErr = new Error("decode failed: invalid sequence");
    const { primitives } = fakePrimitives({
      stat: vi.fn(async () => ({ size: bytes.length })),
      readBytes: vi.fn(async () => bytes),
      decode: vi.fn(() => {
        throw decodeErr;
      }),
    });

    const result = await readPreviewContent("/project/decode-broken.txt", primitives);

    expect(result.error).toBeTruthy();
    expect(result.error).toContain("decode failed");
    expect(result.text).toBe(result.error); // the fallback *is* the message
    expect(result.binary).toBe(false);
    expect(result.truncated).toBe(false);
    // Stat and size are still reported because read succeeded before decode.
    expect(result.size).toBe(bytes.length);
  });
});
// ---------------------------------------------------------------------------
// Custom byte limits — callers (the host) can override the defaults so the
// configurable `previewFullMaxBytes` / `previewExcerptMaxBytes` settings take
// effect without changing the named constants.
// ---------------------------------------------------------------------------

describe("readPreviewContent — custom byte limits", () => {
  it("uses the provided fullMaxBytes as the whole-file threshold", async () => {
    const fullCap = 64;
    const excerpt = 32;
    const bytes = Buffer.alloc(64, 0x41); // 64 bytes — under custom full cap
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: 64 })),
      readBytes: vi.fn(async (_p, n) => bytes.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/file.txt", primitives, {
      fullMaxBytes: fullCap,
      excerptMaxBytes: excerpt,
    });

    // At the threshold (not over), the whole file is read, not truncated.
    expect(result.truncated).toBe(false);
    expect(readBytesCalls[0]!.maxBytes).toBe(fullCap);
    expect(result.text).toHaveLength(64);
  });

  it("excerpts using excerptMaxBytes when size exceeds fullMaxBytes", async () => {
    const fullCap = 64;
    const excerpt = 32;
    const payload = Buffer.alloc(128, 0x41);
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: 128 })),
      readBytes: vi.fn(async (_p, n) => payload.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/big.txt", primitives, {
      fullMaxBytes: fullCap,
      excerptMaxBytes: excerpt,
    });

    expect(result.truncated).toBe(true);
    expect(readBytesCalls[0]!.maxBytes).toBe(excerpt);
    expect(result.text).toHaveLength(excerpt);
    // The truncation notice references the custom excerpt size, not the default.
    expect(result.truncationNotice).toContain(String(excerpt));
    expect(result.truncationNotice).toContain("128");
  });

  it("falls back to default limits when none are supplied", async () => {
    const fileSize = ONE_MIB + 1;
    const payload = Buffer.alloc(EXCERPT_MAX_BYTES, 0x41);
    const { primitives, readBytesCalls } = fakePrimitives({
      stat: vi.fn(async () => ({ size: fileSize })),
      readBytes: vi.fn(async (_p, n) => payload.subarray(0, n)),
    });

    const result = await readPreviewContent("/project/big.txt", primitives);

    expect(result.truncated).toBe(true);
    expect(readBytesCalls[0]!.maxBytes).toBe(EXCERPT_MAX_BYTES);
  });
});
