import os
import requests

SERPER_NEWS_URL = "https://google.serper.dev/news"


def search_news(query, gl="kr", hl="ko", num=10, api_key=None):
    """Serper News 검색 → 정규화된 기사 리스트."""
    api_key = api_key or os.environ.get("SERPER_API_KEY")
    if not api_key:
        raise RuntimeError("SERPER_API_KEY가 설정되지 않았습니다 (.env 확인)")
    resp = requests.post(
        SERPER_NEWS_URL,
        headers={"X-API-KEY": api_key, "Content-Type": "application/json"},
        json={"q": query, "gl": gl, "hl": hl, "num": num},
        timeout=15,
    )
    resp.raise_for_status()
    return [_normalize(item) for item in resp.json().get("news", [])]


def _normalize(item):
    return {
        "title": item.get("title", ""),
        "url": item.get("link", ""),
        "snippet": item.get("snippet", ""),
        "publishedDate": item.get("date", ""),
        "source": item.get("source", ""),
    }


MARKET_QUERIES = {
    "us": {"query": "US stock market", "gl": "us", "hl": "en", "label": "미국 증시"},
    "kr": {"query": "한국 증시", "gl": "kr", "hl": "ko", "label": "한국 증시"},
}


def search_market_trends(top_n=3, api_key=None):
    """미국/한국 시장별 상위 뉴스 top_n건씩 반환."""
    result = {}
    for market, cfg in MARKET_QUERIES.items():
        articles = search_news(cfg["query"], gl=cfg["gl"], hl=cfg["hl"],
                               num=top_n, api_key=api_key)
        result[market] = articles[:top_n]
    return result
