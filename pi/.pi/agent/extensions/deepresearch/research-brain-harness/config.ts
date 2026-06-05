import { readFile } from "node:fs/promises";

export interface DeepresearchConfig {
  model: string;
  provider: "ollama" | string;
  ollamaHost: string;
  systemPrompt?: string;
  options: Record<string, unknown>;
}

interface SettingsFile {
  deepresearch?: {
    model?: unknown;
    provider?: unknown;
    ollamaHost?: unknown;
    systemPrompt?: unknown;
    options?: unknown;
  };
}

const DEFAULT_OLLAMA_HOST = "http://localhost:11434";

export function requireOllamaProvider(config: DeepresearchConfig): void {
  if (config.provider !== "ollama") {
    throw new Error(
      `Unsupported deepresearch.provider '${config.provider}'. Only 'ollama' is supported by this harness.`,
    );
  }
}

export async function loadDeepresearchConfig(
  settingsPath = "settings.json",
): Promise<DeepresearchConfig> {
  const raw = await readFile(settingsPath, "utf8");
  const parsed = JSON.parse(raw) as SettingsFile;
  const config = parsed.deepresearch;

  if (!config || typeof config !== "object") {
    throw new Error(`Missing deepresearch config in ${settingsPath}`);
  }

  if (typeof config.model !== "string" || config.model.trim().length === 0) {
    throw new Error("deepresearch.model must be a non-empty string");
  }

  const provider =
    typeof config.provider === "string" && config.provider.trim().length > 0
      ? config.provider
      : "ollama";

  const ollamaHost =
    typeof config.ollamaHost === "string" && config.ollamaHost.trim().length > 0
      ? config.ollamaHost
      : DEFAULT_OLLAMA_HOST;

  const systemPrompt =
    typeof config.systemPrompt === "string" && config.systemPrompt.trim().length > 0
      ? config.systemPrompt
      : undefined;

  const options =
    config.options &&
    typeof config.options === "object" &&
    !Array.isArray(config.options)
      ? (config.options as Record<string, unknown>)
      : {};

  return {
    model: config.model,
    provider,
    ollamaHost,
    systemPrompt,
    options,
  };
}
