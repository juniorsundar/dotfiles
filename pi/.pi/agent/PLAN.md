# Plan: Add `web_fetch` to `extensions/web-search/`

## Goal
Create a companion `web_fetch` tool for the existing `web_search` extension. The tool should work like common coding-agent web fetch tools: `web_search` discovers URLs, then `web_fetch` reads a known URL, extracts readable page content, and gives the agent enough source metadata to cite and reason over the document.

## Target behavior

### Tool name
- `web_fetch`

### Primary schema
```ts
const WebFetchParams = Type.Object({
  url: Type.String({ description: "HTTP(S) URL to fetch and read" }),
  prompt: Type.Optional(Type.String({
    description: "Optional question/instruction about the fetched document, Claude Code-style",
  })),
  maxChars: Type.Optional(Type.Number({
    description: "Maximum characters of extracted content to return (default 30000, max 100000)",
    minimum: 1000,
    maximum: 100000,
  })),
  format: Type.Optional(StringEnum(["markdown", "text"] as const, {
    description: "Output format for readable content. Default markdown.",
  })),
});
```

### Semantics
1. If `url` is provided without `prompt`, return fetched readable content plus metadata.
2. If `prompt` is provided, still fetch/extract the document, and include the prompt alongside the content so the main agent can answer using the fetched source.
3. Optional later enhancement: add nested LLM processing for `prompt` using `complete(...)`, but do not make that v1 mandatory because raw content in the tool result is simpler, transparent, and easier to verify.
4. Start with static HTTP fetching only; no Chromium/browser/JavaScript rendering in v1.
5. Reject unsupported or unsafe fetches clearly rather than failing silently.

## Files to create or modify

### Create: `extensions/web-search/scripts/fetch.py`
Purpose: command-line helper that performs safe-ish HTTP fetching and readable content extraction, returning JSON to TypeScript.

Planned functions:

1. `parse_args() -> argparse.Namespace`
   - CLI flags:
     - `--url` required
     - `--max-chars` default `30000`
     - `--format` choices `markdown|text`, default `markdown`
     - `--timeout` default `20`
     - `--max-bytes` default `5242880` (5 MiB)
   - Keep this script standalone like `scripts/search.py`.

2. `is_private_or_local_address(hostname: str) -> bool`
   - Resolve hostname with `socket.getaddrinfo`.
   - Reject loopback, private, link-local, multicast, unspecified, and reserved IPs via `ipaddress.ip_address`.
   - If DNS resolution fails, return a structured error.
   - This is the SSRF/private-network guardrail.

3. `validate_url(url: str) -> urllib.parse.ParseResult`
   - Require `http` or `https`.
   - Require hostname.
   - Reject username/password URLs.
   - Call private-address guard.
   - Return parsed URL or raise a controlled `FetchError`.

4. `fetch_response(url: str, timeout: float, max_bytes: int) -> FetchPayload`
   - Use `httpx.Client(follow_redirects=True, max_redirects=5, timeout=...)`.
   - Set headers:
     - `User-Agent: pi-web-fetch/0.1 (+https://github.com/earendil-works/pi-coding-agent)` or similar neutral UA
     - `Accept: text/html, text/plain, application/json, application/xml;q=0.9, */*;q=0.1`
   - Stream bytes and stop if `max_bytes` is exceeded.
   - Return status code, final URL, headers, bytes.
   - Re-run URL validation on the final redirected URL.

5. `decode_body(body: bytes, content_type: str | None) -> str`
   - Decode using response encoding if available, otherwise fallback to `utf-8` with replacement.
   - Keep behavior deterministic and avoid crashing on bad encodings.

6. `is_supported_content_type(content_type: str | None) -> Literal[...]`
   - Allow:
     - `text/html`
     - `application/xhtml+xml`
     - `text/plain`
     - `text/markdown`
     - `application/json`
     - `application/xml`, `text/xml`
   - Reject obvious binary/PDF/image/archive media types for v1 with a clear error.

7. `extract_html(html: str, url: str, output_format: str) -> ExtractedDocument`
   - Use `readability-lxml` to find main article/document body.
   - Use `BeautifulSoup` to remove `script`, `style`, `noscript`, nav-like boilerplate if needed.
   - Use `markdownify` for markdown output.
   - Produce fallback text from BeautifulSoup if readability extraction is empty.
   - Extract title from readability short title, `<title>`, or `<h1>`.

8. `extract_text_like(text: str, content_type: str, output_format: str) -> ExtractedDocument`
   - For text/plain or markdown, return normalized text.
   - For JSON, pretty-print if valid JSON; otherwise return raw text.
   - For XML, return text-ish content or raw XML with truncation.

9. `normalize_whitespace(text: str) -> str`
   - Collapse excessive blank lines.
   - Trim trailing whitespace.
   - Preserve markdown structure reasonably.

10. `truncate_content(text: str, max_chars: int) -> tuple[str, bool]`
    - Clamp `max_chars` to 1,000..100,000.
    - Return content and `truncated` boolean.

11. `success_json(...) -> dict`
    - Stable shape expected by TypeScript:
