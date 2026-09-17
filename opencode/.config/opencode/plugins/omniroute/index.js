/**
 * OmniRoute OpenCode plugin — OpenCode V2 entrypoint.
 *
 * The package also ships the original V1 implementation in `./dist/index.js`.
 * V2 loads this file and calls `setup(ctx)`; V1 calls `server()` on the same
 * default export. The two implementations stay on their own APIs — sharing the
 * export does not translate hooks (see the V2 "Support V1" plugin docs).
 *
 * ─── What this file does ────────────────────────────────────────────────────
 *
 * V1 exposed three hooks from one object: `auth`, `provider` and `config`. V2
 * has no such object; every extension point is registered on the domain that
 * owns it, through the context:
 *
 *   V1 hook              V2 registration
 *   ───────────────────  ─────────────────────────────────────────────────────
 *   auth                 ctx.integration.transform(...)   (/connect API key)
 *   provider             ctx.provider.transform(...)      (provider + models)
 *   config (shim)        ctx.mcp.transform(...)           (MCP auto-emit)
 *                        + disk snapshot write (reused verbatim, see below)
 *   fetch interceptor    ctx.session.hook("http.request")
 *   (auth loader `fetch`)   — Authorization injection
 *                           — Gemini tool-schema sanitisation
 *                           — JSONL debug log
 *
 * All the expensive, well-tested logic — `/v1/models` + `/api/combos` +
 * `/api/combos/auto` + `/api/pricing/models` + `/api/context/combos` +
 * `/api/providers` discovery, combo LCD roll-ups, nested combo-ref fixpoint,
 * enrichment, provider tagging, usableOnly filtering and the disk-cache
 * fallback — is NOT reimplemented here. It is imported from the vendored V1
 * bundle and reused:
 *
 *   - `createOmniRouteProviderHook` produces the rich catalog (as V1 `ModelV2`
 *     objects) which `toModelInfo()` translates to V2 `Model.Info`.
 *   - `createOmniRouteConfigHook` is driven with a throwaway config object and
 *     an injected `readAuthJson`, purely for its side effects: it writes the
 *     last-known-good disk snapshot and builds the MCP entry.
 *
 * ─── Operator override ──────────────────────────────────────────────────────
 *
 * Like V1, a hand-curated model list wins. The provider transform skips
 * registration when `providers.<id>` already declares models, so the plugin
 * never clobbers a curated catalog. A provider that only sets
 * `settings.baseURL` (a private gateway endpoint) does NOT block discovery —
 * the plugin merges into it and supplies the models. Remove a curated `models`
 * block to let the plugin discover dynamically.
 *
 * ─── Credentials (V1 `auth` hook → V2 integrations) ─────────────────────────
 *
 * `setup` registers `integration.update(<providerId>, ...)` with two methods:
 * a `key` method for `/connect <providerId>` and an `env` method reading
 * `$<PROVIDERID>_API_KEY` (e.g. `OMNIROUTE_API_KEY`). The connect form also
 * accepts an optional `baseURL`, stored on `credential.configuration`.
 *
 * Credential precedence: the `/connect` connection → the provider's
 * `settings.apiKey` → `$<PROVIDERID>_API_KEY`. Base URL precedence: plugin
 * options → credential configuration → `OPENCODE_OMNIROUTE_BASE_URL` →
 * `providers.<id>.settings.baseURL`.
 *
 * ─── Deviations from V1 (deliberate) ────────────────────────────────────────
 *
 *   1. No global config mutation. V2 removed the mutable global config object,
 *      so the V1 "static provider block" half of the config shim has no
 *      destination. Model discovery goes through `ctx.provider.transform`.
 *   2. `Content-Type` is no longer forced to `application/json` on outbound
 *      requests. OpenCode's provider package owns the request encoding now;
 *      forcing it could corrupt multipart/streaming bodies. Only the
 *      `Authorization` header is injected, and only when absent.
 *   3. OmniRoute's `capabilities.reasoning` / `attachment` / `interleaved`
 *      flags have no V2 `Model.Info` equivalent. `attachment` is folded into
 *      the input modality list (`image`), which is what V2 actually consumes.
 *      `compatibility.reasoningField` is deliberately left unset rather than
 *      guessing which wire field OmniRoute uses.
 *
 * ─── Catalog caching ────────────────────────────────────────────────────────
 *
 * `features.diskCache` (default on) keeps a last-known-good snapshot of the raw
 * gateway responses at `diskSnapshotPath(providerId)`. V1 wrote that file but
 * only its static-config path ever read it, and V2 drops that path — so the
 * plugin writes the snapshot and then *seeds the hooks' shared raw-fetch cache*
 * from it on the first refresh. Both the provider and config hooks read that
 * cache, so a cold start produces the full catalog (combos, enrichment and
 * provider tags included) with no gateway round-trip. Trade-off: the first
 * catalog after a restart reflects the snapshot, not live state, until the TTL
 * refresh replaces it.
 *
 * `/omniroute-refresh` drops the cache and fetches live on demand.
 *
 * ─── Thinking levels (variants) ─────────────────────────────────────────────
 *
 * OmniRoute advertises reasoning-effort tiers per model via
 * `capabilities.effort_tiers` and publishes each tier as its own model id
 * (`<id>-low`, `-medium`, `-high`, `-xhigh`). The tier is selected by model id,
 * not by a request parameter — OmniRoute's effort setting is a per-connection
 * server-side default.
 *
 * V2's native shape for this is a model `variant`, but `Model.Variant` has no
 * `modelID` field, so each generated variant points the request body at the
 * sibling id instead (`body.model`). Variant `body` is merged last and scalar
 * values replace earlier ones, so the request goes out as the tiered id:
 *
 *   cc/claude-sonnet-5          -> cc/claude-sonnet-5
 *   cc/claude-sonnet-5#xhigh    -> cc/claude-sonnet-5-xhigh
 *
 * This is a deliberate exception to the "no client-side synthesis" rule the V1
 * plugin follows (OQ-3) — it is presentation only, and the tier ids themselves
 * remain individually selectable. The tier list is read from the RAW cached
 * entries, because the V1 mapper drops `effort_tiers`.
 */

