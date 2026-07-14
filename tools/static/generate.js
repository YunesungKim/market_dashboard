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
