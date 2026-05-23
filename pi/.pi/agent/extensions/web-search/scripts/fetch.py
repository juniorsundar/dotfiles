#!/usr/bin/env python3
"""Pi web-fetch helper: fetch HTTP(S) URLs, extract readable content, return JSON."""

from __future__ import annotations

import argparse
import ipaddress
import json
import socket
import sys
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import httpx
from bs4 import BeautifulSoup, Tag
from markdownify import markdownify as md
from readability import Document as ReadabilityDoc

# ---------------------------------------------------------------------------
# Types
# ---------------------------------------------------------------------------

OutputFormat = Literal["markdown", "text"]
ContentCategory = Literal["html", "text_like", "unsupported"]

ExtractedDocument = Dict[str, Any]
"""
Stable shape expected by the TypeScript side:
{
  "url": str,
  "finalUrl": str,
  "statusCode": int,
  "contentType": str | None,
  "title": str | None,
  "format": str,
  "content": str,
  "truncated": bool,
  "contentLength": int,
  "fetchedBytes": int,
  "warnings": List[str],
}
On error:
{
  "error": str,
  "url": str,
  "details": dict | None,
}
"""

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SUPPORTED_HTML_TYPES = {
    "text/html",
    "application/xhtml+xml",
}

SUPPORTED_TEXT_TYPES = {
    "text/plain",
    "text/markdown",
}

SUPPORTED_DATA_TYPES = {
    "application/json",
    "application/xml",
    "text/xml",
}

SUPPORTED_TYPES = SUPPORTED_HTML_TYPES | SUPPORTED_TEXT_TYPES | SUPPORTED_DATA_TYPES

PRIVATE_HOST_CACHE: Dict[str, bool] = {}

USER_AGENT = (
    "pi-web-fetch/0.1 "
    "(+https://github.com/earendil-works/pi-coding-agent; "
    "like curl/8.0)"
)

# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class FetchError(Exception):
    """Controlled error that produces a structured JSON response."""

    def __init__(self, message: str, details: Optional[Dict[str, Any]] = None) -> None:
        self.message = message
        self.details = details or {}
        super().__init__(message)


# ---------------------------------------------------------------------------
# Argument parsing
# ---------------------------------------------------------------------------


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Fetch a URL and extract readable content.",
    )
    parser.add_argument("--url", "-u", required=True, help="HTTP(S) URL to fetch")
    parser.add_argument(
        "--max-chars",
        "-m",
        type=int,
        default=30_000,
        help="Max characters of extracted content (default 30000, max 100000)",
    )
    parser.add_argument(
        "--format",
        "-f",
        choices=["markdown", "text"],
        default="markdown",
        help="Output format (default markdown)",
    )
    parser.add_argument(
        "--timeout",
        "-t",
        type=int,
        default=20,
        help="Request timeout in seconds (default 20)",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=5_242_880,
        help="Max fetch bytes (default 5 MiB)",
    )
    return parser.parse_args(argv)


# ---------------------------------------------------------------------------
# URL validation + SSRF protection
# ---------------------------------------------------------------------------


def is_private_or_local_address(hostname: str) -> Tuple[bool, str]:
    """Check if hostname resolves to a private/local IP."""
    # Check cache first
    cached = PRIVATE_HOST_CACHE.get(hostname)
    if cached is not None:
        return cached, ""

    try:
        addrinfos = socket.getaddrinfo(hostname, 80, type=socket.SOCK_STREAM)
    except OSError as exc:
        PRIVATE_HOST_CACHE[hostname] = True
        return True, f"DNS resolution failed: {exc}"

    for addr_info in addrinfos:
        addr = addr_info[4][0]
        try:
            ip = ipaddress.ip_address(addr)
        except ValueError:
            continue

        if ip.is_loopback:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to loopback address: {addr}"
        if ip.is_private:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to private address: {addr}"
        if ip.is_link_local:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to link-local address: {addr}"
        if ip.is_multicast:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to multicast address: {addr}"
        if ip.is_unspecified:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to unspecified address: {addr}"
        if ip.is_reserved:
            PRIVATE_HOST_CACHE[hostname] = True
            return True, f"Host resolves to reserved address: {addr}"

    PRIVATE_HOST_CACHE[hostname] = False
    return False, ""


