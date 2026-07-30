import { describe, expect, it } from "vitest";

import {
  readVsconsultConfig,
  DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS,
  DEFAULT_FULL_PREVIEW_MAX_BYTES,
  DEFAULT_EXCERPT_MAX_BYTES,
  DEFAULT_FILE_EXCLUDES,
  type VsconsultConfigurationAccessor,
} from "./config.js";

function accessor(map: Record<string, unknown>): VsconsultConfigurationAccessor {
  return { get: <T>(section: string): T | undefined => map[section] as T | undefined };
}

describe("readVsconsultConfig", () => {
  it("returns all defaults when no settings are set", () => {
    const cfg = readVsconsultConfig(accessor({}));
    expect(cfg).toEqual({
      previewDebounceDelayMs: DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS,
      previewFullMaxBytes: DEFAULT_FULL_PREVIEW_MAX_BYTES,
      previewExcerptMaxBytes: DEFAULT_EXCERPT_MAX_BYTES,
      fileExcludes: [...DEFAULT_FILE_EXCLUDES],
    });
  });

  it("returns set values verbatim when valid", () => {
    const cfg = readVsconsultConfig(
      accessor({
        previewDebounceDelayMs: 300,
        previewFullMaxBytes: 2048,
        previewExcerptMaxBytes: 1024,
        fileExcludes: ["**/target/**", "**/.venv/**"],
      }),
    );
    expect(cfg).toEqual({
      previewDebounceDelayMs: 300,
      previewFullMaxBytes: 2048,
      previewExcerptMaxBytes: 1024,
      fileExcludes: ["**/target/**", "**/.venv/**"],
    });
  });

  it("allows a debounce delay of 0 (immediate preview)", () => {
    const cfg = readVsconsultConfig(accessor({ previewDebounceDelayMs: 0 }));
    expect(cfg.previewDebounceDelayMs).toBe(0);
  });

  it("falls back to default for a negative debounce delay", () => {
    const cfg = readVsconsultConfig(accessor({ previewDebounceDelayMs: -10 }));
    expect(cfg.previewDebounceDelayMs).toBe(DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS);
  });

  it("falls back to default for a non-integer debounce delay", () => {
    const cfg = readVsconsultConfig(accessor({ previewDebounceDelayMs: 12.5 }));
    expect(cfg.previewDebounceDelayMs).toBe(DEFAULT_PREVIEW_DEBOUNCE_DELAY_MS);
  });

  it("falls back to default for a non-positive byte limit", () => {
    const cfg = readVsconsultConfig(
      accessor({ previewFullMaxBytes: 0, previewExcerptMaxBytes: -5 }),
    );
    expect(cfg.previewFullMaxBytes).toBe(DEFAULT_FULL_PREVIEW_MAX_BYTES);
    expect(cfg.previewExcerptMaxBytes).toBe(DEFAULT_EXCERPT_MAX_BYTES);
  });

  it("falls back to default when fileExcludes is not an array", () => {
    const cfg = readVsconsultConfig(accessor({ fileExcludes: "**/oops/**" }));
    expect(cfg.fileExcludes).toEqual([...DEFAULT_FILE_EXCLUDES]);
  });

  it("falls back to default when fileExcludes contains non-string entries", () => {
    const cfg = readVsconsultConfig(
      accessor({ fileExcludes: ["**/ok/**", 7, null] }),
    );
    expect(cfg.fileExcludes).toEqual([...DEFAULT_FILE_EXCLUDES]);
  });

  it("accepts an empty fileExcludes array (disables baseline excludes)", () => {
    const cfg = readVsconsultConfig(accessor({ fileExcludes: [] }));
    expect(cfg.fileExcludes).toEqual([]);
  });
});