import { createHash } from "node:crypto";

import {
  OmniRoutePlugin,
  createOmniRouteConfigHook,
  createOmniRouteProviderHook,
  debugLogAppend,
  debugLogEnabled,
  defaultDiskSnapshotReader,
  diskSnapshotPath,
  parseOmniRoutePluginOptions,
  resolveOmniRoutePluginOptions,
  sanitizeGeminiToolSchemas,
  shouldSanitizeForGemini,
} from "./dist/index.js";

/** Stable plugin id: identifies the plugin in status, diagnostics and storage. */
const ID = "@omniroute/opencode-plugin";

const LOG_PREFIX = "[omniroute-plugin]";

/** V2 runtime packages. `@opencode/ai/providers/*` is the documented set. */
const OPENAI_COMPATIBLE_PACKAGE = "@opencode/ai/providers/openai-compatible";
const ANTHROPIC_PACKAGE = "@opencode/ai/providers/anthropic";

/** The AI-SDK package the V1 bundle reports in `ModelV2.api.npm`. */
const ANTHROPIC_SDK_PACKAGE = "@ai-sdk/anthropic";

/** Modalities V2 `Model.Capabilities` accepts, in picker order. */
const MODALITY_KEYS = ["text", "audio", "image", "video", "pdf"];

/** Events that can change the resolved credential or the gateway endpoint. */
const REFRESH_EVENTS = new Set([
  "integration.updated",
  "credential.switched",
  "credential.updated",
  "config.updated",
]);

function log(...args) {
  console.log(LOG_PREFIX, ...args);
}

function warn(...args) {
  console.warn(LOG_PREFIX, ...args);
}

/**
 * Environment variable that can supply the API key without `/connect`, e.g.
 * `OMNIROUTE_API_KEY` for the default provider id. Registered as an `env`
 * integration method, mirroring how OpenCode's own provider plugins do it.
 */
function envKeyFor(providerId) {
  return `${providerId.replace(/[^a-zA-Z0-9]+/g, "_").toUpperCase()}_API_KEY`;
}

