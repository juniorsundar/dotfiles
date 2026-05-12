---
name: web-search
description: Web search via DuckDuckGo. Use to find current documentation, facts, news, package versions, or any information not in training data. Supports region, safesearch, and time filters.
---

# Web Search

Search the web using the `web_search` tool, backed by DuckDuckGo through `ddgs`.

## When to use this skill

- User asks about current software versions, API changes, or recently released features
- Need to look up documentation URLs, error messages, or library APIs
- User wants news, facts, or information outside the model's training cutoff
- User asks "what is the latest...", "how do I...", "is there a package for...", or similar current-information questions

## When NOT to use this skill

- Questions about files already in the repository; use `read`, `grep`, `find`, or `bash`
- Questions about the current conversation history
- Trivial well-known facts, simple math, or information already provided by the user

## How to use

Call the `web_search` tool:

```json
{"query": "fastapi lifespan context manager", "maxResults": 5}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | required | Search query |
| `maxResults` | number | 10 | 1-20 results |
| `region` | string | `wt-wt` | Region code, e.g. `us-en`, `de-de`, `wt-wt` |
| `safesearch` | string | `moderate` | `on`, `moderate`, or `off` |
| `timelimit` | string | none | `d` day, `w` week, `m` month, or `y` year |

## Best practices

1. Be specific: prefer `python httpx async retry official docs` over `python library`.
2. Prefer primary sources: official docs, GitHub repositories, package registries, standards bodies, or publishers.
3. Include URLs in the answer when using search results.
4. Synthesize results instead of dumping raw snippets.
5. If initial results are insufficient, refine the query and search again.
6. Use `timelimit` for explicitly recent questions, such as `"w"` for the past week or `"m"` for the past month.
