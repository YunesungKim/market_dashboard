# 증시 브리핑 대시보드 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serper 뉴스 검색으로 증시 브리핑 후보를 만들고, 로컬 스테이징 보드에서 큐레이션한 뒤 GitHub Pages 공개 아카이브로 배포하는 시스템을 만든다.

**Architecture:** 3-파트 — (1) Flask 로컬 서버(`tools/`)가 키를 쥐고 Serper 검색·LLM 요약·git push를 수행, (2) 서버가 서빙하는 생성 화면(스테이징 보드)에서 큐레이션, (3) GitHub Pages가 루트의 정적 파일(`index.html` + `briefings.json`)로 공개 아카이브를 서빙. 두 Unit은 `briefings.json` 스키마 하나로만 통신한다.

**Tech Stack:** Python 3.10+ / Flask, requests, anthropic, python-dotenv, pytest / 순수 HTML·CSS·JS(빌드 도구 없음)

## Global Constraints

- Python 3.10+ 사용. 프론트엔드는 빌드 도구 없이 순수 HTML/CSS/JS만 사용.
- 모든 비밀 키는 `.env`에서만 로드하고 **절대 커밋하지 않는다** (`.gitignore`에 `.env` 등록).
- 키는 서버에만 존재하며 브라우저 응답/공개 스냅샷에 포함되지 않는다.
- 공개 아카이브(GitHub Pages)의 소스는 **저장소 루트**다. `index.html`·`app.js`·`style.css`·`briefings.json`은 루트에 위치한다.
- `briefings.json`은 배열 하나에 누적한다(날짜별 파일 분리 안 함). JSON은 `ensure_ascii=False, indent=2`로 저장한다.
- UI 문구는 한국어. 반응형은 모바일 우선(Mobile-first).
- 데이터 스키마는 PRD 3.5 항목을 정본으로 한다.
- 커밋은 각 태스크 끝에서 자주 한다. Serper/LLM 호출은 테스트에서 반드시 mock 한다(실제 네트워크·키 사용 금지).

---

## File Structure

```
market_dashboard/
├── index.html              # Unit 2 공개 아카이브 (Pages 루트)   [Task 11에서 교체]
├── app.js                  # 아카이브 로직: briefings.json fetch → 카드 → 상세 모달
├── style.css               # 아카이브 스타일 (모바일 우선)
├── briefings.json          # 공개 데이터 (초기값 [])                [Task 1에서 생성]
├── .env.example            # 키 템플릿 (값 없음)                    [Task 1]
├── .gitignore              # .env 등 제외                          [Task 1에서 수정]
├── tools/                  # Unit 1 로컬 생성 도구 (Pages와 분리)
│   ├── __init__.py
│   ├── app.py              # Flask 서버 (엔드포인트 + 생성 화면 서빙)
│   ├── serper_client.py    # Serper News 검색 + 정규화 + 시장 동향
│   ├── briefing.py         # 브리핑 dict 빌더 (모드 A 조립)
│   ├── store.py            # briefings.json load/append
│   ├── staging.py          # StagingBoard (후보 카드 임시 상태)
│   ├── publisher.py        # git add/commit/push
│   ├── summarizer.py       # LLM provider 추상화 (Summarizer/ClaudeSummarizer)
│   ├── requirements.txt
│   ├── templates/
│   │   └── index.html      # 생성 화면(스테이징 보드) HTML
│   └── static/
│       ├── generate.js     # 생성 화면 로직
│       └── generate.css
└── tests/
    ├── __init__.py
    ├── test_serper_client.py
    ├── test_briefing.py
    ├── test_store.py
    ├── test_staging.py
    ├── test_publisher.py
    ├── test_summarizer.py
    └── test_app.py
```

- **책임 분리:** 검색(`serper_client`), 조립(`briefing`), 저장(`store`), 임시 큐레이션 상태(`staging`), 배포(`publisher`), LLM(`summarizer`)을 각각 한 파일로. `app.py`는 이들을 HTTP로 엮기만 한다.
- **테스트 실행:** 저장소 루트에서 `python -m pytest`. 모듈은 `from tools.xxx import ...`로 import.

---

### Task 1: 프로젝트 스캐폴딩 & 시크릿 위생

**Files:**
- Modify: `.gitignore`
- Create: `.env.example`, `briefings.json`, `tools/__init__.py`, `tools/requirements.txt`, `tests/__init__.py`

**Interfaces:**
- Consumes: 없음
- Produces: `.env`가 git에서 무시되는 상태, 루트 `briefings.json`(`[]`), 의존성 목록

- [ ] **Step 1: `.gitignore` 갱신**

기존 내용(`temp/`)에 아래를 더한다:

```
# Ignore personal reference folder
temp/

# Secrets — 절대 커밋 금지
.env

# Python
__pycache__/
*.pyc
.venv/
venv/
.pytest_cache/
```

- [ ] **Step 2: `.env.example` 생성 (값 없는 템플릿)**

```
SERPER_API_KEY=
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-sonnet-5
# 향후: GEMINI_API_KEY=
```

- [ ] **Step 3: 루트 `briefings.json` 생성 (초기 빈 배열)**

```json
[]
```

- [ ] **Step 4: `tools/requirements.txt` 생성**

