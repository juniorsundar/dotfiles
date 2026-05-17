import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { StringEnum } from "@earendil-works/pi-ai";
import { Type } from "typebox";
import * as fs from "node:fs";
import * as path from "node:path";

interface SearchResult {
	title: string;
	href: string;
	body: string;
}

interface SearchResponse {
	results?: SearchResult[];
	error?: string;
}

const WebSearchParams = Type.Object({
	query: Type.String({ description: "Search query string" }),
	maxResults: Type.Optional(
		Type.Number({ description: "Maximum results (1-20, default 10)", minimum: 1, maximum: 20 }),
	),
	region: Type.Optional(
		Type.String({ description: "Region code (e.g. us-en, de-de, wt-wt). Defaults to wt-wt." }),
	),
	safesearch: Type.Optional(
		StringEnum(["on", "moderate", "off"] as const, {
			description: "SafeSearch level: on, moderate, off. Default moderate.",
		}),
	),
	timelimit: Type.Optional(
		StringEnum(["d", "w", "m", "y"] as const, {
			description: "Time limit: d (day), w (week), m (month), y (year). Omit for any time.",
		}),
	),
});

const EXTENSION_DIR = __dirname;
const SEARCH_SCRIPT = path.join(EXTENSION_DIR, "scripts", "search.py");

function getUvBinary(): string {
	const home = process.env.HOME || "";
	const candidates = [
		"uv",
		home ? path.join(home, ".local/bin/uv") : undefined,
		home ? path.join(home, ".cargo/bin/uv") : undefined,
		"/usr/local/bin/uv",
	].filter(Boolean) as string[];

	for (const candidate of candidates) {
		if (candidate === "uv" || fs.existsSync(candidate)) return candidate;
	}
	return "uv";
}

function clampMaxResults(value: number | undefined): number {
	if (!Number.isFinite(value)) return 10;
	return Math.max(1, Math.min(20, Math.trunc(value ?? 10)));
}

async function runSearch(
	pi: ExtensionAPI,
	params: {
		query: string;
		maxResults?: number;
		region?: string;
		safesearch?: "on" | "moderate" | "off";
		timelimit?: "d" | "w" | "m" | "y";
	},
	signal?: AbortSignal,
	timeoutMs = 20_000,
): Promise<SearchResponse> {
	const uv = getUvBinary();
	const args = [
		"run",
		"--project",
		EXTENSION_DIR,
		"python",
		SEARCH_SCRIPT,
		"--query",
		params.query,
		"--max-results",
		String(clampMaxResults(params.maxResults)),
		"--region",
		params.region ?? "wt-wt",
		"--safesearch",
		params.safesearch ?? "moderate",
	];

	if (params.timelimit) args.push("--timelimit", params.timelimit);

	try {
		const result = await pi.exec(uv, args, { signal, timeout: timeoutMs, cwd: EXTENSION_DIR });
		const output = result.stdout.trim();
		if (!output) return { error: result.stderr.trim() || `Search exited with code ${result.code}` };

		const parsed = JSON.parse(output) as SearchResponse | SearchResult[];
		if (Array.isArray(parsed)) return { results: parsed };
		return parsed;
	} catch (error: any) {
		return { error: error?.message ?? String(error) };
	}
}

function formatResults(response: SearchResponse): string {
	if (response.error) return `Search failed: ${response.error}`;
	if (!response.results?.length) return "No results found.";

	return response.results
		.map((result, index) => {
			const title = result.title || "Untitled";
			const href = result.href || "No URL";
			const body = result.body || "No snippet";
			return `${index + 1}. **${title}**\n   ${href}\n   ${body}`;
		})
		.join("\n\n");
}

export default function webSearchExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web using DuckDuckGo via ddgs. Returns titles, URLs, and snippets. " +
			"Use for current facts, documentation, news, package versions, or information not in training data. " +
			"Supports region, safesearch, and time filters. Output is limited to 20 results.",
		promptSnippet: "Search the web via DuckDuckGo and return titles, URLs, and snippets",
		promptGuidelines: [
			"Use web_search when you need current, factual, or documentation-related information not in your training data.",
			"Use web_search to find current package versions, official documentation URLs, news, or recent API changes.",
			"When using web_search results, include source URLs in your answer and prefer official or primary sources.",
			"Do not use web_search for questions about files in the repository or the current conversation history.",
		],
		parameters: WebSearchParams,

		async execute(_toolCallId, params, signal, onUpdate) {
			onUpdate?.({
				content: [{ type: "text", text: `Searching web for: ${params.query}` }],
				details: { query: params.query },
			});

			const results = await runSearch(pi, {
				query: params.query,
				maxResults: params.maxResults,
				region: params.region,
				safesearch: params.safesearch,
				timelimit: params.timelimit,
			}, signal);

			return {
				content: [{ type: "text", text: formatResults(results) }],
				details: {
					query: params.query,
					resultCount: results.results?.length ?? 0,
					raw: results,
				},
			};
		},
	});

	pi.registerCommand("web-search", {
		description: "Search the web: /web-search <query>",
		handler: async (args, ctx) => {
			const query = args.trim();
			if (!query) {
				ctx.ui.notify("Usage: /web-search <query>", "warning");
				return;
			}

			ctx.ui.notify(`Searching: ${query}`, "info");
			const results = await runSearch(pi, { query }, ctx.signal);
			const text = formatResults(results);

			pi.sendMessage(
				{
					customType: "web-search-results",
					content: `### Web search results for: "${query}"\n\n${text}`,
					display: true,
					details: { query, resultCount: results.results?.length ?? 0, raw: results },
				},
				{ triggerTurn: true },
			);
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		const uv = getUvBinary();
		try {
			await pi.exec(uv, ["--version"], { timeout: 5_000 });
			await pi.exec(uv, ["run", "--project", EXTENSION_DIR, "python", "-c", "import ddgs"], {
				timeout: 20_000,
				cwd: EXTENSION_DIR,
			});
		} catch (error: any) {
			ctx.ui.notify(
				`web-search: uv/ddgs startup check failed: ${error?.message ?? String(error)}`,
				"error",
			);
		}
	});
}