def validate_url(url: str) -> httpx.URL:
    """Validate URL scheme/format/SSRF, returning parsed URL or raising FetchError."""
    try:
        parsed = httpx.URL(url)
    except Exception as exc:
        raise FetchError(
            "Invalid URL format",
            {"url": url, "detail": str(exc)},
        ) from exc

    if parsed.scheme not in ("http", "https"):
        raise FetchError(
            f"Unsupported URL scheme: '{parsed.scheme}'. Only http and https are allowed.",
            {"url": url, "scheme": parsed.scheme},
        )

    host = parsed.host
    if not host:
        raise FetchError("URL has no hostname", {"url": url})

    # Check for credentials in URL
    if parsed.username or parsed.password:
        raise FetchError(
            "URL contains embedded credentials (username:password). Refusing to fetch.",
            {"url": url},
        )

    # SSRF guard
    is_private, reason = is_private_or_local_address(host)
    if is_private:
        raise FetchError(
            f"Fetch refused: {reason}",
            {"url": url, "host": host},
        )

    return parsed


# ---------------------------------------------------------------------------
# HTTP fetching
# ---------------------------------------------------------------------------


def fetch_response(
    url: str,
    timeout: float,
    max_bytes: int,
) -> Dict[str, Any]:
    """Fetch URL and return response metadata + body bytes."""
    parsed = validate_url(url)
    url_str = str(parsed)

    with httpx.Client(
        follow_redirects=True,
        max_redirects=5,
        timeout=httpx.Timeout(timeout),
    ) as client:
        response = client.get(
            url_str,
            headers={
                "User-Agent": USER_AGENT,
                "Accept": "text/html, application/xhtml+xml, text/plain, "
                "text/markdown, application/json, application/xml, text/xml;q=0.9, */*;q=0.1",
            },
        )

        final_url = str(response.url)
        # Re-validate final URL after redirects
        if final_url != url_str:
            validate_url(final_url)

        content_type = response.headers.get("content-type")
        category = categorize_content(content_type)

        if category == "unsupported":
            raise FetchError(
                f"Unsupported content type: {content_type or 'unknown'}",
                {
                    "url": url_str,
                    "finalUrl": final_url,
                    "statusCode": response.status_code,
                    "contentType": content_type,
                },
            )

        # Stream body with size limit
        body_chunks: List[bytes] = []
        total_bytes = 0
        for chunk in response.iter_bytes(chunk_size=65536):
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                raise FetchError(
                    f"Response exceeds maximum fetch size ({max_bytes} bytes)",
                    {
                        "url": url_str,
                        "finalUrl": final_url,
                        "statusCode": response.status_code,
                        "contentType": content_type,
                        "maxBytes": max_bytes,
                    },
                )
            body_chunks.append(chunk)

        body = b"".join(body_chunks)

        return {
            "url": url_str,
            "finalUrl": final_url,
            "statusCode": response.status_code,
            "contentType": content_type,
            "body": body,
            "fetchedBytes": total_bytes,
        }


# ---------------------------------------------------------------------------
# Content categorization
# ---------------------------------------------------------------------------


def categorize_content(content_type: Optional[str]) -> ContentCategory:
    """Determine if the content type is HTML, text-like, or unsupported."""
    if not content_type:
        return "html"  # Assume HTML if no content-type

    media_type = content_type.split(";")[0].strip().lower()

    if media_type in SUPPORTED_HTML_TYPES:
        return "html"
    if media_type in SUPPORTED_TEXT_TYPES or media_type in SUPPORTED_DATA_TYPES:
        return "text_like"

    return "unsupported"