```
flask>=3.0
requests>=2.31
anthropic>=0.40
python-dotenv>=1.0
pytest>=8.0
```

- [ ] **Step 5: 빈 패키지 파일 생성**

`tools/__init__.py`, `tests/__init__.py` — 빈 파일.

- [ ] **Step 6: 의존성 설치**

Run: `python -m pip install -r tools/requirements.txt`
Expected: 설치 성공 (에러 없이 종료)

- [ ] **Step 7: 시크릿 위생 검증**

로컬에 `.env`를 임시로 만들고 무시되는지 확인:
Run: `printf 'SERPER_API_KEY=dummy\n' > .env; git status --porcelain`
Expected: 출력에 `.env`가 **없어야** 한다 (`.env.example`, `briefings.json` 등만 표시)

- [ ] **Step 8: Commit**

```bash
git add .gitignore .env.example briefings.json tools/__init__.py tools/requirements.txt tests/__init__.py
git commit -m "chore: 프로젝트 스캐폴딩 및 .env 시크릿 위생"
```

---

### Task 2: Serper 뉴스 검색 클라이언트

**Files:**
- Create: `tools/serper_client.py`
- Test: `tests/test_serper_client.py`

**Interfaces:**
- Consumes: 없음 (환경변수 `SERPER_API_KEY`)
- Produces:
  - `search_news(query: str, gl="kr", hl="ko", num=10, api_key=None) -> list[dict]`
  - 각 dict = `{"title", "url", "snippet", "publishedDate", "source"}`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_serper_client.py`

```python
from unittest.mock import patch, MagicMock
from tools.serper_client import search_news


def _fake_response(payload):
    resp = MagicMock()
    resp.json.return_value = payload
    resp.raise_for_status.return_value = None
    return resp


def test_search_news_normalizes_fields():
    payload = {"news": [
        {"title": "삼성전자 HBM 공급", "link": "https://a.com",
         "snippet": "요약문", "date": "1 day ago", "source": "한경"}
    ]}
    with patch("tools.serper_client.requests.post", return_value=_fake_response(payload)) as post:
        result = search_news("삼성전자 HBM", api_key="k")
    assert result == [{
        "title": "삼성전자 HBM 공급", "url": "https://a.com",
        "snippet": "요약문", "publishedDate": "1 day ago", "source": "한경",
    }]
    # 요청 페이로드 검증
    _, kwargs = post.call_args
    assert kwargs["json"] == {"q": "삼성전자 HBM", "gl": "kr", "hl": "ko", "num": 10}
    assert kwargs["headers"]["X-API-KEY"] == "k"


def test_search_news_missing_key_raises():
    import pytest
    with patch.dict("os.environ", {}, clear=True):
        with pytest.raises(RuntimeError):
            search_news("query")
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_serper_client.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.serper_client`)

- [ ] **Step 3: 최소 구현 작성** — `tools/serper_client.py`

```python
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
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_serper_client.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/serper_client.py tests/test_serper_client.py
git commit -m "feat: Serper 뉴스 검색 클라이언트"
```

---

### Task 3: 시장 동향(미국/한국 Top3) 검색

**Files:**
- Modify: `tools/serper_client.py`
- Test: `tests/test_serper_client.py`

**Interfaces:**
- Consumes: `search_news(...)` (Task 2)
- Produces:
  - `MARKET_QUERIES: dict` — 시장키 → `{"query","gl","hl","label"}`
  - `search_market_trends(top_n=3, api_key=None) -> dict` — `{"us": [기사...], "kr": [기사...]}`

- [ ] **Step 1: 실패하는 테스트 추가** — `tests/test_serper_client.py`

```python
from tools.serper_client import search_market_trends


def test_search_market_trends_returns_top_n_per_market():
    def fake_search_news(query, gl="kr", hl="ko", num=10, api_key=None):
        return [{"title": f"{gl}-{i}", "url": "u", "snippet": "s",
                 "publishedDate": "", "source": "x"} for i in range(num)]

    with patch("tools.serper_client.search_news", side_effect=fake_search_news):
        trends = search_market_trends(top_n=3, api_key="k")
    assert set(trends.keys()) == {"us", "kr"}
    assert len(trends["us"]) == 3
    assert len(trends["kr"]) == 3
    assert trends["us"][0]["title"] == "us-0"
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_serper_client.py::test_search_market_trends_returns_top_n_per_market -v`
Expected: FAIL (`ImportError: cannot import name 'search_market_trends'`)

- [ ] **Step 3: 구현 추가** — `tools/serper_client.py` 하단에 추가

```python
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
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_serper_client.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/serper_client.py tests/test_serper_client.py
git commit -m "feat: 미국/한국 시장 동향 Top3 검색"
```

---

### Task 4: 브리핑 빌더 (모드 A 조립)

**Files:**
- Create: `tools/briefing.py`
- Test: `tests/test_briefing.py`

**Interfaces:**
- Consumes: 기사 리스트(Task 2 형식)
- Produces:
  - `make_briefing(company, keyword, articles, mode="serper", provider=None, model=None, summary=None, now=None) -> dict`
  - 반환 dict은 PRD 3.5 스키마: `id, date, company, keyword, title, summary, detail, generator, sources, createdAt`
  - `summary` 인자가 주어지면(모드 B) `{title, summary, detail}`로 본문을 채우고, None이면 모드 A 조립.

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_briefing.py`

