import type { ResearchBrain } from "./types.js";

export interface OllamaBrainOptions {
  model: string;
  host: string;
  systemPrompt?: string;
  options?: Record<string, unknown>;
}

/**
 * ResearchBrain adapter for Ollama-hosted models.
 * Uses the model's built-in Modelfile template and SYSTEM by default.
 * Pass systemPrompt only when intentionally overriding the Modelfile SYSTEM.
 * The Modelfile template MUST be a proper chat template (e.g., Qwen
 * <|im_start|>/<|im_end|> format), not bare {{ .Prompt }}.
 */
export class OllamaBrain implements ResearchBrain {
  private model: string;
  private host: string;
  private systemPrompt: string | undefined;
  private options: Record<string, unknown>;

  constructor(opts: OllamaBrainOptions) {
    this.model = opts.model;
    this.host = opts.host.replace(/\/$/, "");
    this.systemPrompt = opts.systemPrompt;
    this.options = opts.options ?? {};
  }

  async generate(prompt: string): Promise<string> {
    const request: Record<string, unknown> = {
      model: this.model,
      prompt,
      stream: false,
      options: this.options,
    };

    if (this.systemPrompt) {
      request.system = this.systemPrompt;
    }

    const body = JSON.stringify(request);

    const res = await fetch(`${this.host}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        `Ollama API error ${res.status}: ${text.slice(0, 200)}`,
      );
    }

    const json: { response?: string } = await res.json();
    return json.response ?? "";
  }
}
