const cardsEl = document.getElementById("cards");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}

function safeUrl(u) {
  const s = String(u == null ? "" : u).trim();
  return /^https?:\/\//i.test(s) ? s : "#";
}

function openDetail(b) {
  const sources = (b.sources || [])
    .map(s => `<li><a href="${esc(safeUrl(s.url))}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a> — ${esc(s.source)} · ${esc(s.publishedDate)}</li>`)
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
