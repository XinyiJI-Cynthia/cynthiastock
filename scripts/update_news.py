from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "news.json"
USER_AGENT = "Mozilla/5.0 (compatible; PersonalStockBrief/1.0)"

STOCKS = [
    {
        "code": "600031",
        "domestic": '"三一重工" when:30d',
        "global": '"SANY Heavy Industry" when:30d',
    },
    {
        "code": "600111",
        "domestic": '"北方稀土" when:30d',
        "global": '"China Northern Rare Earth" when:30d',
    },
]

FEEDS = {
    "domestic": {"hl": "zh-CN", "gl": "CN", "ceid": "CN:zh-Hans"},
    "global": {"hl": "en-US", "gl": "US", "ceid": "US:en"},
}


def text(node: ET.Element, name: str) -> str:
    child = node.find(name)
    return (child.text or "").strip() if child is not None else ""


def build_feed_url(query: str, locale: dict[str, str]) -> str:
    params = urllib.parse.urlencode({"q": query, **locale})
    return f"https://news.google.com/rss/search?{params}"


def fetch_feed(stock_code: str, bucket: str, query: str) -> list[dict[str, str]]:
    url = build_feed_url(query, FEEDS[bucket])
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=45) as response:
        root = ET.fromstring(response.read())

    articles: list[dict[str, str]] = []
    for item in root.findall("./channel/item")[:25]:
        title = text(item, "title")
        link = text(item, "link")
        published = text(item, "pubDate")
        source_node = item.find("source")
        source_name = (source_node.text or "").strip() if source_node is not None else ""
        source_url = source_node.attrib.get("url", "") if source_node is not None else ""
        domain = urlparse(source_url or link).hostname or source_name

        if not title or not link:
            continue

        try:
            seen_date = parsedate_to_datetime(published).astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError):
            seen_date = published

        articles.append(
            {
                "stockCode": stock_code,
                "sourceBucket": bucket,
                "title": title,
                "url": link,
                "domain": (domain or "").removeprefix("www."),
                "language": "Chinese" if bucket == "domestic" else "English",
                "sourcecountry": "China" if bucket == "domestic" else "",
                "seendate": seen_date,
            }
        )
    return articles


def main() -> None:
    articles: list[dict[str, str]] = []
    errors: list[str] = []

    for stock in STOCKS:
        for bucket in ("domestic", "global"):
            try:
                articles.extend(fetch_feed(stock["code"], bucket, stock[bucket]))
            except Exception as error:  # Keep successful feeds if one source is temporarily down.
                errors.append(f"{stock['code']} {bucket}: {error}")
            time.sleep(1)

    if not articles:
        raise RuntimeError("No news feeds returned articles: " + "; ".join(errors))

    deduped: dict[tuple[str, str], dict[str, str]] = {}
    for article in articles:
        deduped[(article["stockCode"], article["url"])] = article

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "articles": sorted(
            deduped.values(),
            key=lambda article: article.get("seendate", ""),
            reverse=True,
        ),
        "errors": errors,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
