# 생성 도구 개선 (탭 + 모드 버튼 + 선택 배포 + 발행 관리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 생성 도구에 (1) Mode A/B 세그먼트 버튼, (2) 카드별 체크박스 선택 배포, (3) 카드 위 진행 상태 박스, (4) 생성/발행관리 2개 탭 + 발행 브리핑 삭제 기능을 추가한다. 공개 아카이브는 변경하지 않는다.

**Architecture:** 로컬 Flask 서버가 선택 배포·발행 브리핑 조회/삭제(파일 재작성 + git push)를 처리. 프론트는 순수 HTML/CSS/JS, 설정은 localStorage.

**Tech Stack:** Flask, 순수 HTML/CSS/JS, pytest.

## Global Constraints

- 빌드 도구 없는 순수 HTML/CSS/JS. Python 3.10+.
- 키는 프론트/응답에 노출 금지. XSS: `esc()`(& < > " ') + `safeUrl()`(http(s)) + `rel="noopener noreferrer"`.
- 공개 아카이브(루트 index.html/app.js/style.css)는 **변경하지 않는다.**
- 설정 localStorage 키 `briefing-settings`(기존 유지). 모델 목록 claude-opus-4-8/claude-sonnet-5/claude-haiku-4-5-20251001.
- 모드 라벨 정확히: `Mode A: Serper API Only`, `Mode B: Summarized by LLM`.
- 카드 체크박스 기본 해제. 미체크 카드는 배포 후 보드에 유지.
- Serper/LLM/git 호출은 테스트에서 mock. UI 한국어.

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `tools/store.py` | 수정 | `remove_briefings(path, ids)` 추가 |
| `tools/app.py` | 수정 | `/api/publish` 선택배포(cardIds), `GET /api/briefings`, `POST /api/briefings/delete` |
| `tests/test_store.py` | 수정 | `remove_briefings` 테스트 |
| `tests/test_app.py` | 수정 | 선택배포/조회/삭제 테스트 |
| `tools/templates/index.html` | 교체 | 탭·모드버튼·상태박스·관리탭 마크업 |
| `tools/static/generate.js` | 교체 | 위 동작 + 선택배포 + 발행관리 + 탭 |
| `tools/static/generate.css` | 교체 | 탭/모드버튼/상태박스/체크박스/목록 스타일 |

작업 순서: Task 1(백엔드) → Task 2(프론트). Task 2는 Task 1 엔드포인트에 의존.

---

### Task 1: 백엔드 — 선택 배포 + 발행 브리핑 조회/삭제

**Files:**
- Modify: `tools/store.py`, `tools/app.py`
- Test: `tests/test_store.py`, `tests/test_app.py`

**Interfaces:**
- Produces:
  - `store.remove_briefings(path, ids) -> int` (삭제된 개수; 0이면 파일 미변경)
  - `POST /api/publish` body `{cardIds:[...]}` → 해당 카드만 append/보드제거. `cardIds` 없으면 전체(하위호환). `{published:n}`
  - `GET /api/briefings` → `{briefings:[...]}` (현재 briefings.json)
  - `POST /api/briefings/delete` body `{ids:[...]}` → 제거·재작성 + push. `{removed:n}`

- [ ] **Step 1: 실패 테스트 추가** — `tests/test_store.py` 하단에 추가

```python
from tools.store import remove_briefings


def test_remove_briefings(tmp_path):
    p = str(tmp_path / "briefings.json")
    append_briefings(p, [{"id": "a", "title": "A"}, {"id": "b", "title": "B"}, {"id": "c", "title": "C"}])
    removed = remove_briefings(p, ["a", "c"])
    assert removed == 2
    import json
    data = json.loads(open(p, encoding="utf-8").read())
    assert [x["id"] for x in data] == ["b"]


def test_remove_briefings_none_matched(tmp_path):
    p = str(tmp_path / "briefings.json")
    append_briefings(p, [{"id": "a", "title": "A"}])
    assert remove_briefings(p, ["zzz"]) == 0
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_store.py -v`
Expected: FAIL (`ImportError: cannot import name 'remove_briefings'`).

- [ ] **Step 3: `tools/store.py`에 함수 추가** (파일 하단)

```python
def remove_briefings(path, ids):
    """briefings.json에서 id가 ids에 속한 항목 제거. 삭제된 개수 반환."""
    existing = load_briefings(path)
    ids = set(ids)
    kept = [b for b in existing if b.get("id") not in ids]
    removed = len(existing) - len(kept)
    if removed:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(kept, f, ensure_ascii=False, indent=2)
    return removed
```

- [ ] **Step 4: store 테스트 통과 확인**

Run: `python -m pytest tests/test_store.py -v`
Expected: PASS.

- [ ] **Step 5: app 테스트 추가** — `tests/test_app.py` 하단에 추가

```python
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
```

- [ ] **Step 6: 테스트 실행 → 실패 확인**

Run: `python -m pytest tests/test_app.py -v`
Expected: `test_publish_selected_only`(현재 publish가 cardIds 무시하고 전체 배포+clear), `test_get_briefings`/`test_delete_briefings`(404) 실패.

- [ ] **Step 7: `tools/app.py` 수정**

(a) store import 확장. 기존:
```python
from tools.store import append_briefings
```
교체:
```python
from tools.store import append_briefings, load_briefings, remove_briefings
```

(b) `publish_cards` 라우트 교체. 기존:
```python
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
```
교체:
```python
    @app.post("/api/publish")
    def publish_cards():
        body = request.get_json(force=True, silent=True) or {}
        ids = body.get("cardIds")
        all_cards = board.list()
        if ids is None:
            selected = all_cards
        else:
            idset = set(ids)
            selected = [c for c in all_cards if c["cardId"] in idset]
        if not selected:
            return jsonify(published=0)
        cards = [{k: v for k, v in c.items() if k != "cardId"} for c in selected]
        append_briefings(app.config["BRIEFINGS_PATH"], cards)
        publish(app.config["REPO_DIR"], ["briefings.json"],
                f"add {len(cards)} briefing(s)")
        for c in selected:
            board.delete(c["cardId"])
        return jsonify(published=len(cards))

    @app.get("/api/briefings")
    def list_briefings():
        return jsonify(briefings=load_briefings(app.config["BRIEFINGS_PATH"]))

    @app.post("/api/briefings/delete")
    def delete_briefings():
        body = request.get_json(force=True, silent=True) or {}
        ids = body.get("ids") or []
        removed = remove_briefings(app.config["BRIEFINGS_PATH"], ids)
        if removed:
            publish(app.config["REPO_DIR"], ["briefings.json"],
                    f"remove {removed} briefing(s)")
        return jsonify(removed=removed)
```

- [ ] **Step 8: 테스트 통과 + 전체 스위트**

Run: `python -m pytest -q`
Expected: 전체 PASS (기존 + 신규).

- [ ] **Step 9: Commit**

```bash
git add tools/store.py tools/app.py tests/test_store.py tests/test_app.py
git commit -m "feat: 선택 배포(cardIds) + 발행 브리핑 조회/삭제 API"
```

---

### Task 2: 프론트엔드 — 탭 + 모드 버튼 + 선택 배포 + 상태 박스 + 발행 관리

**Files:**
- Replace: `tools/templates/index.html`, `tools/static/generate.js`, `tools/static/generate.css`

**Interfaces:**
- Consumes: `POST /api/trends`, `POST /api/search`, `GET /api/cards`, `PATCH/DELETE /api/cards/<id>`, `POST /api/publish {cardIds}`, `GET /api/briefings`, `POST /api/briefings/delete {ids}` (Task 1 반영본)

- [ ] **Step 1: `tools/templates/index.html` 전체 교체**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>증시 브리핑 생성 도구</title>
  <link rel="stylesheet" href="/static/generate.css" />
</head>
<body>
  <header class="app-header">
    <div class="app-header__inner">
      <h1 class="app-header__title">증시 브리핑 도구</h1>
      <button id="settingsBtn" class="btn btn--ghost" type="button">⚙️ 설정</button>
    </div>
  </header>

  <nav class="tabs">
    <button id="tabGenerate" class="tab tab--active" type="button">증시 브리핑 생성 도구</button>
    <button id="tabManage" class="tab" type="button">발행된 브리핑 카드 관리</button>
  </nav>

  <main class="container">
    <section id="panelGenerate" class="panel">
      <section class="search-bar">
        <div class="mode-toggle">
          <button id="modeA" class="mode-btn mode-btn--active" type="button">Mode A: Serper API Only</button>
          <button id="modeB" class="mode-btn" type="button">Mode B: Summarized by LLM</button>
        </div>
        <input id="company" placeholder="기업명 (예: 삼성전자)" />
        <input id="keyword" placeholder="키워드 (예: HBM)" />
        <button id="searchBtn" class="btn" type="button">검색</button>
      </section>

      <div id="status" class="status-box" role="status">준비됨</div>

      <section class="board">
        <div class="board__head">
          <h2>후보 카드</h2>
          <button id="publishBtn" class="btn btn--primary" type="button">배포 (<span id="cardCount">0</span>)</button>
        </div>
        <div id="cards" class="cards"></div>
      </section>
    </section>

    <section id="panelManage" class="panel hidden">
      <div class="board__head">
        <h2>발행된 브리핑</h2>
        <div class="manage-actions">
          <button id="reloadBriefings" class="btn" type="button">불러오기</button>
          <button id="deleteBriefings" class="btn btn--danger" type="button">선택 삭제 (<span id="delCount">0</span>)</button>
        </div>
      </div>
      <div id="manageStatus" class="status-box" role="status">불러오기를 눌러 발행된 브리핑을 확인하세요.</div>
      <div id="briefingList" class="briefing-list"></div>
    </section>
  </main>

  <div id="settingsModal" class="modal hidden">
    <div class="modal__body">
      <button id="settingsClose" class="modal__close" type="button" aria-label="닫기">✕</button>
      <h2>설정</h2>
      <h3>초기 로딩 테마</h3>
      <div class="theme-head">
        <span>라벨</span><span>검색어</span><span>gl</span><span>hl</span><span>개수</span><span></span>
      </div>
      <div id="themeRows" class="theme-rows"></div>
      <button id="addTheme" class="btn btn--sm" type="button">+ 테마 추가</button>
      <h3>LLM 모델 (모드 B)</h3>
      <select id="modelSelect" class="model-select">
        <option value="claude-opus-4-8">claude-opus-4-8</option>
        <option value="claude-sonnet-5">claude-sonnet-5</option>
        <option value="claude-haiku-4-5-20251001">claude-haiku-4-5-20251001</option>
      </select>
      <div class="modal__actions">
        <button id="settingsCancel" class="btn" type="button">취소</button>
        <button id="settingsSave" class="btn btn--primary" type="button">저장</button>
      </div>
    </div>
  </div>

  <script src="/static/generate.js"></script>
</body>
</html>
```

- [ ] **Step 2: `tools/static/generate.css` 전체 교체**

```css
:root {
  --bg: #f6f8fa;
  --surface: #ffffff;
  --border: #e6e8eb;
  --text: #1a2233;
  --muted: #6b7280;
  --accent: #2563eb;
  --accent-weak: #eaf1ff;
  --danger: #dc2626;
  --radius: 12px;
  --shadow: 0 1px 2px rgba(16,24,40,.06), 0 4px 12px rgba(16,24,40,.06);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Malgun Gothic", sans-serif;
  background: var(--bg); color: var(--text); line-height: 1.55;
}
.hidden { display: none; }
.app-header {
  position: sticky; top: 0; z-index: 5;
  background: rgba(255,255,255,.85); backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.app-header__inner {
  max-width: 1080px; margin: 0 auto; padding: .8rem 1rem;
  display: flex; align-items: center; justify-content: space-between; gap: .5rem;
}
.app-header__title { margin: 0; font-size: 1.2rem; letter-spacing: -.01em; }
.container { max-width: 1080px; margin: 0 auto; padding: 1rem; }

.tabs {
  max-width: 1080px; margin: 0 auto; padding: 0 1rem;
  display: flex; gap: .3rem; border-bottom: 1px solid var(--border);
}
.tab {
  padding: .7rem 1rem; border: none; background: none; cursor: pointer;
  color: var(--muted); border-bottom: 2px solid transparent; font-size: .95rem;
}
.tab--active { color: var(--accent); border-bottom-color: var(--accent); font-weight: 600; }

.btn {
  padding: .6rem 1rem; font-size: .95rem; cursor: pointer;
  border: 1px solid var(--border); border-radius: 9px; background: #fff; color: var(--text);
}
.btn:hover { border-color: var(--accent); }
.btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.btn--primary:hover { filter: brightness(1.05); }
.btn--ghost { background: transparent; }
.btn--sm { padding: .35rem .7rem; font-size: .85rem; }
.btn--danger { color: var(--danger); border-color: #f3c8c8; }
.btn--danger:hover { background: #fef2f2; border-color: var(--danger); }

.search-bar {
  display: flex; flex-direction: column; gap: .55rem;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); padding: .9rem; margin-bottom: 1rem; box-shadow: var(--shadow);
}
.search-bar input {
  padding: .6rem .7rem; font-size: 1rem; border: 1px solid var(--border);
  border-radius: 9px; background: #fff; color: var(--text);
}
.mode-toggle {
  display: inline-flex; align-self: flex-start;
  border: 1px solid var(--border); border-radius: 9px; overflow: hidden;
}
.mode-btn {
  padding: .5rem .8rem; border: none; background: #fff; color: var(--muted);
  cursor: pointer; font-size: .85rem;
}
.mode-btn + .mode-btn { border-left: 1px solid var(--border); }
.mode-btn--active { background: var(--accent); color: #fff; }

.status-box {
  background: var(--accent-weak); color: var(--accent);
  border: 1px solid #cfe0ff; border-radius: 9px;
  padding: .6rem .85rem; margin-bottom: 1rem; font-size: .9rem; min-height: 1.2em;
}

.board__head { display: flex; align-items: center; justify-content: space-between; gap: .5rem; flex-wrap: wrap; }
.board__head h2 { font-size: 1.05rem; margin: .2rem 0; }
.manage-actions { display: flex; gap: .4rem; }
.cards { display: grid; grid-template-columns: 1fr; gap: .75rem; margin-top: .75rem; }
.card {
  background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius);
  box-shadow: var(--shadow); padding: .9rem;
}
.card__pick { display: flex; align-items: center; gap: .4rem; font-size: .82rem; color: var(--muted); margin-bottom: .45rem; }
.card__pick input { width: 16px; height: 16px; }
.card h3 { margin: 0 0 .35rem; font-size: 1rem; border-radius: 6px; }
.card .meta { font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.card [contenteditable] { outline: 1px dashed transparent; border-radius: 6px; padding: .1rem .2rem; }
.card [contenteditable]:hover { outline-color: var(--border); }
.card [contenteditable]:focus { outline: 1px dashed var(--accent); background: #fbfdff; }
.card details { margin-top: .4rem; }
.card details summary { cursor: pointer; color: var(--muted); font-size: .85rem; }
.card ul { padding-left: 1.1rem; }
.card a { color: var(--accent); }
.card .del { margin-top: .5rem; background: #fff; color: var(--danger); border-color: #f3c8c8; }
.card .del:hover { background: #fef2f2; }

.briefing-list { display: flex; flex-direction: column; gap: .4rem; }
.briefing-item {
  display: flex; align-items: center; gap: .6rem;
  background: var(--surface); border: 1px solid var(--border); border-radius: 9px;
  padding: .6rem .8rem; cursor: pointer;
}
.briefing-item input { width: 16px; height: 16px; flex: none; }
.briefing-item__date { font-size: .78rem; color: var(--muted); font-variant-numeric: tabular-nums; white-space: nowrap; }
.briefing-item__title { font-size: .92rem; }
.empty { color: var(--muted); text-align: center; padding: 1.5rem 0; }

.modal { position: fixed; inset: 0; background: rgba(16,24,40,.5); display: flex; align-items: center; justify-content: center; z-index: 10; }
.modal.hidden { display: none; }
.modal__body { background: var(--surface); border-radius: 14px; padding: 1.3rem; width: 100%; height: 100%; overflow: auto; position: relative; }
.modal__close { position: absolute; top: .8rem; right: .8rem; border: none; background: none; font-size: 1.2rem; cursor: pointer; color: var(--muted); }
.modal h3 { margin: 1.1rem 0 .5rem; font-size: .95rem; }
.theme-head, .theme-row { display: grid; grid-template-columns: 1.2fr 1.6fr .6fr .6fr .7fr auto; gap: .4rem; align-items: center; }
.theme-head { font-size: .72rem; color: var(--muted); margin-bottom: .3rem; }
.theme-row { margin-bottom: .4rem; }
.theme-row input { padding: .45rem; font-size: .9rem; border: 1px solid var(--border); border-radius: 7px; width: 100%; }
.theme-row .t-del { color: var(--danger); border-color: #f3c8c8; }
.model-select { padding: .55rem .6rem; font-size: .95rem; border: 1px solid var(--border); border-radius: 9px; background: #fff; width: 100%; max-width: 320px; }
.modal__actions { display: flex; justify-content: flex-end; gap: .5rem; margin-top: 1.3rem; }

@media (min-width: 720px) {
  .search-bar { flex-direction: row; align-items: center; flex-wrap: wrap; }
  .search-bar input { flex: 1 1 180px; }
  .cards { grid-template-columns: repeat(2, 1fr); }
  .modal__body { width: 720px; height: auto; max-height: 85vh; }
}
```

- [ ] **Step 3: `tools/static/generate.js` 전체 교체**

```javascript
const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");
const cardCountEl = document.getElementById("cardCount");

const SETTINGS_KEY = "briefing-settings";
const DEFAULT_SETTINGS = {
  themes: [
    { label: "미국 증시", query: "US stock market", gl: "us", hl: "en", count: 3 },
    { label: "한국 증시", query: "한국 증시", gl: "kr", hl: "ko", count: 3 },
  ],
  model: "claude-sonnet-5",
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return clone(DEFAULT_SETTINGS);
    const s = JSON.parse(raw);
    return {
      themes: Array.isArray(s.themes) && s.themes.length ? s.themes : clone(DEFAULT_SETTINGS.themes),
      model: s.model || DEFAULT_SETTINGS.model,
    };
  } catch (e) { return clone(DEFAULT_SETTINGS); }
}
function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }

function setStatus(msg) { statusEl.textContent = msg; }
function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function safeUrl(u) {
  const s = String(u == null ? "" : u).trim();
  return /^https?:\/\//i.test(s) ? s : "#";
}

/* ---- 모드 선택 (세그먼트 버튼) ---- */
let currentMode = "serper";
const modeABtn = document.getElementById("modeA");
const modeBBtn = document.getElementById("modeB");
function setMode(m) {
  currentMode = m;
  modeABtn.classList.toggle("mode-btn--active", m === "serper");
  modeBBtn.classList.toggle("mode-btn--active", m === "llm");
}
modeABtn.onclick = () => setMode("serper");
modeBBtn.onclick = () => setMode("llm");

/* ---- 후보 카드 ---- */
function cardHtml(card) {
  const sources = (card.sources || [])
    .map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="meta">${esc(s.source)} · ${esc(s.publishedDate)}</span></li>`)
    .join("");
  return `
    <div class="card" data-id="${esc(card.cardId)}">
      <label class="card__pick"><input type="checkbox" class="pick" /> 배포 선택</label>
      <h3 contenteditable data-field="title">${esc(card.title || "")}</h3>
      <div class="meta">${esc(card.date)} · ${esc((card.generator && card.generator.mode) || "")}</div>
      <p contenteditable data-field="summary">${esc(card.summary || "")}</p>
      <details><summary>상세/출처</summary>
        <p contenteditable data-field="detail">${esc(card.detail || "")}</p>
        <ul>${sources}</ul>
      </details>
      <button class="del" type="button">삭제</button>
    </div>`;
}
function updateCardCount() {
  cardCountEl.textContent = cardsEl.querySelectorAll(".pick:checked").length;
}
function render(cards) {
  cardsEl.innerHTML = cards.map(cardHtml).join("");
  cardsEl.querySelectorAll(".card").forEach(el => {
    const id = el.dataset.id;
    el.querySelector(".del").onclick = () => remove(id);
    el.querySelector(".pick").onchange = updateCardCount;
    el.querySelectorAll("[contenteditable]").forEach(node => {
      node.onblur = () => saveEdit(id, node.dataset.field, node.textContent);
    });
  });
  updateCardCount();
}

async function refresh() {
  const r = await fetch("/api/cards");
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  render((await r.json()).cards);
}

async function loadTrends() {
  setStatus("시장 동향 불러오는 중…");
  const s = loadSettings();
  const r = await fetch("/api/trends", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ themes: s.themes }),
  });
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  await refresh();
  setStatus("후보 카드 준비 완료");
}

async function search() {
  setStatus("검색 중…");
  const s = loadSettings();
  const r = await fetch("/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: document.getElementById("company").value,
      keyword: document.getElementById("keyword").value,
      mode: currentMode,
      model: s.model,
    }),
  });
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  await refresh();
  setStatus("카드 추가됨");
}

async function saveEdit(id, field, value) {
  const r = await fetch(`/api/cards/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ [field]: value }),
  });
  if (!r.ok) { setStatus("편집 저장 실패 (" + r.status + ")"); }
}

async function remove(id) {
  const r = await fetch(`/api/cards/${id}`, { method: "DELETE" });
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  await refresh();
}

async function publish() {
  const ids = [...cardsEl.querySelectorAll(".card")]
    .filter(el => el.querySelector(".pick").checked)
    .map(el => el.dataset.id);
  if (!ids.length) { setStatus("배포할 카드를 선택하세요."); return; }
  setStatus("배포 중…");
  const r = await fetch("/api/publish", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ cardIds: ids }),
  });
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  const n = (await r.json()).published;
  await refresh();
  setStatus(`${n}건 배포 완료`);
}

