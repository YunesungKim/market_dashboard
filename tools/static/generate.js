const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");
const cardCountEl = document.getElementById("cardCount");
const modeBadge = document.getElementById("modeBadge");
const useLlm = document.getElementById("useLlm");

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

function updateModeBadge() {
  modeBadge.textContent = useLlm.checked ? "B · LLM" : "A · Serper";
  modeBadge.classList.toggle("mode-badge--llm", useLlm.checked);
}

function cardHtml(card) {
  const sources = (card.sources || [])
    .map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="meta">${esc(s.source)} · ${esc(s.publishedDate)}</span></li>`)
    .join("");
  return `
    <div class="card" data-id="${card.cardId}">
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

function render(cards) {
  cardCountEl.textContent = cards.length;
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
      mode: useLlm.checked ? "llm" : "serper",
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
  setStatus("배포 중…");
  const r = await fetch("/api/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  const n = (await r.json()).published;
  await refresh();
  setStatus(`${n}건 배포 완료`);
}

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

useLlm.onchange = updateModeBadge;
document.getElementById("searchBtn").onclick = search;
document.getElementById("publishBtn").onclick = publish;
updateModeBadge();
loadTrends();