```python
import datetime
from tools.briefing import make_briefing

FIXED = datetime.datetime(2026, 7, 14, 9, 0, tzinfo=datetime.timezone(datetime.timedelta(hours=9)))
ARTICLES = [
    {"title": "기사1", "url": "https://a", "snippet": "내용1", "publishedDate": "2026-07-13", "source": "한경"},
    {"title": "기사2", "url": "https://b", "snippet": "내용2", "publishedDate": "2026-07-12", "source": "매경"},
]


def test_make_briefing_serper_mode():
    b = make_briefing("삼성전자", "HBM", ARTICLES, now=FIXED)
    assert b["id"] == "2026-07-14-samsung"  # 아래 _slugify 규칙과 일치해야 함
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_briefing.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.briefing`)

- [ ] **Step 3: 구현 작성** — `tools/briefing.py`

```python
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
```

> **주의:** `_slugify("삼성전자")`는 한글이 제거돼 빈 문자열→`"briefing"`이 된다. 테스트의 `id` 기대값을 실제 규칙에 맞춘다. 위 테스트는 영문 슬러그 예시(`samsung`)를 썼으므로, **테스트를 실제 규칙에 맞게 수정**하거나(예: `company="Samsung"`으로 입력) 슬러그에 한글→로마자 매핑을 넣지 않는다(YAGNI). 워크샵에서는 `id`가 고유하기만 하면 되므로, 한글 라벨은 `"2026-07-14-briefing"`이 되고 동일 날짜 중복 시 `store`에서 접미사를 붙인다(Task 5 참고). → **이 태스크에서는 테스트의 `id` 기대값을 `"2026-07-14-briefing"`으로 수정**하고 진행한다.

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_briefing.py -v`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/briefing.py tests/test_briefing.py
git commit -m "feat: 브리핑 빌더 (모드 A 조립 + 모드 B 오버라이드)"
```

---

### Task 5: JSON 저장소 (load/append + id 고유화)

**Files:**
- Create: `tools/store.py`
- Test: `tests/test_store.py`

**Interfaces:**
- Consumes: 브리핑 dict(Task 4)
- Produces:
  - `load_briefings(path) -> list`
  - `append_briefings(path, briefings) -> list` — 저장 후 전체 배열 반환. **id 충돌 시 `-2`, `-3` 접미사로 고유화.**

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_store.py`

```python
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
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_store.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.store`)

- [ ] **Step 3: 구현 작성** — `tools/store.py`

```python
import json
import os


def load_briefings(path):
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        content = f.read().strip()
    return json.loads(content) if content else []


def append_briefings(path, briefings):
    existing = load_briefings(path)
    used_ids = {b["id"] for b in existing}
    for b in briefings:
        b = dict(b)
        b["id"] = _unique_id(b["id"], used_ids)
        used_ids.add(b["id"])
        existing.append(b)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(existing, f, ensure_ascii=False, indent=2)
    return existing


def _unique_id(base, used):
    if base not in used:
        return base
    n = 2
    while f"{base}-{n}" in used:
        n += 1
    return f"{base}-{n}"
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_store.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/store.py tests/test_store.py
git commit -m "feat: briefings.json 저장소 (append + id 고유화)"
```

---

### Task 6: 스테이징 보드 (후보 카드 임시 상태)

**Files:**
- Create: `tools/staging.py`
- Test: `tests/test_staging.py`

**Interfaces:**
- Consumes: 브리핑 dict(Task 4)
- Produces: `StagingBoard` 클래스
  - `add(briefing) -> dict` (반환 카드에 `cardId` 부여)
  - `list() -> list[dict]`
  - `get(card_id) -> dict | None`
  - `update(card_id, fields) -> dict` (title/summary/detail만 수정, 없으면 `KeyError`)
  - `delete(card_id) -> bool`
  - `clear() -> None`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_staging.py`

```python
import pytest
from tools.staging import StagingBoard


def test_add_assigns_unique_cardid_and_lists():
    b = StagingBoard()
    c1 = b.add({"title": "A"})
    c2 = b.add({"title": "B"})
    assert c1["cardId"] != c2["cardId"]
    assert c1["title"] == "A"
    assert len(b.list()) == 2


def test_update_only_content_fields():
    b = StagingBoard()
    c = b.add({"title": "A", "summary": "s", "detail": "d"})
    updated = b.update(c["cardId"], {"title": "새제목", "ignore": "x"})
    assert updated["title"] == "새제목"
    assert "ignore" not in updated


def test_update_unknown_raises():
    b = StagingBoard()
    with pytest.raises(KeyError):
        b.update("nope", {"title": "x"})


def test_delete_and_clear():
    b = StagingBoard()
    c = b.add({"title": "A"})
    assert b.delete(c["cardId"]) is True
    assert b.delete(c["cardId"]) is False
    b.add({"title": "B"})
    b.clear()
    assert b.list() == []
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_staging.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.staging`)

- [ ] **Step 3: 구현 작성** — `tools/staging.py`