```json
{
  "url": "requested URL",
  "finalUrl": "after redirects",
  "statusCode": 200,
  "contentType": "text/html; charset=utf-8",
  "title": "Document title",
  "format": "markdown",
  "content": "extracted content",
  "truncated": false,
  "contentLength": 12345,
  "fetchedBytes": 45678,
  "warnings": []
}
```

12. `error_json(message: str, details?: dict) -> dict`
    - Stable failure shape:
```json
{
  "error": "Unsupported content type: application/pdf",
  "url": "requested URL",
  "details": {...}
}
```

13. `main() -> int`
    - Validate, fetch, extract, print JSON with `ensure_ascii=False`.
    - Return `0` on success, `1` on controlled fetch/extraction errors.

### Modify: `extensions/web-search/pyproject.toml`
Add dependencies:
```toml
dependencies = [
  "ddgs>=9.0.0",
  "httpx>=0.27.0",
  "beautifulsoup4>=4.12.0",
  "lxml>=5.0.0",
  "readability-lxml>=0.8.1",
  "markdownify>=0.13.0",
]
```
Notes:
- `httpx`: robust HTTP client with redirects, timeouts, streaming.
- `readability-lxml`: main-content extraction.
- `beautifulsoup4` + `lxml`: HTML parsing/fallback cleanup.
- `markdownify`: convert readable HTML to markdown.

### Modify: `extensions/web-search/uv.lock`
Regenerate after dependency changes with `uv lock` or `uv sync` during implementation. This is intentionally an implementation step, not plan-mode work.

### Modify: `extensions/web-search/index.ts`
Purpose: register `web_fetch`, run `fetch.py`, format output, and add optional command.

Planned new/changed declarations:

1. Imports
```ts
import { StringEnum } from "@earendil-works/pi-ai";
```
Already present. Keep using it for `format` enum.

2. New interfaces
```ts
interface FetchResponse {
  url?: string;
  finalUrl?: string;
  statusCode?: number;
  contentType?: string;
  title?: string;
  format?: "markdown" | "text";
  content?: string;
  truncated?: boolean;
  contentLength?: number;
  fetchedBytes?: number;
  warnings?: string[];
  error?: string;
  details?: Record<string, unknown>;
}
```

3. New schema
```ts
const WebFetchParams = Type.Object({ ... });
```
As described above.

4. New constant
```ts
const FETCH_SCRIPT = path.join(EXTENSION_DIR, "scripts", "fetch.py");
```

5. New helper: `clampMaxChars(value: number | undefined): number`
   - Default `30000`.
   - Min `1000`, max `100000`.
   - Same style as existing `clampMaxResults`.

6. New helper: `normalizeFetchFormat(value: unknown): "markdown" | "text"`
   - Default `markdown`.
   - Defensive fallback if params are malformed.

7. New helper: `runFetch(pi, params, signal?, timeoutMs = 30_000): Promise<FetchResponse>`
   - Build `uv run --project EXTENSION_DIR python FETCH_SCRIPT ...` args.
   - Include:
     - `--url params.url`
     - `--max-chars clampMaxChars(params.maxChars)`
     - `--format params.format ?? "markdown"`
   - Parse JSON stdout.
   - Return `{ error }` on empty stdout, JSON parse failure, or `pi.exec` exception.
   - Similar structure to `runSearch`.

8. New helper: `formatFetchResult(response: FetchResponse, prompt?: string): string`
   - On error: `Fetch failed: ...`.
   - On success, produce readable markdown:
```md
# Fetched document

Source: <requested url>
Final URL: <final url if different>
Title: <title>
Status: 200
Content-Type: text/html; charset=utf-8
Truncated: yes/no

Prompt for this document:
<prompt>

## Content
<content>
```
   - Include warnings if present.
   - If `prompt` exists, make it explicit that the answer should be grounded in the fetched document.

9. New optional helper: `fetchDetails(response, params)`
   - Return structured `details` object for tool results:
```ts
{
  url: params.url,
  prompt: params.prompt,
  finalUrl: response.finalUrl,
  statusCode: response.statusCode,
  contentType: response.contentType,
  title: response.title,
  truncated: response.truncated,
  contentLength: response.contentLength,
  fetchedBytes: response.fetchedBytes,
  raw: response,
}
```

10. New tool registration: `pi.registerTool({ name: "web_fetch", ... })`
    - `label: "Web Fetch"`
    - Description should say it fetches a specific HTTP(S) URL and extracts readable text/markdown.
    - `promptSnippet`: "Fetch a URL and return readable document content"
    - `promptGuidelines`:
      - Use `web_fetch` when the user gives a URL or after `web_search` finds a relevant URL.
      - Use `web_search` first when no URL is known.
      - Cite `finalUrl`/source URL when using fetched content.
      - Do not use for repository files or current conversation.
      - Static fetch only; pages requiring JS may be incomplete.
    - `execute(...)`:
      - `onUpdate` message: `Fetching URL: ${params.url}`.
      - Call `runFetch(...)`.
      - Return formatted content and structured details.