/**
 * Mirror of the bundle's internal `modelsCacheKey` (not re-exported by
 * `dist/index.js`). The provider and config hooks key their shared
 * raw-fetch cache by `"<baseURL>::<sha256(apiKey)>"`; reproducing it here is
 * what lets us seed that cache from the on-disk snapshot, so the first
 * catalog build after a restart needs no gateway round-trip.
 */
function seedCacheKey(baseURL, credentialId) {
  const digest = createHash("sha256").update(credentialId).digest("hex");
  return `${baseURL}::${digest}`;
}

/** Collapse V1's boolean modality flags into V2's modality string array. */
function modalityList(flags, fallback) {
  if (!flags || typeof flags !== "object") return fallback;
  const out = [];
  for (const key of MODALITY_KEYS) {
    if (flags[key] === true) out.push(key);
  }
  return out.length > 0 ? out : fallback;
}

/** Parse `release_date` into the epoch milliseconds V2 requires. */
function releasedAt(releaseDate) {
  if (typeof releaseDate !== "string" || releaseDate.length === 0) return 0;
  const parsed = Date.parse(releaseDate);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Reasoning-effort tiers OmniRoute advertises via `capabilities.effort_tiers`. */
const EFFORT_TIERS = ["none", "low", "medium", "high", "xhigh"];

/**
 * Index `<baseId> -> [tier, ...]` for models that advertise reasoning-effort
 * tiers AND have a matching sibling `<baseId>-<tier>` entry upstream.
 *
 * Takes RAW `/v1/models` entries, not the mapped `ModelV2` output: the V1
 * mapper does not carry `capabilities.effort_tiers` through, so the tier list
 * and the sibling ids are only visible on the raw records.
 *
 * OmniRoute selects the thinking level by *model id*, not by a request
 * parameter (its `effort_tiers` mirrors `CODEX_REASONING_EFFORT_VALUES`, which
 * is a per-connection server-side default). So the tier has to be expressed by
 * pointing the request at the sibling id — which is exactly what the generated
 * variants do below. "none" is skipped because the unsuffixed id *is* "none".
 */
function buildTierIndex(rawModels) {
  const ids = new Set(rawModels.map((model) => model.id));
  const index = new Map();
  for (const model of rawModels) {
    const tiers = model.capabilities?.effort_tiers;
    if (!Array.isArray(tiers) || tiers.length === 0) continue;
    const available = EFFORT_TIERS.filter(
      (tier) => tier !== "none" && ids.has(`${model.id}-${tier}`),
    );
    if (available.length > 0) index.set(model.id, available);
  }
  return index;
}

/**
 * Translate one V1 `ModelV2` (produced by the vendored bundle) into a V2
 * `Model.Info`.
 *
 * Field mapping notes:
 *   - `modelID` is the id sent upstream; identical to the catalog id here
 *     because OmniRoute ids are already the canonical upstream identifiers.
 *   - `package` carries the V1 `apiFormat` routing decision: Anthropic-prefixed
 *     model ids are served by the Anthropic runtime, everything else by the
 *     OpenAI-compatible one.
 *   - `settings.baseURL` encodes the V1 `api.url`, which differs from the
 *     provider-level base URL for Anthropic models (no `/v1` suffix).
 *   - `cost` is a single-element array in V2 (tiered pricing); OmniRoute
 *     surfaces one flat, non-tiered price block.
 */
function toModelInfo(model, providerId, tierIndex) {
  const capabilities = model.capabilities ?? {};
  const isAnthropic = model.api?.npm === ANTHROPIC_SDK_PACKAGE;

  // Thinking-level switcher. A variant cannot set `modelID`, so each tier
  // points the request body at the sibling model id instead. Variant `body` is
  // merged last and scalar values replace earlier ones, so this overrides the
  // request's `model` field.
  const variants = (tierIndex?.get(model.id) ?? []).map((tier) => ({
    id: tier,
    body: { model: `${model.id}-${tier}` },
  }));

  const limit = {
    context: typeof model.limit?.context === "number" ? model.limit.context : 0,
    output: typeof model.limit?.output === "number" ? model.limit.output : 0,
  };
  if (typeof model.limit?.input === "number") limit.input = model.limit.input;

  const info = {
    id: model.id,
    modelID: model.id,
    providerID: providerId,
    name: model.name && model.name.length > 0 ? model.name : model.id,
    package: isAnthropic ? ANTHROPIC_PACKAGE : OPENAI_COMPATIBLE_PACKAGE,
    capabilities: {
      tools: capabilities.toolcall === true,
      input: modalityList(capabilities.input, ["text"]),
      output: modalityList(capabilities.output, ["text"]),
    },
    variants,
    time: { released: releasedAt(model.release_date) },
    cost: [
      {
        input: typeof model.cost?.input === "number" ? model.cost.input : 0,
        output: typeof model.cost?.output === "number" ? model.cost.output : 0,
        cache: {
          read: typeof model.cost?.cache?.read === "number" ? model.cost.cache.read : 0,
          write: typeof model.cost?.cache?.write === "number" ? model.cost.cache.write : 0,
        },
      },
    ],
    status: "active",
    enabled: true,
    limit,
  };

  if (typeof model.api?.url === "string" && model.api.url.length > 0) {
    info.settings = { baseURL: model.api.url };
  }

  return info;
}

/**
 * Build the V2 `Provider.Info` for a discovered gateway. `integrationID` links
 * the provider to the integration registered in `setup`, so `/connect` supplies
 * the credential and OpenCode can resolve it per active connection.
 */
function buildProviderInfo(providerId, displayName, baseURL) {
  const info = {
    id: providerId,
    name: displayName,
    activation: "enabled",
    package: OPENAI_COMPATIBLE_PACKAGE,
    integrationID: providerId,
  };
  if (typeof baseURL === "string" && baseURL.length > 0) {
    info.settings = { baseURL };
  }
  return info;
}

/**
 * Resolve the API key and effective base URL for this plugin instance.
 *
 * Order, strongest first:
 *   1. plugin options (`baseURL` only — options never carry the key)
 *   2. the key credential's `configuration.baseURL` (connect-form answers)
 *   3. `OPENCODE_OMNIROUTE_BASE_URL`
 *   4. the provider config's `settings` — `baseURL` and `apiKey`. This lets an
 *      operator keep the endpoint and key in opencode.json and still get
 *      dynamic discovery, matching V2's documented custom-provider recipe and
 *      V1's reading of `provider.options`.
 *   5. `$<PROVIDERID>_API_KEY`
 */
async function resolveAuth(ctx, providerId, optionBaseURL, providerSettings = {}) {
  let apiKey;
  let connection;
  let credentialBaseURL;

  try {
    connection = await ctx.integration.connection.active(providerId);
    if (connection) {
      const credential = await ctx.integration.connection.resolve(connection);
      if (credential && credential.type === "key" && typeof credential.key === "string") {
        apiKey = credential.key.length > 0 ? credential.key : undefined;
      }
      const configuration = credential?.configuration;
      if (configuration && typeof configuration.baseURL === "string") {
        credentialBaseURL = configuration.baseURL;
      }
    }
  } catch (error) {
    warn(`could not resolve the ${providerId} connection: ${error?.message ?? error}`);
  }

  // Explicit provider config beats an ambient environment variable.
  if (!apiKey) {
    const configuredKey = providerSettings.apiKey;
    if (typeof configuredKey === "string" && configuredKey.length > 0) apiKey = configuredKey;
  }
  if (!apiKey) {
    const fromEnv = process.env[envKeyFor(providerId)];
    if (typeof fromEnv === "string" && fromEnv.length > 0) apiKey = fromEnv;
  }

  const baseURL =
    optionBaseURL ??
    credentialBaseURL ??
    process.env.OPENCODE_OMNIROUTE_BASE_URL ??
    providerSettings.baseURL ??
    "";

  return { apiKey, baseURL, connection };
}

/**
 * Build the V2 plugin. Exported for tests; `setup` is the entrypoint V2 calls.
 */
export async function setup(ctx) {
  const options = parseOmniRoutePluginOptions(ctx.options ?? {});
  const resolved = resolveOmniRoutePluginOptions(options);
  const { providerId, displayName, modelCacheTtl } = resolved;
  const features = options.features ?? {};

  const wantFetchInterceptor = features.fetchInterceptor !== false;
  const wantGeminiSanitization = features.geminiSanitization !== false;
  const wantMcpAutoEmit = features.mcpAutoEmit === true;
  // The V1 config hook owns the disk snapshot (write on success, hydrate on
  // fetch failure). It runs whenever either side effect is wanted.
  const wantDiskCache = features.diskCache !== false;
  const wantConfigHook = wantDiskCache || wantMcpAutoEmit;

  // Shared between the provider hook and the config hook so one refresh costs
  // one round-trip set, exactly as in V1. Each plugin instance owns its own
  // cache, so side-by-side instances (prod + preprod) never collide.
  const cache = new Map();

  // Latest auth resolution. Refreshed at setup, on credential/config events,
  // and on the TTL timer; the HTTP hooks read it without a round trip.
  const auth = { apiKey: undefined, baseURL: "", connection: undefined };

  // Mutable state captured by the synchronous transforms below. `reload()` is
  // called after each refresh to replay them against the new values.
  const state = {
    provider: undefined,
    models: [],
    connection: undefined,
    mcp: undefined,
    signature: "",
    registered: false,
    seeded: false,
  };

  const providerHook = createOmniRouteProviderHook(resolved, { cache });
  const configHook = createOmniRouteConfigHook(resolved, {
    cache,
    // The V1 config hook reads OpenCode's `auth.json`. V2 stores credentials as
    // integration connections, so feed it the resolved credential instead. This
    // keeps the disk-cache writer and the MCP block builder working unchanged.
    readAuthJson: async () =>
      auth.apiKey
        ? { [providerId]: { type: "api", key: auth.apiKey, baseURL: auth.baseURL } }
        : {},
  });

  // ── Integration: `/connect <providerId>` ──────────────────────────────────
  // `integration.update` also creates the integration when it does not exist
  // yet, which is how OpenCode's own provider plugins register theirs.
  await ctx.integration.transform((editor) => {
    editor.update(providerId, (integration) => {
      integration.name = displayName;
    });
    editor.method.update({
      integrationID: providerId,
      method: {
        type: "key",
        label: `${displayName} API key`,
        // Optional extras land on `credential.configuration`, which is where
        // `resolveAuth` reads a per-connection base URL from.
        form: [
          {
            type: "string",
            key: "baseURL",
            title: "Gateway base URL (optional)",
            description:
              "Only needed when the gateway is not already set through plugin options.",
            required: false,
          },
        ],
      },
    });
    editor.method.update({
      integrationID: providerId,
      method: { type: "env", names: [envKeyFor(providerId)] },
    });
  });

  // ── Provider: dynamic catalog ─────────────────────────────────────────────
  await ctx.provider.transform((editor) => {
    const existing = editor.get(providerId);

    // A curated model list wins, matching V1's operator-override posture.
    // A provider that merely declares settings (e.g. a private baseURL) does
    // NOT block discovery; only an existing model list does.
    if (existing && existing.models.size > 0) return;
    if (!state.provider || state.models.length === 0) return;

    if (existing) {
      // Merge into the configured provider so its values survive. This is the
      // normal path when `providers.<id>` is declared in opencode.json[c].
      editor.update(providerId, (provider) => {
        provider.activation = state.provider.activation;
        provider.package = provider.package ?? state.provider.package;
        provider.integrationID = state.provider.integrationID;
        provider.settings = { ...state.provider.settings, ...provider.settings };
      });
      editor.models.set(providerId, state.models);
      return;
    }

    // No declaration anywhere: contribute the provider from scratch.
    // NOTE: deliberately no `sourceConnection`. That field marks an inventory
    // as account-specific, and OpenCode excludes such a provider whenever the
    // active connection no longer matches the one captured here — which drops
    // the whole provider after a credential is reconnected.
    editor.add({
      info: state.provider,
      models: state.models,
    });
  });

  // ── MCP auto-emit ─────────────────────────────────────────────────────────
  if (wantMcpAutoEmit) {
    await ctx.mcp.transform((editor) => {
      // Curated `mcp.<id>` entries win, same posture as V1.
      if (editor.get(providerId)) return;
      if (!state.mcp) return;
      editor.set(providerId, state.mcp);
    });
  }

  // ── Auth refresh helper ───────────────────────────────────────────────────
  /**
   * Read `providers.<id>.settings` from the live provider registry, so an
   * operator can supply `baseURL` and `apiKey` through opencode.json.
   */
  const configuredProviderSettings = async () => {
    try {
      const result = await ctx.provider.get({ providerID: providerId });
      const settings = result?.data?.settings;
      return settings && typeof settings === "object" ? settings : {};
    } catch {
      // Provider not present, or the registry is not readable at this point.
      return {};
    }
  };

  /**
   * Re-resolve the credential and cache it on `auth`, so the HTTP hooks do not
   * pay a connection lookup per request.
   */
  const refreshAuth = async () => {
    const providerSettings = await configuredProviderSettings();
    const { apiKey, baseURL, connection } = await resolveAuth(
      ctx,
      providerId,
      resolved.baseURL,
      providerSettings,
    );
    auth.apiKey = apiKey;
    auth.baseURL = baseURL;
    auth.connection = connection;
    return auth;
  };

  // ── HTTP hooks: auth injection, Gemini sanitisation, debug log ────────────
  const debugEnabled = () => features.debugLog === true || debugLogEnabled(providerId);
  const pending = new WeakMap();

  await ctx.session.hook(
    "http.request",
    async (event) => {
      // `auth` is refreshed at setup, on credential/config events, and on the
      // TTL timer, so the hot path costs no extra connection lookup.
      const apiKey = auth.apiKey ?? (await refreshAuth()).apiKey;

      // V1's fetch interceptor injected the bearer token on every request to
      // the gateway. Only fill it in when absent so a credential OpenCode has
      // already attached (or an operator-supplied header) is never replaced.
      if (wantFetchInterceptor && apiKey && !event.request.headers.has("authorization")) {
        event.request.headers.set("authorization", `Bearer ${apiKey}`);
      }

      // Gemini rejects `$schema` / `$ref` / `additionalProperties` in tool
      // schemas. Only rewrite JSON bodies, and only when the target model is a
      // Gemini variant — same guard the V1 sanitiser used.
      if (wantGeminiSanitization) {
        const contentType = event.request.headers.get("content-type") ?? "";
        if (contentType.includes("application/json")) {
          try {
            const text = await event.request.clone().text();
            if (text.length > 0) {
              const payload = JSON.parse(text);
              if (shouldSanitizeForGemini(payload)) {
                event.request = new Request(event.request.url, {
                  method: event.request.method,
                  headers: event.request.headers,
                  body: JSON.stringify(sanitizeGeminiToolSchemas(payload)),
                });
              }
            }
          } catch (error) {
            warn(`Gemini schema sanitisation skipped: ${error?.message ?? error}`);
          }
        }
      }

      if (debugEnabled()) {
        try {
          const body = await event.request.clone().text();
          pending.set(event.request, {
            reqId: `${event.sessionID}:${Date.now().toString(36)}`,
            providerId,
            ts: Date.now(),
            url: event.request.url,
            method: event.request.method,
            reqHeaders: Object.fromEntries(event.request.headers),
            reqBody: safeJson(body),
            resStatus: null,
            resHeaders: {},
            resBody: null,
            durationMs: null,
          });
        } catch {
          // Debug logging must never break a request.
        }
      }
    },
    { providerID: providerId },
  );

  await ctx.session.hook(
    "http.response",
    async (event) => {
      if (!debugEnabled()) return;
      const entry = pending.get(event.request);
      if (!entry) return;
      pending.delete(event.request);
      try {
        const body = await event.response.clone().text();
        debugLogAppend({
          ...entry,
          resStatus: event.response.status,
          resHeaders: Object.fromEntries(event.response.headers),
          resBody: safeJson(body),
          durationMs: Date.now() - entry.ts,
        });
      } catch (error) {
        debugLogAppend({
          ...entry,
          resStatus: event.response.status,
          durationMs: Date.now() - entry.ts,
          error: String(error?.message ?? error),
        });
      }
    },
    { providerID: providerId },
  );

  // ── Refresh ───────────────────────────────────────────────────────────────
  let refreshing = null;

  // Boot retry. At startup the first refresh can beat the credential service,
  // in which case there is no API key yet and the provider stays unregistered
  // until the next TTL tick (minutes). Instead, retry quickly until the first
  // successful registration so the provider appears promptly after a restart.
  let bootTimer = null;
  let bootAttempt = 0;
  const BOOT_DELAYS_MS = [500, 1000, 2000, 3000, 5000, 8000, 13000, 21000, 34000];

  const scheduleBootRetry = () => {
    if (state.registered) return;
    const delay = BOOT_DELAYS_MS[Math.min(bootAttempt, BOOT_DELAYS_MS.length - 1)];
    bootAttempt += 1;
    clearTimeout(bootTimer);
    bootTimer = setTimeout(() => void runRefresh(), delay);
  };

  const refresh = async () => {
    const { apiKey, baseURL, connection } = await refreshAuth();

    if (!apiKey) {
      // No credential yet — leave the provider unregistered so `/connect`
      // stays the obvious next step instead of an empty model list.
      if (state.provider) {
        state.provider = undefined;
        state.models = [];
        state.connection = undefined;
        state.registered = false;
        await ctx.provider.reload();
      }
      // The credential may simply not be resolvable yet (startup race, or the
      // user has not run /connect). Retry quickly rather than waiting a TTL.
      scheduleBootRetry();
      return;
    }

    if (!baseURL) {
      warn(
        `no base URL for ${providerId}: set it via plugin options, the /connect ` +
          `form, OPENCODE_OMNIROUTE_BASE_URL, or providers.${providerId}.settings.baseURL`,
      );
      scheduleBootRetry();
      return;
    }

    // Cold start: seed the hooks' shared cache from the on-disk snapshot so the
    // first catalog build needs no gateway round-trip. Both hooks read that
    // cache, so they still produce the full catalog — combos, enrichment and
    // provider tags included — from the cached raw data. No reimplementation,
    // no divergent results. Runs once per plugin instance; the TTL refresher
    // and `/omniroute-refresh` replace it with live data.
    if (!state.seeded) {
      state.seeded = true;
      if (wantDiskCache) {
        try {
          const snapshot = await defaultDiskSnapshotReader(providerId);
          if (snapshot) {
            cache.set(seedCacheKey(baseURL, apiKey), {
              ...snapshot,
              expiresAt: Date.now() + modelCacheTtl,
            });
            log(
              `seeded ${snapshot.rawModels.length} cached model(s) from disk ` +
                `(${diskSnapshotPath(providerId)})`,
            );
          }
        } catch (error) {
          warn(`could not read the model disk cache: ${error?.message ?? error}`);
        }
      }
    }

    // Config hook first: it is the cache producer and the disk-snapshot
    // writer. Running it before the provider hook means a single gateway fetch
    // populates the shared cache, the snapshot is written, and the provider
    // hook then reads straight from cache. The throwaway object discards the
    // V1 static provider block, which has no V2 destination.
    if (wantConfigHook) {
      const scratch = { provider: {}, mcp: {} };
      try {
        await configHook(scratch);
      } catch (error) {
        warn(`config-side effects skipped: ${error?.message ?? error}`);
      }

      if (wantMcpAutoEmit) {
        const emitted = scratch.mcp?.[providerId];
        if (emitted) {
          // V1 wrote `enabled: true`; V2 expresses the same thing by leaving
          // `disabled` unset.
          const { enabled: _enabled, ...next } = emitted;
          if (JSON.stringify(next) !== JSON.stringify(state.mcp)) {
            state.mcp = next;
            await ctx.mcp.reload();
            log(`MCP endpoint registered at ${next.url}`);
          }
        }
      }
    }

    let catalog;
    try {
      catalog = await providerHook.models(
        { options: { baseURL } },
        { auth: { type: "api", key: apiKey, baseURL } },
      );
    } catch (error) {
      warn(`catalog refresh failed: ${error?.message ?? error}`);
      // A transient gateway failure must not strand the provider: retry on the
      // boot cadence until at least one registration has succeeded.
      scheduleBootRetry();
      return;
    }

    const catalogModels = Object.values(catalog ?? {});
    // Build the tier index from the RAW entries in the shared cache; the mapped
    // catalog has already dropped `capabilities.effort_tiers`.
    const rawModels = cache.get(seedCacheKey(baseURL, apiKey))?.rawModels ?? [];
    const tierIndex = buildTierIndex(rawModels);
    const models = catalogModels.map((model) => toModelInfo(model, providerId, tierIndex));

    // Log only when the model id set actually changes, not on every TTL tick.
    const signature = models
      .map((model) => model.id)
      .sort()
      .join("\n");
    const changed = signature !== state.signature;
    state.signature = signature;

    state.provider = buildProviderInfo(providerId, displayName, baseURL);
    state.models = models;
    state.connection = connection;
    state.registered = true;
    bootAttempt = 0;
    clearTimeout(bootTimer);
    bootTimer = null;

    if (changed) log(`discovered ${models.length} model(s) for ${providerId}`);
    await ctx.provider.reload();
  };

  const runRefresh = () => {
    if (refreshing) return refreshing;
    refreshing = refresh()
      .catch((error) => warn(`refresh failed: ${error?.message ?? error}`))
      .finally(() => {
        refreshing = null;
      });
    return refreshing;
  };

  /**
   * Drop the shared raw-fetch cache — including anything seeded from disk — and
   * fetch live. Exposed to the user as `/omniroute-refresh`.
   */
  const forceRefresh = async () => {
    cache.clear();
    await runRefresh();
    await ctx.provider.reload();
  };

  await runRefresh();

  // Refresh on credential/config changes so `/connect` takes effect without
  // waiting for the TTL timer.
  const controller = new AbortController();
  void (async () => {
    try {
      for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
        if (REFRESH_EVENTS.has(event.type)) await runRefresh();
      }
    } catch (error) {
      if (error?.name !== "AbortError") warn(`event subscription ended: ${error?.message ?? error}`);
    }
  })();

  // TTL refresher, aligned with the in-memory catalog cache.
  const timer = setInterval(() => void runRefresh(), modelCacheTtl);

  // ── Command: force a cache refresh ────────────────────────────────────────
  await ctx.command.transform((editor) => {
    editor.add({
      name: "omniroute-refresh",
      description: `Discard the cached ${displayName} catalog and fetch it again`,
      execute: async ({ sessionID }) => {
        try {
          await forceRefresh();
          const summary =
            `OmniRoute cache refreshed: ${state.models.length} model(s)` +
            `${state.mcp ? ", MCP endpoint active" : ""}.`;
          log(summary);
          try {
            await ctx.session.synthetic({ sessionID, id: { text: summary } });
          } catch (error) {
            warn(`could not post the refresh result: ${error?.message ?? error}`);
          }
        } catch (error) {
          warn(`refresh command failed: ${error?.message ?? error}`);
        }
      },
    });
  });

  const label = resolved.baseURL ?? auth.baseURL ?? "(from /connect)";
  log(
    `loaded (providerId=${providerId} baseURL=${label} ttl=${modelCacheTtl}ms ` +
      `combos=${features.combos !== false} mcpAutoEmit=${wantMcpAutoEmit} ` +
      `geminiSanitization=${wantGeminiSanitization} debugLog=${features.debugLog === true})`,
  );

  return () => {
    controller.abort();
    clearInterval(timer);
    clearTimeout(bootTimer);
  };
}

/** Best-effort JSON parse; the raw string is kept when it is not JSON. */
function safeJson(text) {
  if (typeof text !== "string" || text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * Dual-API default export.
 *
 * V2 reads `id` and `setup`; V1 ignores both and calls `server()`, which
 * returns the original V1 hook object (`auth` + `provider` + `config`).
 * The two implementations stay on their own APIs — nothing is translated
 * between them. Drop `server()` once V1 support is not needed.
 */
const plugin = {
  id: ID,
  setup,
  server: OmniRoutePlugin,
};

export default plugin;
