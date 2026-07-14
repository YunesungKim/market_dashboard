import datetime
from tools.briefing import make_briefing

FIXED = datetime.datetime(2026, 7, 14, 9, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=9)))
ARTICLES = [
    {"title": "기사1", "url": "https://a", "snippet": "내용1", "publishedDate": "2026-07-13", "source": "한경"},
    {"title": "기사2", "url": "https://b", "snippet": "내용2", "publishedDate": "2026-07-12", "source": "매경"},
]


def test_make_briefing_serper_mode():
    b = make_briefing("삼성전자", "HBM", ARTICLES, now=FIXED)
    assert b["id"] == "2026-07-14-briefing"  # _slugify strips Korean, falls back to "briefing"
    assert b["date"] == "2026-07-14"
    assert b["company"] == "삼성전자"
    assert b["keyword"] == "HBM"
    assert b["title"]  # 비어있지 않음
    assert b["summary"] == "내용1"
    assert "기사1" in b["detail"] and "기사2" in b["detail"]
    assert b["generator"] == {"mode": "serper", "provider": None, "model": None}
    assert b["sources"] == [
        {"title": "기사1", "url": "https://a", "publishedDate": "2026-07-13", "source": "한경"},
        {"title": "기사2", "url": "https://b", "publishedDate": "2026-07-12", "source": "매경"},
    ]
    assert b["createdAt"].startswith("2026-07-14T09:00")


def test_make_briefing_llm_mode_uses_summary_override():
    override = {"title": "LLM 제목", "summary": "LLM 요약", "detail": "LLM 상세"}
    b = make_briefing("삼성전자", "HBM", ARTICLES, mode="llm",
                      provider="claude", model="claude-sonnet-5",
                      summary=override, now=FIXED)
    assert b["title"] == "LLM 제목"
    assert b["summary"] == "LLM 요약"
    assert b["detail"] == "LLM 상세"
    assert b["generator"] == {"mode": "llm", "provider": "claude", "model": "claude-sonnet-5"}
