import json
from tools.store import load_briefings, append_briefings


def test_load_missing_file_returns_empty(tmp_path):
    assert load_briefings(str(tmp_path / "none.json")) == []


def test_append_creates_and_accumulates(tmp_path):
    p = str(tmp_path / "briefings.json")
    append_briefings(p, [{"id": "2026-07-14-briefing", "title": "A"}])
    append_briefings(p, [{"id": "2026-07-14-briefing", "title": "B"}])
    data = json.loads(open(p, encoding="utf-8").read())
    assert len(data) == 2
    # id 충돌 고유화
    assert data[0]["id"] == "2026-07-14-briefing"
    assert data[1]["id"] == "2026-07-14-briefing-2"


def test_append_writes_utf8_unescaped(tmp_path):
    p = str(tmp_path / "briefings.json")
    append_briefings(p, [{"id": "x", "title": "삼성전자"}])
    raw = open(p, encoding="utf-8").read()
    assert "삼성전자" in raw  # ensure_ascii=False