11. New command registration: `/web-fetch`
    - Basic command syntax:
      - `/web-fetch <url>` fetches content.
      - Do not support full prompt parsing in v1 command unless easy; tool schema handles prompt better.
    - Handler:
      - validate non-empty arg.
      - notify `Fetching: ...`.
      - call `runFetch(pi, { url }, ctx.signal)`.
      - `pi.sendMessage({ customType: "web-fetch-result", content: ..., display: true, details: ... }, { triggerTurn: true })`.

12. Session startup check update
Current startup checks only `import ddgs`. Update to check fetch dependencies too:
```ts
await pi.exec(uv, ["run", "--project", EXTENSION_DIR, "python", "-c", "import ddgs, httpx, bs4, readability, markdownify"], ...)
```
If dependency import names differ, use the exact import names during implementation.

### Modify: `skills/web-search/SKILL.md`
Purpose: teach the agent when to use `web_search` vs `web_fetch`.

Planned changes:
- Rename/expand from pure Web Search to Web Search + Fetch.
- Add `web_fetch` usage example:
```json
{"url":"https://example.com/docs","prompt":"Extract installation instructions and cite the source"}
```
- Best practices:
  1. Search to discover, fetch to read.
  2. Prefer primary sources.
  3. Cite final URL.
  4. Mention when content was truncated.
  5. If a page appears JS-rendered/incomplete, say so and search for alternate docs/raw markdown.

## Implementation decomposition for later subagent delegation

### Subagent A: Python fetch helper
Scope:
- `extensions/web-search/scripts/fetch.py`
- `extensions/web-search/pyproject.toml`
- `extensions/web-search/uv.lock`

Task:
- Implement the CLI helper and dependency updates.
- Keep JSON output stable.
- Do not touch TypeScript integration.

Verification:
- `cd extensions/web-search && uv run python scripts/fetch.py --url https://example.com --max-chars 5000`
- `cd extensions/web-search && uv run python scripts/fetch.py --url https://example.com --format text`
- Try one unsupported URL/content-type if feasible.

Expected return:
- Files changed.
- Example JSON output summary.
- Any dependency/import issues.

### Subagent B: TypeScript tool integration
Scope:
- `extensions/web-search/index.ts`

Task:
- Add `WebFetchParams`, interfaces, helper functions, tool registration, command, startup dependency check.
- Preserve existing `web_search` behavior.
- Do not alter Python helper beyond assuming its JSON contract.

Verification:
- `tsc --noEmit` if project config covers file, otherwise `npx tsc --noEmit --module NodeNext --moduleResolution NodeNext extensions/web-search/index.ts` if available.
- `oxlint extensions/web-search/index.ts` if available.

Expected return:
- Functions added.
- Tool schema summary.
- Any TypeScript errors/blockers.

### Subagent C: Skill/prompt guidance
Scope:
- `skills/web-search/SKILL.md`
- optional small edits to tool descriptions in `extensions/web-search/index.ts` only if coordinated with Subagent B.

Task:
- Update usage docs/guidance for both `web_search` and `web_fetch`.
- Keep concise; do not duplicate implementation details.

Verification:
- Read the skill file and ensure examples are valid JSON.

Expected return:
- Files changed.
- Summary of guidance added.

### Subagent D: Verification pass
Scope:
- Read-only after A/B/C complete.

Task:
- Run targeted checks.
- Inspect diffs for contract mismatches between `fetch.py` and `index.ts`.
- Report failures with exact commands/output snippets.

Verification commands:
- `git diff -- extensions/web-search skills/web-search/SKILL.md`
- `cd extensions/web-search && uv run python scripts/fetch.py --url https://example.com --max-chars 5000`
- `tsc --noEmit`
- `oxlint extensions`

Expected return:
- Pass/fail table.
- Any mismatches or recommended fixes.

## Main-agent responsibilities
- Own final design decisions and contract stability.
- Review all subagent output before accepting.
- Resolve cross-file integration issues.
- Decide whether nested LLM prompt-processing should be included in v1 or deferred.

## Risks and mitigations
1. **JS-rendered pages return little content**
   - Mitigation: v1 documents limitation; agent can search for raw markdown/docs alternatives.
2. **Large pages blow up context**
   - Mitigation: default `maxChars=30000`, hard cap `100000`, `truncated` flag.
3. **SSRF/private network fetches**
   - Mitigation: scheme allowlist + DNS/IP private-range rejection + final URL validation.
4. **Extraction quality varies**
   - Mitigation: readability first, BeautifulSoup fallback, warnings in JSON.
5. **Dependency/import drift**
   - Mitigation: startup import check and helper script manual tests.
6. **Nested LLM processing increases complexity**
   - Mitigation: v1 returns extracted content and prompt to main agent; consider nested `complete(...)` in v2.

## Acceptance criteria
- `web_search` still works exactly as before.
- `web_fetch` is available as an active tool after reload.
- Fetching `https://example.com` returns title/content/metadata in markdown.
- Fetching an unsupported binary/PDF URL returns a clear error.
- Redirected URLs show both requested and final URL.
- Oversized pages return truncated content with `truncated: true`.
- Skill guidance tells the agent when to search vs fetch.
- Type/lint checks pass or have documented unrelated failures.
