const cardsEl = document.getElementById("cards");
const statusEl = document.getElementById("status");

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

function cardHtml(card) {
  const sources = (card.sources || [])
    .map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> <span class="meta">${esc(s.source)} · ${esc(s.publishedDate)}</span></li>`)
    .join("");
  return `
    <div class="card" data-id="${card.cardId}">
      <h3 contenteditable data-field="title">${esc(card.title || "")}</h3>
      <div class="meta">${card.date} · ${card.generator?.mode || ""}</div>
      <p contenteditable data-field="summary">${esc(card.summary || "")}</p>
      <details><summary>상세/출처</summary>
        <p contenteditable data-field="detail">${esc(card.detail || "")}</p>
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
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  render((await r.json()).cards);
}

async function loadTrends() {
  setStatus("시장 동향 불러오는 중…");
  const r = await fetch("/api/trends");
  if (!r.ok) { setStatus("오류가 발생했습니다 (" + r.status + ")"); return; }
  await refresh();
  setStatus("후보 카드 준비 완료");
}

async function search() {
  setStatus("검색 중…");
  const r = await fetch("/api/search", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company: document.getElementById("company").value,
      keyword: document.getElementById("keyword").value,
      mode: document.getElementById("useLlm").checked ? "llm" : "serper",
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
  if (!r.ok) { return; }
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

document.getElementById("searchBtn").onclick = search;
document.getElementById("publishBtn").onclick = publish;
loadTrends();
