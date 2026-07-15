import { Plugin, AuthHook, Config, ProviderHook } from '@opencode-ai/plugin';
import { Model } from '@opencode-ai/sdk/v2';
import { z } from 'zod';

type AutoVariant = "coding" | "fast" | "cheap" | "offline" | "smart" | "lkgp";
type FreeModelFreeType = "recurring-daily" | "recurring-monthly" | "recurring-credit" | "one-time-initial" | "keyless" | "discontinued";
/**
 * Normalise display name so free-tier models get a consistent `[Free] ` prefix.
 *
 * "GPT-4.1 (Free)"          → "[Free] GPT-4.1"
 * "DeepSeek V4 Flash Free"  → "[Free] DeepSeek V4 Flash"
 * "Claude Opus 4.7"         → "Claude Opus 4.7"  (unchanged)
 */
declare function normaliseFreeLabel(name: string): string;

/**
 * OpenCode plugin for the OmniRoute AI Gateway.
 *
 * Implements the official `@opencode-ai/plugin` Plugin contract (auth +
 * provider + config hooks) to drive a running OmniRoute instance from
 * OpenCode without hand-curated `provider.<id>.models` blocks in
 * opencode.json[c]:
 *
 *   - `auth`     — registers `/connect <providerId>` flow (API key prompt)
 *   - `provider` — dynamic `/v1/models` fetch with TTL cache, capabilities
 *                  pass-through (OmniRoute is the source of truth — no
 *                  client-side variant synthesis)
 *   - `config`   — backward-compat shim for OC versions that predate the
 *                  `provider.models` hook (≤ 1.14.48)
 *
 * Two ways to consume the plugin:
 *
 *  1. Single-instance (default `providerId: "omniroute"`):
 *
 *     ```json
 *     {
 *       "$schema": "https://opencode.ai/config.json",
 *       "plugin": ["@omniroute/opencode-plugin"]
 *     }
 *     ```
 *
 *  2. Multi-instance via plugin options (prod + preprod side by side):
 *
 *     ```json
 *     {
 *       "$schema": "https://opencode.ai/config.json",
 *       "plugin": [
 *         ["@omniroute/opencode-plugin", { "providerId": "omniroute" }],
 *         ["@omniroute/opencode-plugin", { "providerId": "omniroute-preprod" }]
 *       ]
 *     }
 *     ```
 *
 * Then `opencode connect <providerId>` to provision the API key per instance.
 *
 * Companion library: `@omniroute/opencode-provider` (build-time config generator)
 * remains supported for users who can't run plugins (CI, scripted scaffolding).
 *
 * @see https://opencode.ai/docs/plugins for the OpenCode plugin contract.
 * @see https://github.com/diegosouzapw/OmniRoute for the AI Gateway.
 */