/* ---- 발행된 브리핑 관리 탭 ---- */
const briefingListEl = document.getElementById("briefingList");
const manageStatusEl = document.getElementById("manageStatus");
const delCountEl = document.getElementById("delCount");
function setManageStatus(msg) { manageStatusEl.textContent = msg; }
function updateDelCount() {
  delCountEl.textContent = briefingListEl.querySelectorAll(".bpick:checked").length;
}
function briefingItemHtml(b) {
  return `<label class="briefing-item">
    <input type="checkbox" class="bpick" data-id="${esc(b.id)}" />
    <span class="briefing-item__date">${esc(b.date)}</span>
    <span class="briefing-item__title">${esc(b.title)}</span>
  </label>`;
}
async function loadBriefings() {
  setManageStatus("불러오는 중…");
  const r = await fetch("/api/briefings");
  if (!r.ok) { setManageStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  const list = (await r.json()).briefings || [];
  const sorted = [...list].sort((a, b) => (a.date < b.date ? 1 : -1));
  briefingListEl.innerHTML = sorted.length
    ? sorted.map(briefingItemHtml).join("")
    : "<p class='empty'>발행된 브리핑이 없습니다.</p>";
  briefingListEl.querySelectorAll(".bpick").forEach(cb => cb.onchange = updateDelCount);
  updateDelCount();
  setManageStatus(`${sorted.length}건 발행됨`);
}
async function deleteBriefings() {
  const ids = [...briefingListEl.querySelectorAll(".bpick:checked")].map(cb => cb.dataset.id);
  if (!ids.length) { setManageStatus("삭제할 브리핑을 선택하세요."); return; }
  setManageStatus("삭제 중…");
  const r = await fetch("/api/briefings/delete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  if (!r.ok) { setManageStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  const removed = (await r.json()).removed;
  await loadBriefings();
  setManageStatus(`${removed}건 삭제됨`);
}
document.getElementById("reloadBriefings").onclick = loadBriefings;
document.getElementById("deleteBriefings").onclick = deleteBriefings;

/* ---- 탭 전환 ---- */
const panelGenerate = document.getElementById("panelGenerate");
const panelManage = document.getElementById("panelManage");
const tabGenerate = document.getElementById("tabGenerate");
const tabManage = document.getElementById("tabManage");
function showTab(which) {
  const gen = which === "generate";
  panelGenerate.classList.toggle("hidden", !gen);
  panelManage.classList.toggle("hidden", gen);
  tabGenerate.classList.toggle("tab--active", gen);
  tabManage.classList.toggle("tab--active", !gen);
  if (!gen) loadBriefings();
}
tabGenerate.onclick = () => showTab("generate");
tabManage.onclick = () => showTab("manage");

/* ---- 설정 모달 ---- */
const settingsModal = document.getElementById("settingsModal");
const themeRows = document.getElementById("themeRows");
const modelSelect = document.getElementById("modelSelect");
function themeRowHtml(t) {
  return `<div class="theme-row">
    <input class="t-label" placeholder="라벨" value="${esc(t.label || "")}" />
    <input class="t-query" placeholder="검색어" value="${esc(t.query || "")}" />
    <input class="t-gl" placeholder="gl" value="${esc(t.gl || "")}" />
    <input class="t-hl" placeholder="hl" value="${esc(t.hl || "")}" />
    <input class="t-count" type="number" min="1" max="10" value="${Number(t.count) || 3}" />
    <button class="t-del btn btn--sm" type="button">삭제</button>
  </div>`;
}
function renderThemeRows(themes) {
  themeRows.innerHTML = themes.map(themeRowHtml).join("");
  themeRows.querySelectorAll(".t-del").forEach(btn => {
    btn.onclick = () => btn.closest(".theme-row").remove();
  });
}
function collectThemes() {
  return [...themeRows.querySelectorAll(".theme-row")].map(row => ({
    label: row.querySelector(".t-label").value.trim(),
    query: row.querySelector(".t-query").value.trim(),
    gl: row.querySelector(".t-gl").value.trim() || "kr",
    hl: row.querySelector(".t-hl").value.trim() || "ko",
    count: Math.max(1, Math.min(10, Number(row.querySelector(".t-count").value) || 3)),
  })).filter(t => t.query);
}
function openSettings() {
  const s = loadSettings();
  renderThemeRows(s.themes);
  modelSelect.value = s.model;
  settingsModal.classList.remove("hidden");
}
function addThemeRow() {
  themeRows.insertAdjacentHTML("beforeend", themeRowHtml({ gl: "kr", hl: "ko", count: 3 }));
  const btn = themeRows.querySelector(".theme-row:last-child .t-del");
  btn.onclick = () => btn.closest(".theme-row").remove();
}
document.getElementById("settingsBtn").onclick = openSettings;
document.getElementById("settingsClose").onclick = () => settingsModal.classList.add("hidden");
document.getElementById("settingsCancel").onclick = () => settingsModal.classList.add("hidden");
document.getElementById("addTheme").onclick = addThemeRow;
document.getElementById("settingsSave").onclick = () => {
  const themes = collectThemes();
  saveSettings({ themes: themes.length ? themes : clone(DEFAULT_SETTINGS.themes), model: modelSelect.value });
  settingsModal.classList.add("hidden");
  setStatus("설정 저장됨");
};
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.classList.add("hidden"); };

/* ---- 초기화 ---- */
document.getElementById("searchBtn").onclick = search;
document.getElementById("publishBtn").onclick = publish;
setMode("serper");
loadTrends();
```

- [ ] **Step 4: 서버 스모크 검증**

Run: `python tools/app.py` (저장소 루트) → `http://localhost:5000`
정적 200 확인(`/`, `/static/generate.js`, `/static/generate.css`). 브라우저 또는 정적 검사로 확인: (a) Mode A/B 버튼 상호배타 토글(기본 A); (b) 카드 체크박스 기본 해제, 체크 시 `배포 (N)` 증가; (c) `배포`는 체크된 카드만 배포(미체크 유지); (d) 상태 문구가 카드 위 박스에 표시; (e) 탭 전환 동작, "발행된 브리핑 카드 관리" 탭에서 불러오기→목록→선택 삭제; (f) ⚙️ 설정 모달 정상. `/api/trends`·`/api/publish`·`/api/briefings/delete`는 실제 Serper/git을 쓰므로 mutating 호출은 최소화(가급적 삭제/배포는 검증용으로만, 필요 없으면 생략). 서버 종료 후 포트 5000 해제 확인.

- [ ] **Step 5: Commit**

```bash
git add tools/templates/index.html tools/static/generate.js tools/static/generate.css
git commit -m "feat: 탭 UI + 모드 버튼 + 선택 배포 + 상태 박스 + 발행 관리"
```

---

## Self-Review

**Spec coverage:**
- Mode A/B 세그먼트 버튼(라벨 정확) → Task 2 (mode-toggle, setMode) ✅
- 카드별 체크박스 선택 배포(기본 해제, 미체크 유지, N=체크수) → Task 2(pick/updateCardCount/publish) + Task 1(`/api/publish {cardIds}`) ✅
- 진행 상태 박스(카드 위) → Task 2(`.status-box` 위치) ✅
- 2개 탭(생성/발행관리) → Task 2(tabs/showTab) ✅
- 발행 브리핑 조회/삭제 → Task 1(`GET /api/briefings`, `POST /api/briefings/delete`, store.remove_briefings) + Task 2(관리 탭) ✅
- 공개 아카이브 불변 → 루트 파일 미수정 ✅

**Type/계약 일관성:** `/api/publish`는 `{cardIds}`(프론트 전송)와 서버 파싱 일치. `/api/briefings/delete`는 `{ids}` 일치. cardId는 서버 생성 문자열이며 `esc()`로 감쌈(방어). 설정 shape 불변.

**위험/주의:**
- `/api/publish`가 `cardIds` 없으면 전체 배포(하위호환) — 프론트는 항상 cardIds 전송하므로 실사용은 선택 배포. 기존 테스트(`{}`)와 호환.
- 삭제/배포는 git push까지 즉시 수행(확인창 없음) — 스펙대로.
- Task 2는 Task 1 엔드포인트에 의존 → 순서 준수.
- 프론트 자동 테스트 없음 → 스모크로 검증(가능하면 jsdom).
