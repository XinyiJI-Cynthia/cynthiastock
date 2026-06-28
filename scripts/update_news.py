from __future__ import annotations

import json
import os
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
MODEL_ENDPOINT = "https://models.github.ai/inference/chat/completions"
MODEL_NAME = "openai/gpt-4.1"

STOCKS = [
    {
        "code": "600031",
        "name": "三一重工",
        "domestic": '"三一重工" when:30d',
        "global": '"SANY Heavy Industry" when:30d',
    },
    {
        "code": "600111",
        "name": "北方稀土",
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
    for item in root.findall("./channel/item")[:15]:
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


def fallback_analysis(article: dict[str, str], message: str) -> None:
    article.update(
        {
            "aiNature": "无法判断",
            "aiConfidence": "低",
            "aiScope": "待核验",
            "aiReason": message,
            "aiImpact": "现有信息不足，不能判断对公司基本面或股价的影响。",
            "aiSuggestion": "等待原文或公司公告确认，不依据该条信息交易。",
        }
    )


def request_ai_analysis(
    stock: dict[str, str],
    articles: list[dict[str, str]],
    token: str,
) -> dict[str, dict[str, str]]:
    indexed_items = [
        {
            "id": f"{stock['code']}-{index}",
            "title": article["title"],
            "source": article.get("domain", ""),
            "publishedAt": article.get("seendate", ""),
            "sourceBucket": article.get("sourceBucket", ""),
        }
        for index, article in enumerate(articles)
    ]
    system_prompt = """
你是严谨的中国A股公开信息分析助手。只能依据给定的新闻标题、来源、时间和目标股票作判断，不能补写标题中没有的事实。
每一条都必须返回结果，并严格区分：
1. 公司基本面：目标公司的订单、业绩、产能、成本、治理、监管、诉讼等。
2. 行业：可能通过需求、供给或价格传导到目标公司。
3. 市场交易：股价涨跌、资金流、融资交易等，只能视为短期交易信号，不能当作基本面利好或利空。
4. 无关：同行公司自身事项或与目标股票没有清晰传导关系。

性质只能使用：明显利好、偏利好、中性、偏利空、明显利空、无法判断。
采用保守标准：
- “明显利好/明显利空”只用于已经确认、且标题给出足够事实表明可能显著改变收入、利润、成本、产能、核心产品价格或重大风险的事项。
- 员工持股计划、ESG评级、软件著作权、领导慰问、会计准则切换、例行会议和单纯估值指标，通常应判为中性；除非标题明确给出可量化的重大基本面影响。
- 计划、拟议、草案和传闻不能按已经落地处理。
- 集团、母公司或同行事项不能自动归到上市公司；没有清晰传导路径时标为“无关”或“无法判断”。
- 标题信息不足时宁可判为中性或无法判断，不作乐观或悲观推测。
- 明确的股价上涨、主力资金净流入可判为短期“偏利好”；股价加速下跌、主力资金净流出可判为短期“偏利空”。此类市场交易信号不得标为“明显”，并必须说明不能据此推断基本面。
- 单纯估值指标、融资余额或融资净偿还数据如果没有清晰方向含义，仍判为中性。
建议必须是非个性化观察建议，只能使用关注、等待公告确认、警惕短期波动、避免依据单条未证实消息交易等表述，禁止给出确定买入、卖出、目标价或收益预测。
输出纯 JSON 对象，格式：
{"items":[{"id":"原id","scope":"公司基本面|行业|市场交易|无关|待核验","nature":"六种性质之一","confidence":"高|中|低","reason":"判断依据","impact":"可能的影响路径；无清晰路径时明确说明","suggestion":"非个性化观察建议"}]}
""".strip()
    user_payload = {
        "stock": {"code": stock["code"], "name": stock["name"]},
        "items": indexed_items,
    }
    body = {
        "model": MODEL_NAME,
        "temperature": 0.1,
        "max_tokens": 9000,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": json.dumps(user_payload, ensure_ascii=False),
            },
        ],
    }
    request = urllib.request.Request(
        MODEL_ENDPOINT,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
            "User-Agent": USER_AGENT,
            "X-GitHub-Api-Version": "2026-03-10",
        },
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        payload = json.loads(response.read().decode("utf-8"))

    content = payload["choices"][0]["message"]["content"]
    parsed = json.loads(content)
    return {
        str(item.get("id", "")): item
        for item in parsed.get("items", [])
        if item.get("id")
    }


def analyze_articles(
    articles: list[dict[str, str]],
    errors: list[str],
) -> None:
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    analyzed_at = datetime.now(timezone.utc).isoformat()

    for stock in STOCKS:
        stock_articles = [
            article for article in articles if article["stockCode"] == stock["code"]
        ]
        for article in stock_articles:
            fallback_analysis(article, "AI分析任务尚未返回有效结果。")

        if not token or not stock_articles:
            if not token:
                errors.append(f"{stock['code']} AI: GITHUB_TOKEN unavailable")
            continue

        try:
            results = request_ai_analysis(stock, stock_articles, token)
            for index, article in enumerate(stock_articles):
                result = results.get(f"{stock['code']}-{index}")
                if not result:
                    continue
                article.update(
                    {
                        "aiNature": result.get("nature", "无法判断"),
                        "aiConfidence": result.get("confidence", "低"),
                        "aiScope": result.get("scope", "待核验"),
                        "aiReason": result.get("reason", "模型未提供判断依据。"),
                        "aiImpact": result.get(
                            "impact",
                            "模型未提供清晰的影响路径。",
                        ),
                        "aiSuggestion": result.get(
                            "suggestion",
                            "等待更多公开信息确认。",
                        ),
                        "aiModel": MODEL_NAME,
                        "aiAnalyzedAt": analyzed_at,
                    }
                )
        except Exception as error:
            errors.append(f"{stock['code']} AI: {error}")


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

    deduped_articles = list(deduped.values())
    analyze_articles(deduped_articles, errors)

    payload = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "articles": sorted(
            deduped_articles,
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