declare const optionsSchema: z.ZodObject<{
    providerId: z.ZodOptional<z.ZodString>;
    displayName: z.ZodOptional<z.ZodString>;
    modelCacheTtl: z.ZodOptional<z.ZodNumber>;
    baseURL: z.ZodOptional<z.ZodString>;
    features: z.ZodOptional<z.ZodObject<{
        combos: z.ZodOptional<z.ZodBoolean>;
        autoCombos: z.ZodOptional<z.ZodBoolean>;
        enrichment: z.ZodOptional<z.ZodBoolean>;
        compressionMetadata: z.ZodOptional<z.ZodBoolean>;
        geminiSanitization: z.ZodOptional<z.ZodBoolean>;
        mcpAutoEmit: z.ZodOptional<z.ZodBoolean>;
        mcpToken: z.ZodOptional<z.ZodString>;
        fetchInterceptor: z.ZodOptional<z.ZodBoolean>;
        usableOnly: z.ZodOptional<z.ZodBoolean>;
        diskCache: z.ZodOptional<z.ZodBoolean>;
        providerTag: z.ZodOptional<z.ZodBoolean>;
        debugLog: z.ZodOptional<z.ZodBoolean>;
        startupDebug: z.ZodOptional<z.ZodBoolean>;
        logLevel: z.ZodOptional<z.ZodEnum<{
            error: "error";
            warn: "warn";
            info: "info";
            debug: "debug";
        }>>;
        apiFormat: z.ZodOptional<z.ZodObject<{
            anthropicPrefixes: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
/**
 * Plugin options shape — inferred directly from the Zod schema so the
 * validator and the static type can never drift. Replaces the standalone
 * interface previously declared here (T-02). Every consumer continues to
 * import `OmniRoutePluginOptions` as before; only the source of truth
 * shifted from a hand-written interface to `z.infer<typeof optionsSchema>`.
 */
type OmniRoutePluginOptions = z.infer<typeof optionsSchema>;
declare const OMNIROUTE_PROVIDER_KEY: "omniroute";
/** Deployed plugin version (injected at build time by tsup define). */
declare const PLUGIN_VERSION: string;
/** Deployed plugin git commit hash (injected at build time by tsup define). */
declare const PLUGIN_GIT_HASH: string;
declare const DEFAULT_MODEL_CACHE_TTL_MS: 300000;
/**
 * Resolve effective options from the optional plugin-options object,
 * applying defaults. Centralises the providerId fallback so every hook
 * sees a consistent identifier.
 */
declare function resolveOmniRoutePluginOptions(opts?: OmniRoutePluginOptions): Required<Pick<OmniRoutePluginOptions, "providerId" | "displayName" | "modelCacheTtl">> & Pick<OmniRoutePluginOptions, "baseURL" | "features">;
/**
 * Strict parse of raw plugin options (as received from opencode.json or a
 * direct factory call) into the validated `OmniRoutePluginOptions` shape.
 *
 *   - `null` / `undefined` → `{}` (no opts is valid, defaults take over).
 *   - Unknown keys → throws (strict schema catches typos in opencode.json).
 *   - Empty / malformed values (e.g. empty providerId, non-URL baseURL,
 *     negative modelCacheTtl) → throws.
 *
 * Validation happens at plugin invocation time (inside `OmniRoutePlugin`),
 * NOT at module import — so a bad opencode.json fails the affected plugin
 * instance with an actionable message instead of crashing the whole TUI on
 * startup.
 *
 * Exported so callers and tests can validate options independent of the
 * full plugin factory invocation.
 */
declare function parseOmniRoutePluginOptions(opts: unknown): OmniRoutePluginOptions;
/**
 * Default provider-prefix list that triggers the Anthropic SDK format.
 * Covers OmniRoute's canonical Anthropic aliases: `cc/`, `claude/`,
 * `anthropic/`, plus the user-configured `kiro/` and `kr/` upstream
 * connections that proxy Anthropic models.
 */
declare const DEFAULT_ANTHROPIC_PREFIXES: string[];
/**
 * Ensure a baseURL ends with `/v1` so the OpenAI-compat SDK constructs
 * `/v1/chat/completions` correctly. The Anthropic SDK does NOT want `/v1`
 * (it appends `/v1/messages` automatically), so callers should branch on
 * format first.
 */
declare function ensureV1Suffix(url: string): string;
/**
 * Resolve the API block (id + url + npm package) for a given model id.
 *
 * Decision matrix:
 * - If the model id's prefix (the substring before the first `/`) is in
 *   `apiFormat.anthropicPrefixes` (or the default list), return the
 *   Anthropic SDK block: `id: "anthropic"`, `url: baseURL` (no `/v1`),
 *   `npm: "@ai-sdk/anthropic"`.
 * - Otherwise return the OpenAI-compat block: `id: "openai-compatible"`,
 *   `url: baseURL + "/v1"`, `npm: "@ai-sdk/openai-compatible"`.
 *
 * Combos span multiple providers. Callers should pass each combo member's
 * id through this function and pick the LCD format (lowest common
 * denominator that every upstream actually understands).
 */
declare function resolveApiBlock(modelId: string, baseURL: string, apiFormat?: {
    anthropicPrefixes?: string[];
}): {
    id: string;
    url: string;
    npm: string;
};
/**
 * Build the AuthHook portion of the plugin for a given options bag. Exported
 * standalone so the auth contract can be unit-tested without faking the full
 * PluginInput / Hooks surface.
 *
 * Contract notes:
 *   - `provider` binds to `providerId` (NOT a hardcoded module constant — fixes
 *     the multi-instance bug in opencode-omniroute-auth@1.2.1 which pinned
 *     `OMNIROUTE_PROVIDER_ID = "omniroute"` at module scope).
 *   - `methods[0]` is the `api` flavor (no OAuth flow; OmniRoute issues bearer
 *     keys directly). Label includes the resolved displayName so multi-instance
 *     setups stay distinguishable in the OC TUI.
 *   - `methods[0].prompts` uses the official `{type:"text", key, message}`
 *     shape from `@opencode-ai/plugin@1.15.6`. The contract does NOT expose
 *     a `mask: true` flag on text prompts — the OC TUI is expected to handle
 *     credential masking by itself (per OC's `auth login` UX).
 *   - `loader` reads the stored credentials via `getAuth()` and projects them
 *     into the AI-SDK `openai-compatible` options shape (`apiKey`, `baseURL`).
 *     The fetch interceptor (`fetch`) is wired in T-04; left absent here so
 *     downstream code falls back to the SDK default fetch.
 *   - The loader rejects non-`api` auth flavors (oauth / wellknown) and empty
 *     keys by returning `{}` — OC then surfaces the `/connect` flow to the
 *     user instead of dispatching a request with bogus credentials.
 */
declare function createOmniRouteAuthHook(opts?: OmniRoutePluginOptions): AuthHook;
/**
 * Plugin factory. Returns the OpenCode Plugin object wired with the three
 * hooks. Concrete hook bodies land in subsequent tickets (T-03 provider.models,
 * T-04 fetch interceptor, T-06 Gemini sanitization, T-07 config backward-compat).
 *
 * Per `@opencode-ai/plugin@1.15.6`, the Plugin signature is
 * `(input: PluginInput, options?: PluginOptions) => Promise<Hooks>` — opts
 * arrive as the SECOND argument (from the `[name, opts]` tuple in
 * opencode.json), NOT as a closure binding. Multi-instance support follows
 * from each plugin tuple invoking the factory with its own opts.
 */
declare const OmniRoutePlugin: Plugin;
/**
 * v1 plugin shape per OC plugin loader (`packages/opencode/src/plugin/shared.ts:readV1Plugin`).
 * OC checks the default export for an object with `{id, server}` shape FIRST.
 * If that fails it falls back to legacy `getLegacyPlugins` which walks every
 * named export and rejects any non-function value — our package has
 * constants (OMNIROUTE_PROVIDER_KEY, DEFAULT_MODEL_CACHE_TTL_MS) + types +
 * schemas as named exports, so the legacy path always fails for us.
 *
 * Using v1 shape skips the legacy walk entirely. The `id` field is the
 * plugin MODULE identifier (one per published package); per-instance
 * `providerId` still flows through `options.providerId` as before.
 */
declare const OmniRouteV1Plugin: {
    id: string;
    server: Plugin;
};

/**
 * Raw shape of a `/v1/models` entry from OmniRoute. Captured verbatim from
 * the prod gateway response (sample at /tmp/prod-v1-models.json: 455 entries).
 * STRICT source-of-truth (OQ-3): every field that lands in ModelV2 traces
 * back to this shape — no client-side variant synthesis.
 */
interface OmniRouteRawModelEntry {
    id: string;
    object?: string;
    owned_by?: string;
    root?: string | null;
    parent?: string | null;
    context_length?: number;
    max_input_tokens?: number;
    max_output_tokens?: number;
    input_modalities?: string[];
    output_modalities?: string[];
    capabilities?: {
        tool_calling?: boolean;
        reasoning?: boolean;
        vision?: boolean;
        thinking?: boolean;
        attachment?: boolean;
        structured_output?: boolean;
        temperature?: boolean;
    };
    release_date?: string;
    last_updated?: string;
    api_format?: string;
}
/**
 * Fetcher contract: returns the raw `/v1/models` entry list from a running
 * OmniRoute instance. Surfaced as a dependency so unit tests can inject a
 * stub without monkey-patching global `fetch`.
 *
 * Why we inline this instead of using `@omniroute/opencode-provider`'s
 * `fetchLiveModels`: the sibling helper returns a stripped `{id, name,
 * contextLength?}` shape (see opencode-provider/src/index.ts:480-569) that
 * drops the `capabilities` / `*_modalities` / `max_*_tokens` blocks T-03
 * needs for ModelV2 pass-through. Adopting the sibling here would force a
 * client-side re-fetch or re-introduce the synthesis we explicitly rejected
 * in OQ-3. A 30-line raw fetcher is cheaper than mutating the sibling's
 * stable v0.1.0 contract.
 */
type OmniRouteModelsFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteRawModelEntry[]>;
/**
 * Default fetcher: `GET <baseURL>/v1/models` with bearer auth + AbortController
 * timeout. Accepts both the `{object:"list", data:[…]}` envelope OmniRoute
 * emits today and a bare-array envelope (defensive — keeps the plugin
 * working if a future OmniRoute build trims the wrapper). Anything that
 * isn't an object with a string `id` is filtered out silently.
 */
declare const defaultOmniRouteModelsFetcher: OmniRouteModelsFetcher;
/**
 * Map a raw `/v1/models` entry → `ModelV2` (the type @opencode-ai/sdk/v2
 * exports as `Model`, re-exported by @opencode-ai/plugin as `ModelV2`).
 *
 * ModelV2 (as of @opencode-ai/sdk@v2 — see node_modules path
 * `@opencode-ai/sdk/dist/v2/gen/types.gen.d.ts:964-1043`) requires a much
 * richer shape than the T-03 spec's mapping table assumed. Concretely it
 * expects:
 *   - flat `id`, `name`, `providerID`, `api: {id,url,npm}`
 *   - nested `capabilities: { temperature, reasoning, attachment, toolcall,
 *     input:{text,audio,image,video,pdf}, output:{…}, interleaved }`
 *   - `cost: { input, output, cache:{read,write} }` (NOT optional)
 *   - `limit: { context, input?, output }`
 *   - `status: "alpha"|"beta"|"deprecated"|"active"`, `options:{}`, `headers:{}`
 *   - `release_date: string`
 *
 * Deviations from the T-03 spec (documented per ticket §2 "CRITICAL: Check
 * the actual ModelV2 type and adapt if field names differ"):
 *   1. Spec's flat `tool_call` / `reasoning` / `attachment` / `modalities`
 *      top-level fields don't exist in ModelV2 — folded into
 *      `capabilities.{toolcall, reasoning, attachment, input.*, output.*}`.
 *   2. `cost: undefined` is illegal (cost is required). OmniRoute doesn't
 *      surface pricing on /v1/models, so we emit a zeroed cost block.
 *      Downstream OC reads this for display only — the live pricing is
 *      OmniRoute's responsibility at routing time.
 *   3. `tool_call` (spec) → `toolcall` (ModelV2 field name; one word).
 *   4. `attachment` (spec) maps from `capabilities.vision` per OmniRoute
 *      convention: vision = ability to receive image attachments. If the
 *      raw entry happens to expose an explicit `capabilities.attachment`
 *      (some combo entries do), that wins.
 *   5. `thinking` from OmniRoute has no 1:1 ModelV2 slot. We OR it into
 *      `reasoning` so thinking-only models still surface a non-false
 *      reasoning flag.
 *   6. `last_updated` from OmniRoute has no ModelV2 slot — dropped (the
 *      spec also flagged this as "may not exist", and the prod sample
 *      confirms it's optional). `release_date` lands in ModelV2.release_date
 *      with `""` fallback (the field is required as `string`).
 *   7. `temperature: true` per OmniRoute convention (OpenAI-compat mode
 *      always supports the temperature knob). If a raw entry sets
 *      `capabilities.temperature` explicitly, that wins.
 *   8. Input/output modality arrays: each known modality flips its boolean.
 *      Unknown strings (future OmniRoute additions) are ignored — when the
 *      server adds new modalities we can map them here without breaking
 *      existing entries.
 *   9. `status: "active"` — OmniRoute doesn't tier models alpha/beta on
 *      /v1/models, and OC needs a non-deprecated status to expose the
 *      model in the picker. If a future entry surfaces an explicit
 *      lifecycle hint we can map it then.
 *  10. `options: {}` and `headers: {}` left empty — they're escape hatches
 *      for OC users to attach per-model overrides; the provider plugin
 *      must not preempt them.
 *  11. `limit.input` is OPTIONAL on ModelV2 (the `?` modifier). We only
 *      emit it when OmniRoute supplies `max_input_tokens` — keeps the
 *      shape clean for combo entries that only carry context_length.
 */
declare function mapRawModelToModelV2(raw: OmniRouteRawModelEntry, ctx: {
    providerId: string;
    baseURL: string;
    apiFormat?: {
        anthropicPrefixes?: string[];
    };
}): Model;
/**
 * Raw shape of a single combo entry as returned by OmniRoute's `/api/combos`.
 *
 * Schema established via a live probe against
 * an OmniRoute `/api/combos` endpoint with a management-scoped key
 * (response saved at /tmp/t05-combos.json) cross-referenced against the
 * source-of-truth in this repo:
 *
 *   - `src/app/api/combos/route.ts` GET handler — emits `{combos: [...]}`
 *     envelope after `getCombos()`.
 *   - `src/lib/db/combos.ts` `getCombos()` — returns rows persisted via
 *     `createCombo` / `updateCombo`, each shaped by `normalizeStoredCombo`.
 *   - `src/lib/combos/steps.ts` `ComboModelStep` + `ComboRefStep` — define
 *     the `models[]` array entry shape (a step references a member model
 *     by its full provider-prefixed id, e.g. `"claude-opus-4-5-thinking"`).
 *
 * Note: the preprod gateway returned `{combos: []}` at probe time (no combos
 * provisioned). The defensive parser accepts both `{combos:[...]}` and a
 * bare array envelope so the plugin keeps working if a future OmniRoute
 * build trims the wrapper (mirrors the same pattern in the sibling
 * `@omniroute/opencode-provider#listCombos`).
 *
 * STRICT source-of-truth (OQ-3, per T-03): every ModelV2 field a combo
 * surfaces traces back to either (a) this raw combo entry or (b) the LCD
 * roll-up across its raw member models. No client-side variant synthesis.
 */
interface OmniRouteRawComboMemberRef {
    /** Step kind: "model" references a raw model id; "combo-ref" nests another combo. */
    kind?: "model" | "combo-ref";
    /** Full model id referenced by this step (when kind === "model"). */
    model?: string;
    /** Nested combo name (when kind === "combo-ref"). */
    comboName?: string;
    /** Routing weight inside the combo (0–100, advisory at LCD time). */
    weight?: number;
    /** Step-local label, distinct from the parent combo's display name. */
    label?: string;
}
interface OmniRouteRawCombo {
    id: string;
    name?: string;
    /** Routing strategy. Surfaced for forward-compat but not consumed by LCD. */
    strategy?: string;
    /** Member step list. Only `kind: "model"` steps participate in LCD. */
    models?: OmniRouteRawComboMemberRef[];
    /** Hidden combos are excluded from the OC model picker. */
    isHidden?: boolean;
    /** When OmniRoute attaches a lifecycle hint we forward it; today it doesn't. */
    release_date?: string;
}
/**
 * Fetcher contract for `/api/combos`. Same DI shape as
 * `OmniRouteModelsFetcher` so unit tests can inject a stub instead of
 * monkey-patching global `fetch`.
 */
type OmniRouteCombosFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteRawCombo[]>;
/**
 * Default fetcher: `GET <baseURL>/api/combos` with bearer auth +
 * AbortController timeout. Accepts both the `{combos: [...]}` envelope the
 * gateway emits today and a bare-array envelope (defensive — keeps the
 * plugin working if a future OmniRoute build trims the wrapper).
 *
 * Differences from `defaultOmniRouteModelsFetcher`:
 *   - URL is `/api/combos`, NOT `/v1/combos`. The `/v1/...` namespace is the
 *     OpenAI-compatible surface (chat completions, models); combo discovery
 *     lives on the management plane under `/api/...`. We tolerate both
 *     `https://host` and `https://host/v1` baseURL forms by stripping the
 *     trailing `/v1` segment before appending `/api/combos`.
 *   - Combos endpoint requires a management-scoped API key when
 *     `REQUIRE_API_KEY` is enabled. We don't enforce that here; the
 *     gateway returns 401/403 with an actionable error which we propagate.
 *
 * Anything that isn't an object with a string `id` is filtered out silently.
 */
declare const defaultOmniRouteCombosFetcher: OmniRouteCombosFetcher;
/**
 * Map a raw combo entry → `ModelV2` by computing the lowest-common-denominator
 * (LCD) of its underlying member models. The LCD policy is the only way to
 * surface a single capability vector to OpenCode without lying: if any member
 * lacks a capability, the combo as a whole cannot guarantee it.
 *
 * LCD rules:
 *   - `limit.context` = `min(...members.context_length)`.
 *   - `limit.output` = `min(...members.max_output_tokens)`.
 *   - `limit.input` = `min(...members.max_input_tokens)` ONLY when every
 *     member declares one (ModelV2.limit.input is optional — better to
 *     omit than to fabricate a min over partial data).
 *   - `capabilities.toolcall` / `reasoning` / `attachment` / `temperature`:
 *     `every(member ⇒ supports?)`. The `reasoning` axis ORs across
 *     `reasoning` and `thinking` per member before AND-ing across the
 *     combo (mirrors `mapRawModelToModelV2`). The `attachment` axis ORs
 *     across `attachment` and `vision` per member. The `temperature` axis
 *     uses default-true semantics: a member supports temperature unless
 *     it explicitly declares `temperature: false`.
 *   - `capabilities.input.*` / `output.*`: flattened AND across members'
 *     modality flags. Missing arrays default to `["text"]` (same default
 *     as `mapRawModelToModelV2`).
 *
 * Defensive: empty members array → ALL capabilities `false`, limits zero.
 * That's an intentional safety posture (you can't route through an empty
 * combo, so OC should grey it out in the picker).
 *
 * Spec mapping (T-05 §Scope.3): `cost` zeroed; `status = "active"`;
 * `release_date = combo.release_date ?? ""`; `api.id = "openai-compatible"`;
 * `name = combo.name ?? combo.id`.
 *
 * @param combo Raw `/api/combos` entry.
 * @param members Raw `/v1/models` entries for THIS combo's member ids.
 *                Caller resolves `combo.models[].model` ids; unknown ids
 *                are silently dropped before this call.
 * @param providerId OpenCode provider id (multi-instance aware).
 * @param baseURL Resolved gateway base URL for ModelV2.api.url.
 */
declare function mapComboToModelV2(combo: OmniRouteRawCombo, members: OmniRouteRawModelEntry[], providerId: string, baseURL: string, apiFormat?: {
    anthropicPrefixes?: string[];
}): Model;
/**
 * Raw shape of an auto combo entry as returned by OmniRoute's
 * `/api/combos/auto` endpoint. Auto combos are virtual — they self-manage
 * provider selection via scoring/bandit exploration at runtime.
 */
interface OmniRouteRawAutoCombo {
    /** Stable id (e.g. "auto", "auto/coding"). */
    id: string;
    /** Human-readable name (e.g. "Auto", "Auto Coding"). */
    name: string;
    /** Variant key or undefined for the default auto. */
    variant?: AutoVariant;
    /** Provider names eligible for this auto combo. */
    candidatePool?: string[];
    /** Number of candidates resolved at fetch time. */
    candidateCount?: number;
    /** MAX of candidates' context windows, served by newer OmniRoute builds.
     * Absent on older servers — mapper falls back to a safe positive default. */
    context_length?: number;
    /** MAX of candidates' max output tokens (same provenance as context_length). */
    max_output_tokens?: number;
    /** Whether this auto combo should be hidden from the picker. */
    isHidden?: boolean;
    /** Auto-combo configuration. */
    config?: {
        auto?: {
            candidatePool?: string[];
            explorationRate?: number;
            routerStrategy?: string;
        };
    };
}
/**
 * Fetcher contract for `/api/combos/auto`. Returns the list of virtual
 * auto combos the server can create. Same DI pattern as other fetchers.
 */
type OmniRouteAutoCombosFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteRawAutoCombo[]>;
/**
 * Default auto combos fetcher: `GET <baseURL>/api/combos/auto`.
 *
 * Fault-tolerant: returns empty array on 404 (endpoint doesn't exist yet)
 * or any non-2xx / network error. Logs a warning in those cases.
 */
declare const defaultOmniRouteAutoCombosFetcher: OmniRouteAutoCombosFetcher;
/**
 * Convert a raw auto combo into a static model entry for the OpenCode picker.
 * Auto combos have tool_call=true, reasoning=true by default (they route
 * to capable models). Context/output limits come from the server (MAX of
 * the candidate pool's windows — the gateway's context pre-filter routes
 * oversized requests to large-window candidates); a safe positive fallback
 * applies when the server omits them. Never 0.
 */
declare function mapAutoComboToStaticEntry(autoCombo: OmniRouteRawAutoCombo): OmniRouteStaticModelEntry;
/**
 * Per-model enrichment overlay derived from OmniRoute's
 * `/api/pricing/models` endpoint. The endpoint returns a per-provider
 * catalog with curated `name` strings (e.g. `Claude 4.7 Opus`,
 * `GPT 5.5 Pro`, `Gemini 3.1 Pro`) and per-million-token pricing
 * (`pricing.input`, `pricing.output`, `pricing.cacheRead`,
 * `pricing.cacheWrite`). These overlay the ModelV2 entries produced by
 * `mapRawModelToModelV2`.
 */
interface OmniRouteEnrichmentEntry {
    /** Human-readable display name. Replaces ModelV2.name when present. */
    name?: string;
    /** Per-million-token cost overlay onto ModelV2.cost. */
    pricing?: {
        input?: number;
        output?: number;
        cacheRead?: number;
        cacheWrite?: number;
    };
    /**
     * Provider alias prefix seen in `/v1/models` ids (e.g. `cc`, `gemini-cli`).
     * Populated by `defaultOmniRouteEnrichmentFetcher` from
     * `/api/pricing/models` keys. Drives the `usableOnly` alias↔canonical
     * resolution.
     */
    providerAlias?: string;
    /**
     * Canonical provider id used by `/api/providers` connections (e.g.
     * `claude`, `gemini-cli`, `kiro`). Populated from the per-provider
     * `entry.id` field inside `/api/pricing/models`.
     */
    providerCanonical?: string;
    /**
     * Human-readable upstream provider label (e.g. `Claude`, `Kiro`,
     * `Windsurf`, `GitHub Models`). Populated from the per-provider
     * `entry.name` field inside `/api/pricing/models`. Used by the
     * `providerTag` feature to suffix `ModelV2.name` with the routing
     * destination so the OC TUI picker can differentiate the same
     * model id sold through different upstream connections.
     */
    providerDisplayName?: string;
    /** Free-model budget type (from freeModelCatalog). */
    freeType?: FreeModelFreeType;
    /** Monthly token budget for recurring free models. */
    monthlyTokens?: number;
    /** Credit token budget for credit-based free models. */
    creditTokens?: number;
}
/** Map keyed by full model id (possibly namespaced, e.g. `cc/claude-sonnet-4-6`). */
type OmniRouteEnrichmentMap = Map<string, OmniRouteEnrichmentEntry>;
type OmniRouteEnrichmentFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteEnrichmentMap>;
/**
 * Default enrichment fetcher — pulls nice display names from
 * `GET /api/pricing/models` and merges per-million-token pricing from
 * `GET /api/pricing` (the actual pricing source — `/api/pricing/models` is
 * a catalog endpoint whose entries are `{id, name, custom}` only).
 *
 * `/api/pricing/models` shape (catalog):
 *  - `{ [providerAlias]: { id, alias, name, models: [{ id, name, custom }] } }`
 *
 * `/api/pricing` shape (pricing only):
 *  - `{ [providerAlias]: { [modelId]: { input, output, cached, reasoning, cache_creation } } }`
 *    where values are USD per million tokens.
 *
 * The two responses are joined on `(providerAlias, modelId)` and the merged
 * entries are stored under both `${providerAlias}/${modelId}` and bare
 * `${modelId}` keys so downstream lookups against either form succeed.
 *
 * Soft-fails (returns whatever was collected) on non-2xx or parse errors;
 * the two fetches are independent so one missing source still surfaces the
 * other.
 */
declare const defaultOmniRouteEnrichmentFetcher: OmniRouteEnrichmentFetcher;
/**
 * Separator used by `applyProviderTag` between the upstream provider
 * label (prefix) and the enriched model name. ASCII hyphen with
 * surrounding spaces — terminal-safe everywhere, never collides with
 * a model id (those use slashes / dots / underscores).
 *
 * Layout: `<short-label> - <model name>` (label leads so column scans
 * group by provider — e.g. `Claude - Claude Opus 4.7`,
 * `Kiro - Claude Opus 4.7`).
 */
declare const PROVIDER_TAG_SEPARATOR = " - ";
declare function shortProviderLabel(enrichment: OmniRouteEnrichmentEntry | undefined): string | undefined;
/**
 * Prepend the upstream provider label to `model.name` so the OC TUI
 * picker can differentiate the same model id sold through different
 * upstream connections (e.g. `cc/claude-opus-4-7` via Anthropic
 * vs `kr/claude-opus-4-7` via Kiro). Result shape:
 *
 *   `<label>${PROVIDER_TAG_SEPARATOR}<enriched name>`
 *   → `Claude - Claude Opus 4.7`
 *   → `Kiro - Claude Opus 4.7`
 *   → `AssemblyAI - Universal 2 (Transcription)` (slot.name fits, used verbatim)
 *   → `GHM - GPT 5`           (slot.name "GitHub Models" > 12 chars → UPPER(alias))
 *
 * Mutates the model in place and is idempotent — running twice never
 * double-prefixes. No-op when:
 *
 *  - `enrichment` is undefined,
 *  - {@link shortProviderLabel} returns `undefined`
 *    (no `providerDisplayName` AND no `providerAlias`),
 *  - the current `model.name` already starts with the prefix.
 *
 * Combos are intentionally skipped by callers (they're multi-upstream
 * by definition; the `Combo: ` prefix conveys that). Raw models call
 * this after `applyEnrichment` so the tag layers on top of the
 * friendly name.
 */
declare function applyProviderTag(model: Model, enrichment: OmniRouteEnrichmentEntry | undefined): Model;
/**
 * Reverse-index the enrichment map from `providerCanonical → providerAlias`.
 *
 * OmniRoute's `/api/pricing/models` is keyed by short ALIAS (`cc`, `cx`,
 * `pol`). But `/v1/models` exposes some models a SECOND time under their
 * CANONICAL name (`claude/claude-opus-4-7`, `codex/gpt-5.5`,
 * `pollinations/midjourney`). Without a reverse map, those canonical
 * rows miss enrichment entirely and surface as raw ids in the picker.
 *
 * Built once per refresh from the enrichment entries themselves — no
 * hardcoded registry. Only records `canonical → alias` mappings when
 * both are present AND distinct (skips slots where alias === canonical
 * like `kiro`).
 */
declare function buildCanonicalToAliasMap(enrichment: OmniRouteEnrichmentMap | undefined): Map<string, string>;
/**
 * Enrichment lookup with alias-fallback chain.
 *
 * Resolution order (first hit wins):
 *
 *   1. `enrichment.get(rawId)` — direct hit on `<prefix>/<modelId>` or
 *      bare id (the fetcher writes under both forms).
 *   2. If `rawId` is `<canonical>/<modelId>` and `canonicalToAlias` has
 *      a mapping for `canonical`, try `<alias>/<modelId>`. This rescues
 *      duplicate rows like `claude/claude-opus-4-7` (canonical) when
 *      enrichment only indexed under `cc/claude-opus-4-7` (alias).
 *   3. Bare `<modelId>` as a last resort. Already covered by step 1 in
 *      practice (fetcher writes bare keys), but kept defensive.
 *
 * Returns `undefined` when no lookup hits.
 */
declare function lookupEnrichment(rawId: string, enrichment: OmniRouteEnrichmentMap | undefined, canonicalToAlias: Map<string, string>): OmniRouteEnrichmentEntry | undefined;
/**
 * Pre-pass: detect raw rows that are the CANONICAL twin of an ALIAS row
 * already in the catalog. Returns the set of canonical-keyed ids to skip
 * during the raw-model loop so each model surfaces exactly once under
 * its enriched alias key.
 *
 * Example: `/v1/models` returns BOTH `cc/claude-opus-4-7` and
 * `claude/claude-opus-4-7`. The former is enriched (alias `cc` exists
 * in `/api/pricing/models`); the latter is raw. We keep `cc/...` and
 * drop `claude/...`.
 *
 * Built once per refresh. Cheap — O(M) where M = raw model count.
 */
declare function canonicalDedupSet(rawModels: ReadonlyArray<OmniRouteRawModelEntry>, canonicalToAlias: Map<string, string>): Set<string>;
/**
 * Build a per-alias index of enrichment metadata so we can render the
 * provider prefix even for raw models that don't have their own
 * curated `/api/pricing/models` entry.
 *
 * Real example: OmniRoute's `pricing['cohere']` slot lists 10 curated
 * models but `/v1/models` also returns `cohere/rerank-multilingual-v3.0`
 * and `cohere/rerank-v4.0-fast` (not in the curated 10). Without this
 * index, those rows surface in the picker as `cohere/...` with no
 * `Cohere - ` prefix because the per-model enrichment lookup misses.
 *
 * This index records the first non-empty `providerDisplayName` seen
 * for each alias, plus the alias itself. Callers use it to synthesize
 * a minimal `OmniRouteEnrichmentEntry` whenever the direct lookup
 * misses but the raw id's prefix matches a known alias.
 *
 * Built once per refresh; first-wins on duplicate alias (matches
 * `buildCanonicalToAliasMap` semantics).
 */
declare function buildAliasIndex(enrichment: OmniRouteEnrichmentMap | undefined): Map<string, OmniRouteEnrichmentEntry>;
/**
 * Resolve a synthesised enrichment entry for `applyProviderTag` /
 * `shortProviderLabel` consumption, combining two sources:
 *
 *  1. The direct per-model enrichment match (if present).
 *  2. A per-alias fallback derived from `buildAliasIndex` — covers raw
 *     ids whose prefix matches a known alias but the specific model
 *     id wasn't curated in `/api/pricing/models`. Example:
 *     `cohere/rerank-multilingual-v3.0` falls back to the cohere slot's
 *     `providerDisplayName='Cohere'` even though that specific id
 *     isn't in the curated 10-model list.
 *
 * Returns `undefined` when neither source surfaces an alias.
 *
 * NOTE: this function is read-only over its inputs; it never mutates
 * the underlying `direct` entry. When it falls back to the alias
 * index, it constructs a fresh minimal entry exposing only the
 * provider-prefix fields (`providerAlias`, `providerCanonical`,
 * `providerDisplayName`). Other fields (name, pricing) are explicitly
 * left undefined so `applyEnrichment` won't accidentally overwrite a
 * model name with the alias-slot label.
 */
declare function resolveProviderTagEntry(rawId: string, direct: OmniRouteEnrichmentEntry | undefined, aliasIndex: Map<string, OmniRouteEnrichmentEntry>, canonicalToAlias?: Map<string, string>): OmniRouteEnrichmentEntry | undefined;

declare function applyEnrichment(model: Model, enrichment: OmniRouteEnrichmentEntry | undefined): Model;
/** Single step in a compression combo's pipeline. */
interface OmniRouteCompressionStep {
    engine: string;
    intensity?: string;
}
/** Compression combo as returned by /api/context/combos. */
interface OmniRouteCompressionCombo {
    id: string;
    name?: string;
    description?: string;
    pipeline: OmniRouteCompressionStep[];
    isDefault?: boolean;
}
type OmniRouteCompressionMetaFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteCompressionCombo[]>;
/**
 * Default compression-metadata fetcher — calls `GET /api/context/combos`.
 * Tolerates envelope shapes `{ combos: [...] }`, `[...]`, or
 * `{ data: [...] }`. Soft-fails (returns []) on non-2xx or parse errors.
 */
declare const defaultOmniRouteCompressionMetaFetcher: OmniRouteCompressionMetaFetcher;
/**
 * Map of well-known compression-intensity tokens to a single emoji
 * conveying "how much" compression is applied. Traffic-light palette:
 *
 *   🟢 minimal / lite   — almost no loss
 *   🟡 standard          — balanced
 *   🟠 aggressive / full — heavy
 *   🔴 ultra             — extreme
 *
 * Lookup is case-insensitive. Unknown intensities fall through to the
 * raw text form (`engine:<intensity>`) so we never hide a value that
 * OmniRoute knows but the plugin doesn't.
 *
 * Exported for callers (and tests) that want to assemble their own
 * pipeline strings.
 */
declare const COMPRESSION_INTENSITY_EMOJI: Record<string, string>;
/**
 * Format a compression pipeline as a short human-readable string for
 * combo `name` decoration. Intensity tokens render as a traffic-light
 * emoji so a column scan reveals "how compressed" the combo is at a
 * glance:
 *
 *   `[rtk🟡 → caveman🟠]`    (rtk:standard → caveman:full)
 *   `[rtk🔴]`                 (rtk:ultra, single-step)
 *   `[caveman]`               (engine without intensity, no emoji)
 *   `[rtk:custom-thing]`      (unknown intensity, raw-text fallback)
 */
declare function formatCompressionPipeline(pipeline: OmniRouteCompressionStep[]): string;
/** Subset of `/api/providers/connections[]` we read. Other fields are kept as a permissive index signature. */
interface OmniRouteProviderConnection {
    /** Connection UUID. */
    id: string;
    /** Canonical provider id, e.g. `claude`, `gemini-cli`, `kiro`. Matches `entry.id` in `/api/pricing/models`. */
    provider: string;
    /** Connection auth flavor, e.g. `apikey`, `oauth`, `cookie`. */
    authType?: string;
    /** Operator-visible label. */
    name?: string;
    /** Operator toggle — when false, the connection is provisioned but disabled. */
    isActive?: boolean;
    /** Health-check verdict — `active` means routable; `expired`/`error`/`unavailable` mean not. */
    testStatus?: string;
    /** Permissive bag — additional fields (priority, backoffLevel, etc.) pass through untouched. */
    [k: string]: unknown;
}
type OmniRouteProvidersFetcher = (baseURL: string, apiKey: string, timeoutMs?: number) => Promise<OmniRouteProviderConnection[]>;
/**
 * Default providers fetcher — calls `GET /api/providers`. Tolerates envelope
 * shapes `{ connections: [...] }`, `[...]`, or `{ data: [...] }`. Soft-fails
 * (returns []) on non-2xx or parse errors so the `usableOnly` filter
 * gracefully degrades to "no filter" instead of hiding the whole catalog.
 */
declare const defaultOmniRouteProvidersFetcher: OmniRouteProvidersFetcher;
/**
 * Compute the set of provider aliases that have at least one healthy,
 * active connection. Resolves alias → canonical id through the enrichment
 * map (which is keyed under both `${alias}/${id}` and bare `${id}` — we
 * walk only the namespaced keys to derive the alias↔canonical mapping).
 *
 * Returns:
 *   - `aliases`: set of alias prefixes safe to keep (e.g. `cc`, `gemini-cli`).
 *   - `canonicals`: set of canonical provider ids (e.g. `claude`, `kiro`).
 *
 * Callers should treat membership in EITHER set as "usable" — raw model
 * ids may be `<alias>/<model>` (`cc/claude-opus-4-7`) OR `<canonical>/<model>`
 * (`claude/sonnet-4`) depending on the OmniRoute deployment's `/v1/models`
 * surface shape.
 *
 * Subtract-filter semantics: callers MUST also keep models whose prefix is
 * unknown to BOTH `/api/pricing/models` and `/api/providers` (e.g.
 * agentrouter-style synthetic prefixes). The right boolean is "if I see this
 * prefix in EITHER catalog table AND it's not usable, drop; otherwise keep".
 */
declare function usableProviderAliasSet(connections: OmniRouteProviderConnection[], enrichment: OmniRouteEnrichmentMap | undefined): {
    aliases: Set<string>;
    canonicals: Set<string>;
    knownAliases: Set<string>;
};
/**
 * Decide whether a raw `/v1/models` id passes the `usableOnly` filter.
 *
 * Rules (subtract-filter — bias toward keep):
 *   - id has no `/` → keep (combos/synthetic entries handled separately).
 *   - prefix matches a known usable alias OR canonical → keep.
 *   - prefix is unknown to BOTH the connection table AND the enrichment
 *     map → keep (we can't prove it's NOT usable; could be agentrouter).
 *   - prefix is known to the enrichment map BUT not in usable set → drop.
 *
 * Pure function — exported so static + dynamic hooks share the same
 * verdict logic without divergence.
 */
declare function isUsableRawModelId(id: string, usable: {
    aliases: Set<string>;
    canonicals: Set<string>;
    knownAliases: Set<string>;
}, enrichment: OmniRouteEnrichmentMap | undefined): boolean;
/**
 * Decide whether a combo passes the `usableOnly` filter. A combo keeps
 * when AT LEAST ONE of its members maps to a usable canonical provider.
 * Combos with zero resolvable members pass through (already degraded to
 * all-false LCD posture and surfaced as cosmetic-only entries).
 */
declare function isUsableCombo(combo: OmniRouteRawCombo, usable: {
    aliases: Set<string>;
    canonicals: Set<string>;
    knownAliases: Set<string>;
}): boolean;
/**
 * Slugify a combo display name into a copy/paste-friendly URL-safe segment.
 * Lowercases, replaces any run of non-alphanumeric chars with a single dash,
 * trims leading/trailing dashes. Empty input or all-special input returns
 * the empty string (caller must fall back to the combo's UUID id).
 *
 * Example: `Claude Tier` → `claude-tier`, `GPT 5.5 / Pro` → `gpt-5-5-pro`.
 */
declare function slugifyComboName(name: string): string;
/**
 * Build a combo's static-block key, provider-prefixed as `<providerId>/<slug>`
 * (e.g. `omniroute/MASTER`, `omniroute/MASTER-LIGHT`), guaranteeing uniqueness
 * across an entire static catalog. If `<providerId>/<slug>` is already present in
 * `used`, suffixes a short UUID-prefix disambiguator from `combo.id` so the second
 * combo doesn't silently overwrite the first. Mutates `used` in place by recording
 * the chosen key. Returns the final `<providerId>/<slug>` key.
 *
 * NOTE: the key MUST carry the OWNING provider prefix (`omniroute/…`), never a
 * `combo/` namespace — OpenCode parses model IDs on `/` to extract the provider,
 * so `combo/MASTER` would resolve provider=`combo` (no credentials) and fail with
 * "Unable to determine provider", whereas `omniroute/MASTER` resolves provider=
 * `omniroute` and the openai-compatible adapter strips the prefix and sends the
 * bare slug upstream, which the server resolves via getComboByName. See PR #4184.
 *
 * Falls back to `<providerId>/<id>` when the friendly name slugifies to the empty
 * string (e.g. a combo named just punctuation).
 */
declare function buildComboKey(combo: OmniRouteRawCombo, used: Set<string>, providerId: string): string;
/**
 * Shared fetch-result cache entry. Holds the RAW `/v1/models` + `/api/combos`
 * responses (NOT a pre-derived ModelV2 / static-entry shape) so the provider
 * hook (T-03/T-05) and the config-shim hook (T-07) can derive their own
 * output shapes from the same source without re-fetching.
 *
 * Why raw instead of derived:
 *   - provider hook emits ModelV2 (rich nested capabilities + cost + limits).
 *   - config hook emits the stripped sibling shape
 *     (`{name, attachment, reasoning, tool_call, temperature, limit?}`).
 *   - These overlap but neither is a superset of the other (ModelV2 has no
 *     `tool_call` field — it's `toolcall`; the stripped shape has no
 *     `cost`/`status`/`headers`). Caching the raw responses is the only
 *     lossless option.
 *   - On OC ≥1.14.49 cold start BOTH hooks fire within the same
 *     OmniRoutePlugin instance — sharing the cache means /v1/models +
 *     /api/combos each hit the gateway exactly ONCE per TTL refresh, not
 *     twice.
 */
interface OmniRouteFetchCacheEntry {
    rawModels: OmniRouteRawModelEntry[];
    rawCombos: OmniRouteRawCombo[];
    rawAutoCombos: OmniRouteRawAutoCombo[];
    /** Display-name + pricing overlay from /api/pricing/models. Empty Map when feature is disabled or fetch failed. */
    rawEnrichment: OmniRouteEnrichmentMap;
    /** Compression combos from /api/context/combos. Empty array when feature is disabled or fetch failed. */
    rawCompressionCombos: OmniRouteCompressionCombo[];
    /** Provider connections from /api/providers. Empty array when feature is disabled or fetch failed. */
    rawConnections: OmniRouteProviderConnection[];
    expiresAt: number;
}
type OmniRouteFetchCache = Map<string, OmniRouteFetchCacheEntry>;
/**
 * Build the ProviderHook portion of the plugin for a given options bag.
 * Exported standalone so the contract is unit-testable without faking the
 * full PluginInput / Hooks surface, and so multi-instance setups can each
 * own their own cache (a fresh hook closure per plugin tuple).
 *
 * Behavioural contract:
 *   - `id` binds to the resolved `providerId` (multi-instance: each plugin
 *     tuple's hook lists models under its own provider id).
 *   - `models(provider, ctx)` extracts the api key from `ctx.auth` (rejecting
 *     non-`api` flavors with `{}` — same posture as the auth loader); calls
 *     both `/v1/models` and `/api/combos` fetchers; maps raw `/v1/models`
 *     entries through `mapRawModelToModelV2`; maps each `/api/combos` entry
 *     through `mapComboToModelV2` (LCD across its member models); merges
 *     combos into the same map under their combo id; caches the unified
 *     result by `(baseURL, sha256(apiKey))` for `modelCacheTtl`.
 *   - **Combo / model ID collisions: combos win.** OmniRoute treats combos
 *     as the curated routing surface; if a combo and a raw model share an
 *     id the operator's intent is clearly the combo. We emit a
 *     `console.warn` exactly once per `(baseURL, apiKey, comboId)`
 *     collision so the operator can spot the unusual naming choice
 *     without log spam on every cache refresh.
 *   - **Combos fetch failure does NOT break the catalog**: soft-fail with
 *     a `console.warn` and fall back to a models-only catalog. Rationale:
 *     `/api/combos` requires a management-scoped key and OmniRoute may
 *     not have any combos provisioned (preprod returned `{combos: []}`
 *     at probe time). Hard-failing the entire catalog when combos are
 *     optional would silently hide the whole provider from OC's model
 *     picker.
 *   - **`/v1/models` fetch failure DOES propagate.** Without models
 *     there's no catalog at all, so an empty `{}` would just mask the
 *     error.
 *   - Cache is in-memory per hook instance, shared between models and
 *     combos (one fetch pair per (baseURL, apiKey) per TTL refresh).
 *
 * @param opts Plugin options (providerId, baseURL, modelCacheTtl, …).
 * @param deps Dependency injection. `fetcher` defaults to the live
 *             `/v1/models` HTTP fetcher; `combosFetcher` defaults to the
 *             live `/api/combos` HTTP fetcher (override for tests / to
 *             disable combos by injecting one that returns `[]`). `now`
 *             defaults to `Date.now` (overridable for TTL tests). `cache`
 *             lets the caller share state across reconstructions (unused
 *             outside tests today).
 */
declare function createOmniRouteProviderHook(opts?: OmniRoutePluginOptions, deps?: {
    fetcher?: OmniRouteModelsFetcher;
    combosFetcher?: OmniRouteCombosFetcher;
    autoCombosFetcher?: OmniRouteAutoCombosFetcher;
    enrichmentFetcher?: OmniRouteEnrichmentFetcher;
    compressionMetaFetcher?: OmniRouteCompressionMetaFetcher;
    providersFetcher?: OmniRouteProvidersFetcher;
    now?: () => number;
    cache?: OmniRouteFetchCache;
}): ProviderHook;
/**
 * Build a `fetch`-compatible interceptor that injects `Authorization: Bearer`
 * (and a default `Content-Type`) onto outbound requests targeting the given
 * `baseURL`. Requests to any other host pass through untouched — the apiKey
 * is treated as a secret bound to the configured OmniRoute instance and
 * MUST NOT leak to third-party endpoints (a vector AI-SDKs occasionally
 * exercise when a tool call rewrites the URL mid-flight).
 *
 * Ported from Alph4d0g's `opencode-omniroute-auth@1.2.1` `createFetchInterceptor`
 * (their `dist/src/plugin.js:477-516`) with these intentional deviations:
 *
 *   - **`baseURL` is required** here (no `localhost:20128/v1` fallback). T-04
 *     callers always have an authoritative baseURL (from plugin opts or
 *     auth.json); a silent local default would be a footgun.
 *   - **Content-Type defaulting is gated on `init.body` presence**. Their
 *     version unconditionally sets `application/json` even on `GET /v1/models`,
 *     which is harmless but noisy; we only set it when there's a body to
 *     describe.
 *   - **Gemini schema sanitisation is NOT applied here** — that's T-06's
 *     responsibility and will land as a body-transform step inside this
 *     same function (or as a thin wrapper around it).
 *   - **Header merge strategy mirrors theirs**: Request-attached headers
 *     first, then `init.headers` overlay, then our injected
 *     Authorization/Content-Type — so the apiKey we own ALWAYS wins over
 *     any caller-supplied Bearer for the same OmniRoute provider.
 *
 * @see https://opencode.ai/docs/plugins for the AuthLoaderResult.fetch contract
 *      (the returned function is invoked by the AI-SDK in lieu of global fetch).
 */
declare function createOmniRouteFetchInterceptor(config: {
    apiKey: string;
    baseURL: string;
}): typeof fetch;
/**
 * Pure function — recursively strip Gemini-incompatible JSON-Schema
 * keywords (`$schema`, `$ref`, `ref`, `additionalProperties`) from the
 * tool definitions on a chat-completions / responses payload.
 *
 * Walks:
 *   - `payload.tools[].function.parameters` (OpenAI chat-completions shape)
 *   - `payload.tools[].function_declaration.parameters` (Gemini-native shape
 *     some adapters round-trip)
 *   - `payload.tools[].input_schema` (Responses-API shape)
 *   - all `properties.<x>` (and `properties.<x>.properties.<y>`…) inside
 *     each container, recursing through nested objects and arrays.
 *   - top-level payload keys (some clients attach a payload-level `$schema`).
 *
 * Returns the cleaned payload. Does NOT mutate input — clones first via
 * `structuredClone` so callers can keep a reference to the original. If
 * the payload is not a record, or carries no tools and no top-level
 * stripped keys, returns a (still cloned) equivalent.
 *
 * Exported so the body-transform layer is unit-testable independent of the
 * fetch wrapper.
 */
declare function sanitizeGeminiToolSchemas(payload: unknown): unknown;
/**
 * Detect whether a payload is bound for a Gemini model. Returns true if
 * `payload.model` is a string AND matches any known Gemini routing pattern:
 *
 *   - case-insensitive substring `gemini` (covers bare `gemini-1.5-pro`,
 *     `gemini-2.5-flash`, etc.)
 *   - `models/gemini-…` (Google Generative AI canonical id form)
 *   - `google-vertex/gemini-…` (OpenCode + AI-SDK Vertex routing prefix)
 *   - `gemini-cli/…` (real OmniRoute alias surfaced on b35 prod `/v1/models`)
 *
 * Liberal by design: a false positive (cleaning a payload that didn't
 * need cleaning) costs only a structuredClone + one walk; a false negative
 * breaks the whole chain by forwarding $schema/additionalProperties to
 * Gemini which throws 400 INVALID_ARGUMENT. The first three checks
 * collapse into the case-insensitive substring check, but they're
 * documented separately so future maintainers see the intent.
 *
 * Exported so callers and tests can probe detection independent of the
 * fetch wrapper.
 */
declare function shouldSanitizeForGemini(payload: unknown): boolean;
/**
 * Wrapper over an inner `fetch` that applies Gemini schema sanitisation to
 * outbound chat-completion / responses request bodies.
 *
 * Behaviour:
 *   - URL gate: only inspects requests whose URL path contains
 *     `/chat/completions` or `/responses` (lenient about prefix — works for
 *     `/v1/chat/completions`, `/openai/v1/chat/completions`, …).
 *   - Body extraction handles `string`, `Buffer` / `Uint8Array`,
 *     `URLSearchParams` (calls `.toString()`), `Blob` (`await .text()`),
 *     AND `Request` input where the body lives on the Request not init.
 *     `ReadableStream` bodies are skipped (see below).
 *   - Body must JSON.parse to a record; otherwise pass-through.
 *   - `shouldSanitizeForGemini` gates the actual transform — non-Gemini
 *     payloads pass through unchanged regardless of endpoint.
 *   - Fail-open: ANY error during extraction / parse / sanitise falls back
 *     to forwarding the original `(input, init)` to the inner fetch.
 *     Sanitisation is a best-effort guard, never a hard failure mode.
 *   - `ReadableStream` bodies → skipped with a ONE-TIME `console.warn`.
 *     The Gemini-quirk only manifests with tool calls in the body, and
 *     OC streams plain text deltas; the operator should still know.
 *
 * @param inner The next fetch in the chain (typically the Bearer-injecting
 *              interceptor from `createOmniRouteFetchInterceptor`).
 */
declare function createGeminiSanitizingFetch(inner: typeof fetch): typeof fetch;
/**
 * Test-only hook: reset the module-level streaming-warning latch so each
 * test can independently assert the one-shot semantics. Not part of the
 * public stability contract — prefixed with `__` per convention to signal
 * "do not depend on this from production code".
 */
declare function __resetGeminiStreamingWarning(): void;
/**
 * Per-model entry shape under `provider.<id>.models[modelId]`. Mirrors
 * `OpenCodeModelEntry` exported by `@omniroute/opencode-provider`. Stripped
 * down to the fields OC's static catalog reader actually consumes — NOT a
 * full ModelV2 (that's the dynamic-hook shape). Optional fields are omitted
 * when OmniRoute didn't surface a value, NOT emitted as `undefined` — the
 * resulting JSON must be diffable across OmniRoute deployments without
 * `undefined` noise.
 */
/** Modalities accepted by OC's static catalog reader (see `@opencode-ai/sdk`). */
type OmniRouteModalityKind = "text" | "audio" | "image" | "video" | "pdf";
interface OmniRouteStaticModelEntry {
    /** Owning provider id. SHOULD match the parent `provider.<id>` key so OC's
     * static-catalog reader resolves credentials via `providerID` instead of
     * parsing the model key on `/`. Optional: OC's schema validator may
     * reject the entire provider block when this field is present but the
     * model KEY already carries the provider prefix (e.g. `omniroute/MASTER`),
     * since the prefix makes the field redundant and the field is not part of
     * OC's expected schema. We omit it from entries and rely on the prefix
     * on the KEY alone. See PR #4184. */
    providerID?: string;
    /** Display label rendered in OC's model picker. Defaults to the model id. */
    name: string;
    /** ISO date the model was released. Surfaces in OC's model card when present. */
    release_date?: string;
    /** Model accepts image / file attachments. */
    attachment?: boolean;
    /** Model exposes a reasoning / extended-thinking surface. */
    reasoning?: boolean;
    /** Model honours the `temperature` parameter. */
    temperature?: boolean;
    /** Model supports function / tool calling. */
    tool_call?: boolean;
    /**
     * Per-million-token cost. Maps from OmniRoute `/api/pricing` shape:
     * `input`/`output` pass through; `cached` → `cache_read`;
     * `cache_creation` → `cache_write`. Omitted when no pricing slot resolves.
     */
    cost?: {
        input: number;
        output: number;
        cache_read?: number;
        cache_write?: number;
    };
    /**
     * Context-window limits. OC's static reader requires both `context` AND
     * `output` when `limit` is present, so the field is only emitted when
     * BOTH are known.
     */
    limit?: {
        context: number;
        output: number;
    };
    /**
     * Modality lists the model accepts (input) and emits (output). Maps from
     * OmniRoute's `input_modalities` / `output_modalities` on `/v1/models`.
     * Emitted only when at least one modality is known — without this field
     * OC's runtime catalog defaults `input.image: false` even when the model
     * card has `attachment: true`, which blocks clipboard image paste in the
     * TUI for vision-capable models.
     */
    modalities?: {
        input: OmniRouteModalityKind[];
        output: OmniRouteModalityKind[];
    };
}
/**
 * Static `provider.<id>` block written to `input.provider` by the config hook.
 * Mirrors `OpenCodeProviderEntry` from `@omniroute/opencode-provider`.
 *
 *   - `npm` is always `"@ai-sdk/openai-compatible"` — OmniRoute exposes an
 *     OpenAI-compatible surface and that's the AI-SDK adapter that speaks it.
 *   - `options.baseURL` MUST be the fully-qualified `/v1` URL (the AI-SDK
 *     appends paths like `/chat/completions` directly under it).
 *   - `options.apiKey` is the bearer token; the fetch interceptor (T-04)
 *     also injects it on the dynamic path, but the static block needs it
 *     embedded too so OC ≤1.14.48 can construct the SDK client without
 *     going through the auth hook.
 */
interface OmniRouteStaticProviderEntry {
    npm: "@ai-sdk/openai-compatible";
    name: string;
    options: {
        baseURL: string;
        apiKey: string;
    };
    models: Record<string, OmniRouteStaticModelEntry>;
}
/**
 * Build the static `provider.<id>` block from raw `/v1/models` + `/api/combos`
 * responses. Pure function — no I/O, no side effects, no dependency on the
 * sibling provider package. Exported so callers and tests can construct the
 * block independently of the auth.json + fetch pipeline.
 *
 * Mapping rules (per the sibling `createOmniRouteProvider` output spec):
 *
 *   - One entry per raw model AND one entry per non-hidden combo.
 *   - `name` = model id (no separate display name on `/v1/models`).
 *   - `attachment` = `caps.attachment ?? caps.vision ?? false` — same
 *     convention as `mapRawModelToModelV2` (T-03).
 *   - `reasoning` = `caps.reasoning || caps.thinking`. Booleans only — we
 *     do NOT emit the field when both source flags are absent (keeps the
 *     stripped shape minimal).
 *   - `temperature` = `caps.temperature ?? true` — OpenAI-compat surface
 *     supports temperature by default; only an explicit `false` suppresses.
 *   - `tool_call` = `caps.tool_calling ?? false`.
 *   - `limit.context` = raw `context_length` when > 0; omitted otherwise.
 *   - `limit.input` = raw `max_input_tokens` when present.
 *   - `limit.output` = raw `max_output_tokens` when present.
 *
 * For combos: LCD across member raw models (matches `mapComboToModelV2`):
 *
 *   - `attachment`, `reasoning`, `tool_call`, `temperature`: `every` member.
 *   - `limit.context` = min(member context_lengths).
 *   - `limit.input` = min(member max_input_tokens) ONLY when every member
 *     declares one.
 *   - `limit.output` = min(member max_output_tokens).
 *   - Empty members → all-false / limits omitted.
 *
 * Collision: combos win (matches the dynamic provider hook).
 *
 * @param rawModels Raw `/v1/models` entries (may be empty).
 * @param rawCombos Raw `/api/combos` entries (may be empty).
 * @param opts      Resolved plugin options (we read `displayName` + `providerId`).
 * @param baseURL   Fully-qualified `/v1` base URL — written verbatim to
 *                  `options.baseURL`. Caller is responsible for `/v1`
 *                  normalisation; we do NOT touch it here.
 * @param apiKey    Bearer token — written verbatim to `options.apiKey`.
 */
declare function buildStaticProviderEntry(rawModels: OmniRouteRawModelEntry[], rawCombos: OmniRouteRawCombo[], opts: ReturnType<typeof resolveOmniRoutePluginOptions>, baseURL: string, apiKey: string, enrichment?: OmniRouteEnrichmentMap, compressionCombos?: OmniRouteCompressionCombo[], connections?: OmniRouteProviderConnection[], rawAutoCombos?: OmniRouteRawAutoCombo[]): OmniRouteStaticProviderEntry;
/**
 * Shape we expect inside `auth.json`. The file is keyed by providerId, with
 * each entry being a flavor-tagged credential. Today only the `api` flavor
 * is consumed by this plugin (OAuth + WellKnown flavors are passed through
 * but never decoded into a static block).
 */
interface AuthJsonApiEntry {
    type: "api";
    key: string;
    baseURL?: string;
}
type AuthJsonShape = Record<string, AuthJsonApiEntry | {
    type?: string;
    [k: string]: unknown;
}>;
/** Resolve the disk-snapshot path for a given providerId. */
declare function diskSnapshotPath(providerId: string): string;
type OmniRouteDiskSnapshotWriter = (providerId: string, entry: Omit<OmniRouteFetchCacheEntry, "expiresAt">) => Promise<void>;
type OmniRouteDiskSnapshotReader = (providerId: string) => Promise<Omit<OmniRouteFetchCacheEntry, "expiresAt"> | undefined>;
/** Best-effort disk write. Soft-fails on any I/O error (no exception thrown). */
declare const defaultDiskSnapshotWriter: OmniRouteDiskSnapshotWriter;
/** Best-effort disk read. Returns `undefined` when missing/corrupt/unreadable. */
declare const defaultDiskSnapshotReader: OmniRouteDiskSnapshotReader;
/** No-op disk-cache pair — used by tests to avoid filesystem side effects. */
declare const noopDiskSnapshotWriter: OmniRouteDiskSnapshotWriter;
/**
 * One captured request/response pair written to the debug JSONL log.
 * Schema documented in the schema-aware `DebugLogEntry` interface below.
 */
interface DebugLogEntry {
    reqId: string;
    providerId: string;
    ts: number;
    url: string;
    method: string;
    reqHeaders: Record<string, string>;
    reqBody: unknown;
    resStatus: number | null;
    resHeaders: Record<string, string>;
    resBody: unknown;
    durationMs: number | null;
    error?: string;
}
declare function debugLogEnabled(providerId: string): boolean;
declare function debugLogSetEnabled(providerId: string, enabled: boolean): void;
declare function debugLogAppend(entry: DebugLogEntry): void;
declare function debugLogRead(providerId: string, limit?: number): DebugLogEntry[];
declare function debugLogGetById(providerId: string, reqId: string): DebugLogEntry | null;
declare function debugLogClear(providerId: string): void;
/**
 * Wrap a fetch function to capture request/response pairs into the debug
 * JSONL log. Honours the `featureDefault` opt-in flag and the on-disk
 * runtime toggle (`debugLogEnabled`).
 */
declare function createDebugLoggingFetch(inner: typeof fetch, providerId: string, featureDefault: boolean): typeof fetch;
declare const noopDiskSnapshotReader: OmniRouteDiskSnapshotReader;
type OmniRouteReadAuthJson = () => Promise<AuthJsonShape | undefined | null>;
declare const defaultReadAuthJson: OmniRouteReadAuthJson;
/**
 * Build the config-hook portion of the plugin for a given options bag.
 * Exported standalone so the contract is unit-testable without faking the
 * full PluginInput / Hooks surface, and so multi-instance setups can each
 * own their own (auth.json reader, fetch cache, fetcher) trio.
 *
 * Behavioural contract:
 *   - Runs BEFORE `auth.loader` in the OC startup sequence (per the
 *     @opencode-ai/plugin contract). `getAuth()` is NOT available here,
 *     so we read `auth.json` directly via the injected reader.
 *   - No-op when:
 *       (a) `auth.json` is missing / unreadable (fresh install before
 *           `/connect`),
 *       (b) `auth.json[providerId]` is missing or not type-api,
 *       (c) `apiKey` is empty after extraction,
 *       (d) `baseURL` is unresolvable (neither opts.baseURL nor
 *           `auth.json[providerId].baseURL`),
 *       (e) `input.provider[providerId]` is ALREADY set (operator override
 *           wins — we never clobber manually-curated catalogs).
 *     Each no-op path emits ONE debug-level breadcrumb to `console.warn`
 *     so the operator can diagnose without log spam. Malformed `auth.json`
 *     warns once and continues as if the file were missing.
 *   - Fail-open on fetcher errors: a `/v1/models` failure → still publish
 *     a stub `{models: {}}` provider block (so OC has a complete-shape
 *     entry to render). A `/api/combos` failure → publish models-only.
 *     Both paths emit ONE `console.warn`.
 *   - When the provider hook (T-03/T-05) has ALREADY populated the shared
 *     cache for this (baseURL, apiKey) tuple, we reuse the raw payloads
 *     directly — no second fetch. (And vice-versa: the config hook fires
 *     first on OC ≥1.14.49 cold start, populating the cache for the
 *     provider hook moments later.)
 *   - DUAL-PUBLISH SAFE: on OC ≥1.14.49 BOTH this static block and the
 *     dynamic `provider.models()` result will land in OC's catalog
 *     reducer. The dynamic block wins by OC's own merge rule — see
 *     OpenCode core's provider resolution order — so emitting both is a
 *     correctness-positive: ≤1.14.48 reads static, ≥1.14.49 prefers
 *     dynamic but the static one keeps things responsive during the
 *     ~50ms window before the dynamic fetch resolves.
 *
 * @param opts Plugin options (validated, resolved with defaults).
 * @param deps Dependency injection.
 *   - `readAuthJson`     — replaces `defaultReadAuthJson` (test stub).
 *   - `fetcher`          — replaces `defaultOmniRouteModelsFetcher`.
 *   - `combosFetcher`    — replaces `defaultOmniRouteCombosFetcher`.
 *   - `now`              — clock for cache TTL (default `Date.now`).
 *   - `cache`            — shared fetch-result cache (see
 *                          `OmniRouteFetchCache`). Pass the same Map the
 *                          provider hook owns to dedupe round-trips.
 *   - `logger`           — `{warn}` sink for breadcrumb capture in tests.
 *                          Defaults to `console`.
 */
declare function createOmniRouteConfigHook(opts?: OmniRoutePluginOptions, deps?: {
    readAuthJson?: OmniRouteReadAuthJson;
    fetcher?: OmniRouteModelsFetcher;
    combosFetcher?: OmniRouteCombosFetcher;
    autoCombosFetcher?: OmniRouteAutoCombosFetcher;
    enrichmentFetcher?: OmniRouteEnrichmentFetcher;
    compressionMetaFetcher?: OmniRouteCompressionMetaFetcher;
    providersFetcher?: OmniRouteProvidersFetcher;
    diskSnapshotReader?: OmniRouteDiskSnapshotReader;
    diskSnapshotWriter?: OmniRouteDiskSnapshotWriter;
    now?: () => number;
    cache?: OmniRouteFetchCache;
    logger?: {
        warn: (...args: unknown[]) => void;
    };
}): (input: Config) => Promise<void>;

export { COMPRESSION_INTENSITY_EMOJI, DEFAULT_ANTHROPIC_PREFIXES, DEFAULT_MODEL_CACHE_TTL_MS, type DebugLogEntry, OMNIROUTE_PROVIDER_KEY, type OmniRouteAutoCombosFetcher, type OmniRouteCombosFetcher, type OmniRouteCompressionCombo, type OmniRouteCompressionMetaFetcher, type OmniRouteCompressionStep, type OmniRouteDiskSnapshotReader, type OmniRouteDiskSnapshotWriter, type OmniRouteEnrichmentEntry, type OmniRouteEnrichmentFetcher, type OmniRouteEnrichmentMap, type OmniRouteFetchCache, type OmniRouteFetchCacheEntry, type OmniRouteModalityKind, type OmniRouteModelsFetcher, OmniRoutePlugin, type OmniRoutePluginOptions, type OmniRouteProviderConnection, type OmniRouteProvidersFetcher, type OmniRouteRawAutoCombo, type OmniRouteRawCombo, type OmniRouteRawComboMemberRef, type OmniRouteRawModelEntry, type OmniRouteReadAuthJson, type OmniRouteStaticModelEntry, type OmniRouteStaticProviderEntry, PLUGIN_GIT_HASH, PLUGIN_VERSION, PROVIDER_TAG_SEPARATOR, __resetGeminiStreamingWarning, applyEnrichment, applyProviderTag, buildAliasIndex, buildCanonicalToAliasMap, buildComboKey, buildStaticProviderEntry, canonicalDedupSet, createDebugLoggingFetch, createGeminiSanitizingFetch, createOmniRouteAuthHook, createOmniRouteConfigHook, createOmniRouteFetchInterceptor, createOmniRouteProviderHook, debugLogAppend, debugLogClear, debugLogEnabled, debugLogGetById, debugLogRead, debugLogSetEnabled, OmniRouteV1Plugin as default, defaultDiskSnapshotReader, defaultDiskSnapshotWriter, defaultOmniRouteAutoCombosFetcher, defaultOmniRouteCombosFetcher, defaultOmniRouteCompressionMetaFetcher, defaultOmniRouteEnrichmentFetcher, defaultOmniRouteModelsFetcher, defaultOmniRouteProvidersFetcher, defaultReadAuthJson, diskSnapshotPath, ensureV1Suffix, formatCompressionPipeline, isUsableCombo, isUsableRawModelId, lookupEnrichment, mapAutoComboToStaticEntry, mapComboToModelV2, mapRawModelToModelV2, noopDiskSnapshotReader, noopDiskSnapshotWriter, normaliseFreeLabel, parseOmniRoutePluginOptions, resolveApiBlock, resolveOmniRoutePluginOptions, resolveProviderTagEntry, sanitizeGeminiToolSchemas, shortProviderLabel, shouldSanitizeForGemini, slugifyComboName, usableProviderAliasSet };
