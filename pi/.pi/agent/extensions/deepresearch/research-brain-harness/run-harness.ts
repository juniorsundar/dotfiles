/**
 * Run the contract harness against the configured deepresearch Research Brain.
 * Usage: npx tsx run-harness.ts
 * Optional: PI_SETTINGS_PATH=/path/to/settings.json npx tsx run-harness.ts
 */
import { join } from "node:path";
import { loadDeepresearchConfig, requireOllamaProvider } from "./config.js";
import { OllamaBrain } from "./ollama-brain.js";
import { runHarness } from "./probe-runner.js";

async function main() {
  const settingsPath = process.env.PI_SETTINGS_PATH ?? join(process.cwd(), "settings.json");
  const config = await loadDeepresearchConfig(settingsPath);

  requireOllamaProvider(config);

  const brain = new OllamaBrain({
    model: config.model,
    host: config.ollamaHost,
    systemPrompt: config.systemPrompt,
    options: config.options,
  });

  console.log(
    `Running contract harness against ${config.provider}/${config.model} at ${config.ollamaHost}...\n`,
  );
  const start = Date.now();

  const result = await runHarness(brain);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(result.summary);
  console.log(`\nElapsed: ${elapsed}s`);

  // Print diagnostics (raw responses)
  console.log("\n── Raw diagnostics ──");
  for (const d of result.diagnostics) {
    console.log(d);
  }
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
