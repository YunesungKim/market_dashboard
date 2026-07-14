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
