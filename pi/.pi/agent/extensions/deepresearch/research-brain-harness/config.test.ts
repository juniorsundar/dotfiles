import { describe, it, expect } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadDeepresearchConfig, requireOllamaProvider } from "./config.js";

describe("loadDeepresearchConfig", () => {
  it("loads the configured Ollama Research Brain from settings.json", async () => {
    const settingsPath = await writeSettings({
      deepresearch: {
        model: "tongyi-deepresearch:30b",
        provider: "ollama",
        ollamaHost: "http://100.64.0.5:11434",
        systemPrompt: null,
        options: {
          temperature: 0.1,
          num_predict: 4096,
        },
      },
    });

    const config = await loadDeepresearchConfig(settingsPath);

    expect(config).toEqual({
      model: "tongyi-deepresearch:30b",
      provider: "ollama",
      ollamaHost: "http://100.64.0.5:11434",
      systemPrompt: undefined,
      options: {
        temperature: 0.1,
        num_predict: 4096,
      },
    });
  });

  it("uses safe defaults for optional provider, host, and options", async () => {
    const settingsPath = await writeSettings({
      deepresearch: {
        model: "tongyi-deepresearch:30b",
      },
    });

    const config = await loadDeepresearchConfig(settingsPath);

    expect(config).toEqual({
      model: "tongyi-deepresearch:30b",
      provider: "ollama",
      ollamaHost: "http://localhost:11434",
      systemPrompt: undefined,
      options: {},
    });
  });

  it("rejects missing or empty model settings", async () => {
    const missingModel = await writeSettings({ deepresearch: {} });
    await expect(loadDeepresearchConfig(missingModel)).rejects.toThrow(
      "deepresearch.model",
    );

    const emptyModel = await writeSettings({
      deepresearch: { model: "" },
    });
    await expect(loadDeepresearchConfig(emptyModel)).rejects.toThrow(
      "deepresearch.model",
    );
  });

  it("rejects unsupported providers before the Ollama harness runs", () => {
    expect(() =>
      requireOllamaProvider({
        model: "some-model",
        provider: "not-ollama",
        ollamaHost: "http://localhost:11434",
        options: {},
      }),
    ).toThrow("Unsupported deepresearch.provider");
  });
});

async function writeSettings(settings: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "deepresearch-config-"));
  const settingsPath = join(dir, "settings.json");
  await writeFile(settingsPath, JSON.stringify(settings));
  return settingsPath;
}
