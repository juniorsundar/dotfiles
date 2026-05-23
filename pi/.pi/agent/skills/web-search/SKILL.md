---
name: web-search-fetch
description: Web search via DuckDuckGo and web page fetch. Use to find and read current documentation, facts, news, package versions, or any information not in training data. Supports region, safesearch, time filters, and full page content extraction.
---

# Web Search & Fetch

Search the web using `web_search` (backed by DuckDuckGo via `ddgs`) and fetch full page content using `web_fetch` (HTTP fetch with readability extraction).

## When to use this skill

- User asks about current software versions, API changes, or recently released features
- Need to look up documentation URLs, error messages, or library APIs
- User wants news, facts, or information outside the model's training cutoff
- User provides a URL and asks to read its content
- User asks "what is the latest...", "how do I...", "is there a package for...", or similar current-information questions
- After `web_search` discovers a relevant URL, use `web_fetch` to read the full page

## When NOT to use this skill

- Questions about files already in the repository; use `read`, `grep`, `find`, or `bash`
- Questions about the current conversation history
- Trivial well-known facts, simple math, or information already provided by the user

## How to Use: web_search

Call the `web_search` tool to discover URLs:

```json
{"query": "fastapi lifespan context manager", "maxResults": 5}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `maxResults` | number | 10 | 1-20 results |
| `region` | string | `wt-wt` | Region code, e.g. `us-en`, `de-de`, `wt-wt` |
| `safesearch` | string | `moderate` | `on`, `moderate`, or `off` |
| `timelimit` | string | none | `d` day, `w` week, `m` month, or `y` year |

## How to Use: web_fetch

After discovering a relevant URL via `web_search` (or if the user provides a URL), use `web_fetch` to read the full page content:

```json
{"url": "https://example.com/docs", "maxChars": 20000}
```

With a prompt for the agent to answer about the document:

```json
{"url": "https://example.com/docs", "prompt": "Extract installation instructions and cite the source"}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | required | HTTP(S) URL to fetch |
| `prompt` | string | none | Optional question about the document for the agent to answer |
| `maxChars` | number | 30000 | Max characters (1000-100000) |
| `format` | string | `markdown` | Output format: `markdown` or `text` |

### Output

The tool returns:
- Source metadata: URL, final URL (after redirects), status code, content type, title
- Extracted readable content in markdown (default) or plain text
- `truncated` flag if content exceeds maxChars
- Warnings if readability extraction was limited (page may require JS)
- Errors for unsupported content types (PDF, images, binary), private network URLs, or oversized responses

### Safety

- Only `http` and `https` schemes are allowed
- Private/loopback addresses are rejected (SSRF protection)
- URLs with embedded credentials are rejected
- Fetch is limited to 5 MiB response body
- Extracted content is capped at 100,000 characters
- Redirects are followed (up to 5 hops)
- Timeout defaults to 20 seconds

## Best practices

1. **Search to discover, fetch to read.** Use `web_search` to find URLs, then `web_fetch` to read them.
2. **Prefer primary sources:** Official docs, GitHub repositories, package registries, standards bodies, or publishers.
3. **Include URLs in the answer** when using search or fetch results.
4. **Cite the final URL** after redirects, not just the requested URL.
5. **Synthesize results** instead of dumping raw snippets.
6. **Note truncation.** If `truncated: true`, the response was cut off; consider fetching with `maxChars` up to 100000 or narrowing the query.
7. **If a page appears incomplete** (JS-rendered), search for alternate docs or raw markdown versions.
8. **Be specific in searches:** prefer `python httpx async retry official docs` over `python library`.
9. **Use `timelimit`** for explicitly recent questions.
10. **If initial search results are insufficient,** refine the query and search again.
