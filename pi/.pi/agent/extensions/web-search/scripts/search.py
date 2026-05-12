#!/usr/bin/env python3
"""Pi web-search helper: calls ddgs API and prints JSON results."""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

from ddgs import DDGS


def normalize_result(result: dict[str, Any]) -> dict[str, str]:
    """Return the stable title/href/body shape expected by the extension."""
    return {
        "title": str(result.get("title") or ""),
        "href": str(result.get("href") or result.get("url") or ""),
        "body": str(result.get("body") or result.get("snippet") or ""),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--query", "-q", required=True)
    parser.add_argument("--max-results", "-m", type=int, default=10)
    parser.add_argument("--region", default="wt-wt")
    parser.add_argument("--safesearch", choices=["on", "moderate", "off"], default="moderate")
    parser.add_argument("--timelimit", choices=["d", "w", "m", "y"], default=None)
    args = parser.parse_args()

    try:
        with DDGS() as ddgs:
            results = list(
                ddgs.text(
                    query=args.query,
                    region=args.region,
                    safesearch=args.safesearch,
                    timelimit=args.timelimit,
                    max_results=args.max_results,
                )
            )
        print(json.dumps({"results": [normalize_result(r) for r in results]}, ensure_ascii=False))
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI should report any search failure as JSON.
        print(json.dumps({"error": str(exc)}, ensure_ascii=False))
        return 1


if __name__ == "__main__":
    sys.exit(main())