def is_supported_content_type(content_type: Optional[str]) -> bool:
    """Return True if the content type is in the supported set."""
    return categorize_content(content_type) != "unsupported"


# ---------------------------------------------------------------------------
# Body decoding
# ---------------------------------------------------------------------------


def decode_body(body: bytes, content_type: Optional[str]) -> str:
    """Decode bytes to string using charset from Content-Type or UTF-8 fallback."""
    charset = "utf-8"
    if content_type:
        for part in content_type.split(";"):
            part = part.strip()
            if part.lower().startswith("charset="):
                charset = part[8:].strip().strip("'\"")
                break

    try:
        return body.decode(charset)
    except (LookupError, UnicodeDecodeError):
        return body.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# Content extraction
# ---------------------------------------------------------------------------


def extract_html(
    html_text: str,
    url: str,
    output_format: OutputFormat,
) -> ExtractedDocument:
    """Extract readable content from HTML using readability-lxml + BeautifulSoup."""
    warnings: List[str] = []

    # Use readability to extract main content
    doc = ReadabilityDoc(html_text, url=url)
    title = doc.short_title() or doc.title() or None

    summary_html = doc.summary()

    # If readability produced nothing useful, fall back to body text
    soup = BeautifulSoup(summary_html, "lxml")

    # Remove remaining boilerplate
    for tag in soup.find_all(["script", "style", "noscript", "nav", "footer", "header"]):
        tag.decompose()

    readable_html = str(soup)
    extracted_text = soup.get_text(separator="\n", strip=True)

    # Check if readability extraction was meaningful
    if len(extracted_text.strip()) < 50:
        warnings.append(
            "Readability extraction returned very little content; "
            "page may require JavaScript. Falling back to raw HTML text."
        )
        # Fallback: extract from full HTML
        full_soup = BeautifulSoup(html_text, "lxml")
        for tag in full_soup.find_all(["script", "style", "noscript"]):
            tag.decompose()
        body = full_soup.find("body")
        if body:
            extracted_text = body.get_text(separator="\n", strip=True)
        else:
            extracted_text = full_soup.get_text(separator="\n", strip=True)

    if output_format == "markdown":
        try:
            content = md(
                readable_html,
                heading_style="ATX",
                bullets="-",
                strip=["script", "style", "noscript", "nav", "footer", "header"],
            )
            # Clean up excessive whitespace in markdown
            content = normalize_whitespace(content)
            if len(content.strip()) < 50:
                warnings.append(
                    "Markdown conversion produced minimal output; falling back to plain text."
                )
                content = extracted_text
        except Exception as exc:
            warnings.append(f"Markdown conversion failed: {exc}; using plain text.")
            content = extracted_text
    else:
        content = extracted_text

    return {
        "title": title,
        "content": normalize_whitespace(content),
        "warnings": warnings,
    }


def extract_text_like(
    text: str,
    content_type: Optional[str],
    output_format: OutputFormat,
) -> ExtractedDocument:
    """Extract content from plain text, markdown, JSON, or XML responses."""
    title: Optional[str] = None
    warnings: List[str] = []
    content = text
    media_type = (content_type or "").split(";")[0].strip().lower()

    # For JSON, try pretty-printing
    if media_type == "application/json":
        try:
            parsed = json.loads(text)
            content = json.dumps(parsed, indent=2, ensure_ascii=False)
        except json.JSONDecodeError:
            content = text
            warnings.append("Content type is JSON but body is not valid JSON; returning raw text.")

    # For XML, keep raw XML
    if media_type in ("application/xml", "text/xml"):
        content = normalize_whitespace(text)

    # For markdown, use directly
    if media_type == "text/markdown" and output_format == "text":
        # Convert markdown to plain text if text output requested
        soup = BeautifulSoup(f"<pre>{text}</pre>", "lxml")
        content = soup.get_text(separator="\n", strip=True)

    return {"title": title, "content": normalize_whitespace(content), "warnings": warnings}


# ---------------------------------------------------------------------------
# Text utilities
# ---------------------------------------------------------------------------


