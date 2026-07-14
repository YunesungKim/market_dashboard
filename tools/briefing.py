import datetime
import re

KST = datetime.timezone(datetime.timedelta(hours=9))


def make_briefing(company, keyword, articles, mode="serper",
                  provider=None, model=None, summary=None, now=None):
    now = now or datetime.datetime.now(KST)
    date = now.strftime("%Y-%m-%d")
    label = company or keyword or "market"
    if summary is None:                       # 모드 A: Serper 조립
        summary = _assemble_serper(label, articles)
    return {
        "id": f"{date}-{_slugify(label)}",
        "date": date,
        "company": company,
        "keyword": keyword,
        "title": summary["title"],
        "summary": summary["summary"],
        "detail": summary["detail"],
        "generator": {"mode": mode, "provider": provider, "model": model},
        "sources": [
            {"title": a["title"], "url": a["url"],
             "publishedDate": a["publishedDate"], "source": a["source"]}
            for a in articles
        ],
        "createdAt": now.isoformat(),
    }


def _assemble_serper(label, articles):
    return {
        "title": f"{label} 관련 주요 동향",
        "summary": articles[0]["snippet"] if articles else "",
        "detail": "\n\n".join(f"- {a['title']}: {a['snippet']}" for a in articles),
    }


def _slugify(text):
    ascii_only = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return ascii_only or "briefing"