```python
class StagingBoard:
    """배포 전 후보 카드를 담는 서버 메모리 상태."""

    def __init__(self):
        self._cards = {}
        self._counter = 0

    def add(self, briefing):
        self._counter += 1
        card_id = f"card-{self._counter}"
        card = {"cardId": card_id, **briefing}
        self._cards[card_id] = card
        return card

    def list(self):
        return list(self._cards.values())

    def get(self, card_id):
        return self._cards.get(card_id)

    def update(self, card_id, fields):
        if card_id not in self._cards:
            raise KeyError(card_id)
        card = self._cards[card_id]
        for key in ("title", "summary", "detail"):
            if key in fields:
                card[key] = fields[key]
        return card

    def delete(self, card_id):
        return self._cards.pop(card_id, None) is not None

    def clear(self):
        self._cards.clear()
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_staging.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/staging.py tests/test_staging.py
git commit -m "feat: 스테이징 보드 (후보 카드 큐레이션 상태)"
```

---

### Task 7: Git 배포기 (add/commit/push)

**Files:**
- Create: `tools/publisher.py`
- Test: `tests/test_publisher.py`

**Interfaces:**
- Consumes: 없음
- Produces: `publish(repo_dir, files, message, push=True) -> None` (실패 시 `RuntimeError`)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_publisher.py` (로컬 bare 원격으로 push까지 검증, 네트워크 불필요)

```python
import subprocess
from tools.publisher import publish


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def test_publish_commits_and_pushes(tmp_path):
    remote = tmp_path / "remote.git"
    remote.mkdir()
    _git(remote, "init", "--bare")

    work = tmp_path / "work"
    work.mkdir()
    _git(work, "init")
    _git(work, "config", "user.email", "t@t.com")
    _git(work, "config", "user.name", "t")
    _git(work, "remote", "add", "origin", str(remote))
    (work / "briefings.json").write_text("[]", encoding="utf-8")
    _git(work, "add", "briefings.json")
    _git(work, "commit", "-m", "init")
    _git(work, "push", "-u", "origin", "master")

    (work / "briefings.json").write_text('[{"id":"x"}]', encoding="utf-8")
    publish(str(work), ["briefings.json"], "add briefing")

    log = subprocess.run(["git", "log", "--oneline"], cwd=remote,
                         capture_output=True, text=True).stdout
    assert "add briefing" in log
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_publisher.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.publisher`)

- [ ] **Step 3: 구현 작성** — `tools/publisher.py`

```python
import subprocess


def publish(repo_dir, files, message, push=True):
    """지정 파일을 add → commit → (옵션) push. 실패 시 RuntimeError."""
    _run(["git", "add", *files], repo_dir)
    _run(["git", "commit", "-m", message], repo_dir)
    if push:
        _run(["git", "push"], repo_dir)


def _run(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} 실패: {result.stderr.strip()}")
    return result.stdout
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_publisher.py -v`
Expected: PASS (1 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/publisher.py tests/test_publisher.py
git commit -m "feat: git 배포기 (add/commit/push)"
```

---

### Task 8: LLM 요약기 추상화 (모드 B, provider 교체 가능)

**Files:**
- Create: `tools/summarizer.py`
- Test: `tests/test_summarizer.py`

**Docs to check:** Anthropic SDK 사용법·모델 ID는 **claude-api 스킬**을 참고한다(메모리로 추정 금지). 기본 모델은 `.env`의 `ANTHROPIC_MODEL`(기본값 `claude-sonnet-5`).

**Interfaces:**
- Consumes: 기사 리스트(Task 2)
- Produces:
  - `Summarizer` (ABC, `summarize(company, keyword, articles) -> {"title","summary","detail"}`)
  - `ClaudeSummarizer(api_key=None, model=None, client=None)` — `client` 주입 가능(테스트용)
  - `get_summarizer(provider=None, **kwargs) -> Summarizer` (팩토리, 미지원 provider면 `ValueError`)

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_summarizer.py`

```python
import json
import pytest
from unittest.mock import MagicMock
from tools.summarizer import ClaudeSummarizer, get_summarizer, Summarizer

ARTICLES = [{"title": "기사1", "url": "u", "snippet": "내용1", "publishedDate": "", "source": "한경"}]


def _fake_client(text):
    client = MagicMock()
    block = MagicMock()
    block.text = text
    client.messages.create.return_value = MagicMock(content=[block])
    return client


def test_claude_summarizer_parses_json():
    payload = json.dumps({"title": "T", "summary": "S", "detail": "D"}, ensure_ascii=False)
    s = ClaudeSummarizer(model="claude-sonnet-5", client=_fake_client(payload))
    out = s.summarize("삼성전자", "HBM", ARTICLES)
    assert out == {"title": "T", "summary": "S", "detail": "D"}
    # 모델이 전달됐는지
    _, kwargs = s.client.messages.create.call_args
    assert kwargs["model"] == "claude-sonnet-5"


def test_get_summarizer_unknown_provider_raises():
    with pytest.raises(ValueError):
        get_summarizer(provider="unknown")


def test_claude_is_summarizer_subclass():
    assert issubclass(ClaudeSummarizer, Summarizer)
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.summarizer`)

- [ ] **Step 3: 구현 작성** — `tools/summarizer.py`

```python
import json
import os
import re
from abc import ABC, abstractmethod


