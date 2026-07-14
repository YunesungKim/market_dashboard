import json
import pytest
from tools import app as app_module
from tools.staging import StagingBoard

ARTICLE = {"title": "기사1", "url": "https://a", "snippet": "내용1",
           "publishedDate": "2026-07-13", "source": "한경"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(app_module, "search_market_trends",
                        lambda top_n=3, api_key=None: {"us": [ARTICLE], "kr": [ARTICLE]})
    monkeypatch.setattr(app_module, "search_news",
                        lambda *a, **k: [ARTICLE])
    published = {}
    monkeypatch.setattr(app_module, "publish",
                        lambda repo_dir, files, message, push=True: published.setdefault("msg", message))
    briefings = str(tmp_path / "briefings.json")
    app = app_module.create_app(briefings_path=briefings, repo_dir=str(tmp_path),
                                board=StagingBoard())
    app.config["PUBLISHED"] = published
    app.config["BRIEFINGS_PATH"] = briefings
    return app.test_client()


def test_trends_populates_board(client):
    r = client.post("/api/trends", json={})
    assert r.status_code == 200
    cards = r.get_json()["cards"]
    assert len(cards) == 2  # 미국1 + 한국1 (fixture 기준)
    assert all("cardId" in c for c in cards)


def test_search_adds_card(client):
    r = client.post("/api/search", json={"company": "삼성전자", "keyword": "HBM", "mode": "serper"})
    assert r.status_code == 200
    assert r.get_json()["card"]["company"] == "삼성전자"


def test_edit_and_delete_card(client):
    cid = client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"}).get_json()["card"]["cardId"]
    r = client.patch(f"/api/cards/{cid}", json={"title": "수정됨"})
    assert r.get_json()["card"]["title"] == "수정됨"
    assert client.delete(f"/api/cards/{cid}").get_json()["deleted"] is True
    assert client.patch("/api/cards/nope", json={"title": "x"}).status_code == 404


def test_search_llm_records_resolved_provider(client, monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)

    class FakeSummarizer:
        model = "claude-sonnet-5"

        def summarize(self, company, keyword, articles):
            return {"title": "T", "summary": "S", "detail": "D"}

    monkeypatch.setattr(app_module, "get_summarizer", lambda provider=None, model=None: FakeSummarizer())
    r = client.post("/api/search", json={"company": "A", "keyword": "", "mode": "llm"})
    assert r.status_code == 200
    card = r.get_json()["card"]
    assert card["generator"]["mode"] == "llm"
    assert card["generator"]["provider"] == "claude"
    assert card["generator"]["model"] == "claude-sonnet-5"
    assert card["title"] == "T"
    assert card["summary"] == "S"
    assert card["detail"] == "D"


def test_search_backend_error_returns_json_500(client, monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("boom")

    monkeypatch.setattr(app_module, "search_news", boom)
    r = client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"})
    assert r.status_code == 500
    assert r.is_json
    assert "boom" in r.get_json()["error"]


def test_publish_writes_and_clears(client):
    client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"})
    r = client.post("/api/publish", json={})
    assert r.get_json()["published"] == 1
    data = json.loads(open(client.application.config["BRIEFINGS_PATH"], encoding="utf-8").read())
    assert len(data) == 1
    assert "cardId" not in data[0]
    assert client.get("/api/cards").get_json()["cards"] == []  # 보드 비워짐


def test_trends_custom_themes(client, monkeypatch):
    monkeypatch.setattr(app_module, "search_news",
                        lambda query, gl="kr", hl="ko", num=10, api_key=None: [dict(ARTICLE) for _ in range(num)])
    themes = [{"label": "나스닥", "query": "nasdaq", "gl": "us", "hl": "en", "count": 2},
              {"label": "코스피", "query": "kospi", "gl": "kr", "hl": "ko", "count": 1}]
    r = client.post("/api/trends", json={"themes": themes})
    assert r.status_code == 200
    assert len(r.get_json()["cards"]) == 3  # 2 + 1


def test_search_llm_uses_model(client, monkeypatch):
    monkeypatch.delenv("LLM_PROVIDER", raising=False)
    captured = {}

    class FakeSummarizer:
        model = "claude-haiku-4-5-20251001"

        def summarize(self, company, keyword, articles):
            return {"title": "T", "summary": "S", "detail": "D"}

    def fake_get(provider=None, model=None):
        captured["provider"] = provider
        captured["model"] = model
        return FakeSummarizer()

    monkeypatch.setattr(app_module, "get_summarizer", fake_get)
    r = client.post("/api/search", json={"company": "A", "keyword": "", "mode": "llm",
                                         "model": "claude-haiku-4-5-20251001"})
    assert r.status_code == 200
    assert captured["model"] == "claude-haiku-4-5-20251001"
    assert r.get_json()["card"]["generator"]["model"] == "claude-haiku-4-5-20251001"


def test_publish_selected_only(client):
    a = client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"}).get_json()["card"]["cardId"]
    b = client.post("/api/search", json={"company": "B", "keyword": "", "mode": "serper"}).get_json()["card"]["cardId"]
    r = client.post("/api/publish", json={"cardIds": [a]})
    assert r.get_json()["published"] == 1
    remaining = client.get("/api/cards").get_json()["cards"]
    assert [c["cardId"] for c in remaining] == [b]  # 미선택 카드는 보드에 남음


def test_get_briefings(client):
    client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"})
    client.post("/api/publish", json={})  # cardIds 없음 → 전체 배포(하위호환)
    r = client.get("/api/briefings")
    assert r.status_code == 200
    assert len(r.get_json()["briefings"]) == 1


def test_delete_briefings(client):
    client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"})
    client.post("/api/publish", json={})
    bid = client.get("/api/briefings").get_json()["briefings"][0]["id"]
    r = client.post("/api/briefings/delete", json={"ids": [bid]})
    assert r.status_code == 200
    assert r.get_json()["removed"] == 1
    assert client.get("/api/briefings").get_json()["briefings"] == []