def normalize_whitespace(text: str) -> str:
    """Collapse excessive blank lines and trim trailing whitespace."""
    lines = text.splitlines()
    result: List[str] = []
    blank_count = 0
    for line in lines:
        stripped = line.rstrip()
        if stripped:
            result.append(stripped)
            blank_count = 0
        else:
            blank_count += 1
            if blank_count <= 2:
                result.append("")
    # Trim leading/trailing blank lines
    while result and result[0] == "":
        result.pop(0)
    while result and result[-1] == "":
        result.pop()
    return "\n".join(result)


def truncate_content(text: str, max_chars: int) -> Tuple[str, bool]:
    """Truncate text to max_chars, with message if truncated."""
    max_chars = max(1_000, min(max_chars, 100_000))
    if len(text) <= max_chars:
        return text, False
    # Try to break at a natural boundary within the limit
    truncated = text[:max_chars]
    last_newline = truncated.rfind("\n")
    if last_newline > max_chars // 2:
        truncated = text[:last_newline]
    truncated += (
        f"\n\n[... Content truncated at {max_chars} characters. "
        f"Total document length: {len(text)} characters. "
        f"Use --max-chars to increase limit up to 100,000.]"
    )
    return truncated, True


# ---------------------------------------------------------------------------
# JSON response builders
# ---------------------------------------------------------------------------


def success_json(
    url: str,
    final_url: str,
    status_code: int,
    content_type: Optional[str],
    title: Optional[str],
    output_format: OutputFormat,
    content: str,
    truncated: bool,
    fetched_bytes: int,
    warnings: List[str],
) -> Dict[str, Any]:
    """Build success JSON response."""
    return {
        "url": url,
        "finalUrl": final_url,
        "statusCode": status_code,
        "contentType": content_type,
        "title": title,
        "format": output_format,
        "content": content,
        "truncated": truncated,
        "contentLength": len(content),
        "fetchedBytes": fetched_bytes,
        "warnings": warnings,
    }


def error_json(
    message: str,
    url: str,
    details: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build error JSON response."""
    result: Dict[str, Any] = {
        "error": message,
        "url": url,
    }
    if details:
        result["details"] = details
    return result


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------


def main(argv: Optional[List[str]] = None) -> int:
    """Validate, fetch, extract, print JSON. Return 0 on success, 1 on error."""
    args = parse_args(argv)

    try:
        # Fetch
        fetch_result = fetch_response(
            url=args.url,
            timeout=float(args.timeout),
            max_bytes=args.max_bytes,
        )

        url = fetch_result["url"]
        final_url = fetch_result["finalUrl"]
        status_code = fetch_result["statusCode"]
        content_type = fetch_result.get("contentType")
        body = fetch_result["body"]
        fetched_bytes = fetch_result["fetchedBytes"]

        # Decode
        text = decode_body(body, content_type)

        # Categorize and extract
        category = categorize_content(content_type)

        if category == "html":
            doc = extract_html(text, url, args.format)
        else:
            doc = extract_text_like(text, content_type, args.format)

        title = doc["title"]
        content = doc["content"]
        base_warnings = doc.get("warnings", [])

        # Truncate
        content, truncated = truncate_content(content, args.max_chars)

        # Build success JSON
        result = success_json(
            url=url,
            final_url=final_url,
            status_code=status_code,
            content_type=content_type,
            title=title,
            output_format=args.format,
            content=content,
            truncated=truncated,
            fetched_bytes=fetched_bytes,
            warnings=base_warnings,
        )

        print(json.dumps(result, ensure_ascii=False))
        return 0

    except FetchError as exc:
        print(json.dumps(error_json(exc.message, args.url, exc.details), ensure_ascii=False))
        return 1

    except Exception as exc:
        print(
            json.dumps(
                error_json(f"Internal error: {exc}", args.url),
                ensure_ascii=False,
            )
        )
        return 1


if __name__ == "__main__":
    sys.exit(main())