class Summarizer(ABC):
    @abstractmethod
    def summarize(self, company, keyword, articles):
        """-> {'title':..., 'summary':..., 'detail':...}"""


class ClaudeSummarizer(Summarizer):
    def __init__(self, api_key=None, model=None, client=None):
        self.model = model or os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5")
        if client is not None:
            self.client = client
        else:
            import anthropic
            self.client = anthropic.Anthropic(
                api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))

    def summarize(self, company, keyword, articles):
        prompt = _build_prompt(company, keyword, articles)
        resp = self.client.messages.create(
            model=self.model,
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        return _parse_summary(resp.content[0].text)


def get_summarizer(provider=None, **kwargs):
    provider = provider or os.environ.get("LLM_PROVIDER", "claude")
    if provider == "claude":
        return ClaudeSummarizer(**kwargs)
    raise ValueError(f"지원하지 않는 provider: {provider}")


def _build_prompt(company, keyword, articles):
    lines = "\n".join(f"- {a['title']}: {a['snippet']} ({a['source']})" for a in articles)
    return (
        f"다음은 '{company or ''} {keyword or ''}' 관련 뉴스 기사들이다.\n{lines}\n\n"
        "이를 종합해 한국어 증시 브리핑을 작성하라. "
        '반드시 아래 JSON만 출력하라(추가 텍스트 금지):\n'
        '{"title": "...", "summary": "1~2문장 핵심 요약", "detail": "상세 본문"}'
    )


def _parse_summary(text):
    match = re.search(r"\{.*\}", text, re.DOTALL)
    data = json.loads(match.group(0) if match else text)
    return {"title": data["title"], "summary": data["summary"], "detail": data["detail"]}
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_summarizer.py -v`
Expected: PASS (3 passed)

- [ ] **Step 5: Commit**

```bash
git add tools/summarizer.py tests/test_summarizer.py
git commit -m "feat: LLM 요약기 추상화 (Claude provider)"
```

---

### Task 9: Flask 앱 배선 (엔드포인트 + 앱 팩토리)

**Files:**
- Create: `tools/app.py`
- Test: `tests/test_app.py`

**Interfaces:**
- Consumes: 앞선 모든 모듈
- Produces: `create_app(briefings_path, repo_dir, board=None) -> Flask` 및 라우트
  - `GET /` → 생성 화면(템플릿) 서빙
  - `GET /api/trends` → 미국3+한국3 후보를 보드에 add 후 `{"cards": [...]}` 반환
  - `POST /api/search` (body: `{company, keyword, mode, provider}`) → 검색·조립·(모드 B면 요약)·add 후 `{"card": {...}}`
  - `GET /api/cards` → `{"cards": [...]}`
  - `PATCH /api/cards/<card_id>` (body: `{title?, summary?, detail?}`) → `{"card": {...}}` / 없으면 404
  - `DELETE /api/cards/<card_id>` → `{"deleted": bool}`
  - `POST /api/publish` → 보드 카드에서 `cardId` 제거 → `append_briefings` → `publisher.publish` → `board.clear()` → `{"published": n}`

- [ ] **Step 1: 실패하는 테스트 작성** — `tests/test_app.py` (외부 호출은 monkeypatch로 대체)

```python
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
    r = client.get("/api/trends")
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


def test_publish_writes_and_clears(client):
    client.post("/api/search", json={"company": "A", "keyword": "", "mode": "serper"})
    r = client.post("/api/publish", json={})
    assert r.get_json()["published"] == 1
    data = json.loads(open(client.application.config["BRIEFINGS_PATH"], encoding="utf-8").read())
    assert len(data) == 1
    assert "cardId" not in data[0]
    assert client.get("/api/cards").get_json()["cards"] == []  # 보드 비워짐
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_app.py -v`
Expected: FAIL (`ModuleNotFoundError: tools.app` 또는 `create_app` 없음)

- [ ] **Step 3: 구현 작성** — `tools/app.py`

```python
import os
from flask import Flask, jsonify, request, render_template

from tools.serper_client import search_news, search_market_trends, MARKET_QUERIES
from tools.briefing import make_briefing
from tools.store import append_briefings
from tools.staging import StagingBoard
from tools.publisher import publish
from tools.summarizer import get_summarizer


def create_app(briefings_path, repo_dir, board=None):
    app = Flask(__name__)
    app.config["BRIEFINGS_PATH"] = briefings_path
    app.config["REPO_DIR"] = repo_dir
    board = board if board is not None else StagingBoard()

    @app.get("/")
    def index():
        return render_template("index.html")

    @app.get("/api/trends")
    def trends():
        data = search_market_trends(top_n=3)
        cards = []
        for market, articles in data.items():
            label = MARKET_QUERIES[market]["label"]
            for article in articles:
                b = make_briefing(None, label, [article], mode="serper")
                b["title"] = article["title"]  # 개별 기사 제목을 카드 제목으로
                cards.append(board.add(b))
        return jsonify(cards=cards)

    @app.post("/api/search")
    def search():
        body = request.get_json(force=True) or {}
        company = body.get("company") or None
        keyword = body.get("keyword") or None
        mode = body.get("mode", "serper")
        query = " ".join(x for x in (company, keyword) if x) or "증시"
        articles = search_news(query)
        if mode == "llm":
            summarizer = get_summarizer(provider=body.get("provider"))
            summary = summarizer.summarize(company, keyword, articles)
            b = make_briefing(company, keyword, articles, mode="llm",
                              provider=body.get("provider") or "claude",
                              model=getattr(summarizer, "model", None), summary=summary)
        else:
            b = make_briefing(company, keyword, articles, mode="serper")
        return jsonify(card=board.add(b))

    @app.get("/api/cards")
    def list_cards():
        return jsonify(cards=board.list())

    @app.patch("/api/cards/<card_id>")
    def update_card(card_id):
        try:
            card = board.update(card_id, request.get_json(force=True) or {})
        except KeyError:
            return jsonify(error="not found"), 404
        return jsonify(card=card)

    @app.delete("/api/cards/<card_id>")
    def delete_card(card_id):
        return jsonify(deleted=board.delete(card_id))

    @app.post("/api/publish")
    def publish_cards():
        cards = [{k: v for k, v in c.items() if k != "cardId"} for c in board.list()]
        if not cards:
            return jsonify(published=0)
        append_briefings(app.config["BRIEFINGS_PATH"], cards)
        publish(app.config["REPO_DIR"], ["briefings.json"],
                f"add {len(cards)} briefing(s)")
        board.clear()
        return jsonify(published=len(cards))

    return app


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    repo_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    app = create_app(
        briefings_path=os.path.join(repo_dir, "briefings.json"),
        repo_dir=repo_dir,
    )
    app.run(port=5000, debug=True)
```

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `python -m pytest tests/test_app.py -v`
Expected: PASS (4 passed)

- [ ] **Step 5: 전체 테스트 실행**

Run: `python -m pytest -v`
Expected: 전체 PASS

- [ ] **Step 6: Commit**

```bash
git add tools/app.py tests/test_app.py
git commit -m "feat: Flask 앱 배선 (trends/search/cards/publish)"
```

---

### Task 10: 생성 화면 UI (스테이징 보드)

**Files:**
- Create: `tools/templates/index.html`, `tools/static/generate.js`, `tools/static/generate.css`

**Interfaces:**
- Consumes: Task 9 엔드포인트
- Produces: 브라우저 스테이징 보드 화면 (진입 시 자동 후보 로드 → 검색 추가 → 삭제/편집 → 배포)

- [ ] **Step 1: 템플릿 작성** — `tools/templates/index.html`

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>브리핑 생성 도구</title>
  <link rel="stylesheet" href="/static/generate.css" />
</head>
<body>
  <header><h1>증시 브리핑 생성 도구</h1></header>
  <section class="search">
    <input id="company" placeholder="기업명 (예: 삼성전자)" />
    <input id="keyword" placeholder="키워드 (예: HBM)" />
    <label><input type="checkbox" id="useLlm" /> LLM 요약(모드 B)</label>
    <button id="searchBtn">검색 추가</button>
  </section>
  <section class="board">
    <div class="board-head">
      <h2>후보 카드</h2>
      <button id="publishBtn">남긴 카드 배포</button>
    </div>
    <div id="cards" class="cards"></div>
  </section>
  <p id="status" class="status"></p>
  <script src="/static/generate.js"></script>
</body>
</html>
```

- [ ] **Step 2: 스타일 작성 (모바일 우선)** — `tools/static/generate.css`

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; color: #1a1a1a; }
header h1 { font-size: 1.25rem; }
.search { display: flex; flex-direction: column; gap: .5rem; margin-bottom: 1rem; }
.search input { padding: .6rem; font-size: 1rem; }
.board-head { display: flex; justify-content: space-between; align-items: center; }
button { padding: .6rem 1rem; font-size: 1rem; cursor: pointer; }
#publishBtn { background: #0b6; color: #fff; border: none; border-radius: 6px; }
.cards { display: grid; grid-template-columns: 1fr; gap: .75rem; margin-top: .75rem; }
.card { border: 1px solid #ddd; border-radius: 8px; padding: .75rem; }
.card h3 { margin: 0 0 .4rem; font-size: 1rem; }
.card .meta { font-size: .8rem; color: #666; }
.card [contenteditable] { outline: 1px dashed transparent; }
.card [contenteditable]:focus { outline: 1px dashed #0b6; }
.card .del { background: #e33; color: #fff; border: none; border-radius: 6px; }
.status { color: #0a5; min-height: 1.2em; }
@media (min-width: 720px) { .cards { grid-template-columns: repeat(2, 1fr); } .search { flex-direction: row; } }
```

- [ ] **Step 3: 로직 작성** — `tools/static/generate.js`

```javascript
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");

function setStatus(msg) { statusEl.textContent = msg; }

function cardHtml(card) {
  const sources = (card.sources || [])
    .map(s => `<li><a href="${s.url}" target="_blank">${s.title}</a> <span class="meta">${s.source} · ${s.publishedDate}</span></li>`)
    .join("");
  return `
    <div class="card" data-id="${card.cardId}">
      <h3 contenteditable data-field="title">${card.title || ""}</h3>
      <div class="meta">${card.date} · ${card.generator?.mode || ""}</div>
      <p contenteditable data-field="summary">${card.summary || ""}</p>
      <details><summary>상세/출처</summary>
        <p contenteditable data-field="detail">${card.detail || ""}</p>
        <ul>${sources}</ul>
      </details>
      <button class="del">삭제</button>
    </div>`;
}

function render(cards) {
  cardsEl.innerHTML = cards.map(cardHtml).join("");
  cardsEl.querySelectorAll(".card").forEach(el => {
    const id = el.dataset.id;
    el.querySelector(".del").onclick = () => remove(id);
    el.querySelectorAll("[contenteditable]").forEach(node => {
      node.onblur = () => saveEdit(id, node.dataset.field, node.textContent);
    });
  });
}

async function refresh() {
  const r = await fetch("/api/cards");
  render((await r.json()).cards);
}

async function loadTrends() {
  setStatus("시장 동향 불러오는 중…");
  await fetch("/api/trends");
  await refresh();
  setStatus("후보 카드 준비 완료");
}

async function search() {
  setStatus("검색 중…");
  await fetch("/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: document.getElementById("company").value,
      keyword: document.getElementById("keyword").value,
      mode: document.getElementById("useLlm").checked ? "llm" : "serper",
    }),
  });
  await refresh();
  setStatus("카드 추가됨");
}

async function saveEdit(id, field, value) {
  await fetch(`/api/cards/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value }),
  });
}

async function remove(id) {
  await fetch(`/api/cards/${id}`, { method: "DELETE" });
  await refresh();
}

async function publish() {
  setStatus("배포 중…");
  const r = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const n = (await r.json()).published;
  await refresh();
  setStatus(`${n}건 배포 완료`);
}

document.getElementById("searchBtn").onclick = search;
document.getElementById("publishBtn").onclick = publish;
loadTrends();
```

- [ ] **Step 4: 수동 스모크 테스트**

`.env`에 실제 `SERPER_API_KEY`를 넣고:
Run: `python tools/app.py`
브라우저에서 `http://localhost:5000` 접속.
Expected: 진입 시 미국3+한국3 후보 카드 표시 → 검색 추가/삭제/편집 동작 → "배포" 클릭 시 `briefings.json`에 반영되고 커밋됨.

> **주의:** 이 단계는 실제 키를 쓰므로 커밋 전에 `git status`로 `.env`가 스테이징되지 않았는지 확인한다.

- [ ] **Step 5: Commit**

```bash
git add tools/templates/index.html tools/static/generate.js tools/static/generate.css
git commit -m "feat: 생성 화면 스테이징 보드 UI"
```

---

### Task 11: 공개 아카이브 (Unit 2)

**Files:**
- Modify: `index.html` (루트 placeholder 교체)
- Create: `app.js`, `style.css` (루트)

**Interfaces:**
- Consumes: 루트 `briefings.json` (Task 5/9가 생성·갱신)
- Produces: 카드 인덱스 + 상세 모달 정적 사이트

- [ ] **Step 1: 아카이브 HTML 작성** — 루트 `index.html` (placeholder 전체 교체)

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>증시 브리핑 아카이브</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <header><h1>증시 브리핑 아카이브</h1></header>
  <main id="cards" class="cards"></main>
  <div id="modal" class="modal hidden">
    <div class="modal-body">
      <button id="closeBtn" class="close">✕</button>
      <div id="modalContent"></div>
    </div>
  </div>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: 아카이브 스타일 작성 (모바일 우선)** — 루트 `style.css`

```css
* { box-sizing: border-box; }
body { font-family: system-ui, sans-serif; margin: 0; padding: 1rem; background: #fafafa; color: #1a1a1a; }
header h1 { font-size: 1.3rem; }
.cards { display: grid; grid-template-columns: 1fr; gap: .75rem; }
.card { background: #fff; border: 1px solid #e5e5e5; border-radius: 10px; padding: 1rem; cursor: pointer; }
.card .date { font-size: .8rem; color: #888; }
.card h2 { font-size: 1.05rem; margin: .3rem 0; }
.card p { margin: 0; color: #444; }
.modal { position: fixed; inset: 0; background: rgba(0,0,0,.5); display: flex; align-items: center; justify-content: center; }
.modal.hidden { display: none; }
.modal-body { background: #fff; border-radius: 12px; padding: 1.25rem; width: 100%; height: 100%; overflow: auto; position: relative; }
.close { position: absolute; top: .75rem; right: .75rem; border: none; background: none; font-size: 1.2rem; cursor: pointer; }
.modal-body ul { padding-left: 1rem; }
.modal-body a { color: #06c; }
@media (min-width: 720px) {
  .cards { grid-template-columns: repeat(3, 1fr); }
  .modal-body { width: 640px; height: auto; max-height: 80vh; }
}
```

- [ ] **Step 3: 아카이브 로직 작성** — 루트 `app.js`

```javascript
const cardsEl = document.getElementById("cards");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");

function esc(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

function openDetail(b) {
  const sources = (b.sources || [])
    .map(s => `<li><a href="${s.url}" target="_blank">${esc(s.title)}</a> — ${esc(s.source)} · ${esc(s.publishedDate)}</li>`)
    .join("");
  modalContent.innerHTML = `
    <div class="date">${esc(b.date)}</div>
    <h2>${esc(b.title)}</h2>
    <p><strong>${esc(b.summary)}</strong></p>
    <p style="white-space: pre-wrap;">${esc(b.detail)}</p>
    <h3>출처</h3><ul>${sources}</ul>`;
  modal.classList.remove("hidden");
}

function render(briefings) {
  const sorted = [...briefings].sort((a, b) => (a.date < b.date ? 1 : -1));
  cardsEl.innerHTML = sorted.map((b, i) =>
    `<div class="card" data-i="${i}"><div class="date">${esc(b.date)}</div>
     <h2>${esc(b.title)}</h2><p>${esc(b.summary)}</p></div>`).join("");
  cardsEl.querySelectorAll(".card").forEach(el =>
    el.onclick = () => openDetail(sorted[Number(el.dataset.i)]));
}

document.getElementById("closeBtn").onclick = () => modal.classList.add("hidden");
modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };

fetch("briefings.json")
  .then(r => r.json())
  .then(render)
  .catch(() => { cardsEl.innerHTML = "<p>브리핑을 불러오지 못했습니다.</p>"; });
```

- [ ] **Step 4: 로컬 확인**

Run: `python -m http.server 8000`
브라우저에서 `http://localhost:8000` 접속.
Expected: `briefings.json`의 카드가 최신순으로 표시되고, 클릭 시 상세 모달(출처 포함)이 열린다. (데이터가 비어 있으면 빈 화면 — Task 10 배포 후 다시 확인)

- [ ] **Step 5: Commit**

```bash
git add index.html app.js style.css
git commit -m "feat: 공개 아카이브 (카드 인덱스 + 상세 모달)"
```

---

### Task 12: 통합 & GitHub Pages 배포 확인

**Files:** 없음 (설정·검증)

**Interfaces:**
- Consumes: 전체 시스템
- Produces: 공개 URL에서 동작하는 아카이브

- [ ] **Step 1: 전체 자동 테스트**

Run: `python -m pytest -v`
Expected: 전체 PASS

- [ ] **Step 2: 端-to-端 수동 검증**

`.env`에 실제 키 설정 → `python tools/app.py` 실행 → 브라우저에서 후보 생성/큐레이션 → "배포".
Expected: `briefings.json`이 갱신·커밋·push 되고, 콘솔/네트워크 탭에 키가 노출되지 않는다.

- [ ] **Step 3: GitHub Pages 설정 확인**

GitHub → 저장소 Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `/(root)`.
Expected: `https://yunesungkim.github.io/market_dashboard/` 접속 시 배포된 브리핑 카드가 표시된다.

- [ ] **Step 4: 시크릿 최종 점검**

Run: `git ls-files | grep -E '(^|/)\.env$'`
Expected: 출력 없음 (`.env`가 추적되지 않음). `git log -p`에도 키 문자열이 없어야 한다.

- [ ] **Step 5: Commit (필요 시 문서/마무리)**

```bash
git add -A
git commit -m "chore: 통합 검증 및 마무리"
```

---

## Self-Review

**Spec coverage (PRD 대비):**
- F1-1 입력 → Task 10 (생성 화면 입력폼) ✅
- F1-2 뉴스 검색(Serper) → Task 2 ✅
- F1-3 모드 A/B 생성 → Task 4(A), Task 8(B), Task 9(배선) ✅
- F1-4 provider 추상화 → Task 8 (`Summarizer`/`get_summarizer`) ✅
- F1-5 미리보기 → Task 10 (카드 미리보기) ✅
- F1-6 데이터 저장 → Task 5 ✅
- F1-7 배포(push) → Task 7 ✅
- F1-8 자동 동향 후보(미국3+한국3) → Task 3 + Task 9(`/api/trends`) ✅
- F1-9 스테이징 보드 → Task 6 + Task 9 ✅
- F1-10 큐레이션(삭제/편집) → Task 6 + Task 9(PATCH/DELETE) + Task 10 ✅
- F1-11 배치 배포 → Task 9(`/api/publish`) ✅
- F2-1~F2-4 아카이브(카드/표시/상세/정렬) → Task 11 ✅
- `.env` 시크릿 위생 → Task 1 + Task 12 점검 ✅
- 공개 스냅샷 포함/제외 → 루트 정적 파일만 공개, `.env` 제외 (Task 1/12) ✅

**Type consistency:** 카드/브리핑 dict은 전 태스크에서 동일 스키마(PRD 3.5) 사용. `cardId`는 스테이징 전용이며 `publish` 시 제거(Task 9). `make_briefing`의 `summary` 오버라이드 인자는 Task 4·8·9에서 일관.

**남은 위험/주의:**
- `_slugify`가 한글을 제거하므로 `id`가 날짜+`briefing`으로 수렴 → `store._unique_id`가 접미사로 고유화(Task 5). 워크샵 범위에서 허용.
- Serper `date` 필드는 "1 day ago" 같은 상대 표기가 올 수 있음 — 그대로 `publishedDate`에 보존(가공은 Out of Scope).
- git push 인증은 사전 설정(자격 증명 관리자/PAT) 전제. Task 12에서 점검.
