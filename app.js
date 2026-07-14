const cardsEl = document.getElementById("cards");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const fYear = document.getElementById("fYear");
const fMonth = document.getElementById("fMonth");
const fDay = document.getElementById("fDay");

let ALL = [];

function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[c]);
}
function safeUrl(u) {
  const s = String(u == null ? "" : u).trim();
  return /^https?:\/\//i.test(s) ? s : "#";
}

function dateParts(dateStr) {
  const [y, m, d] = String(dateStr || "").split("-");
  return { y: y || "", m: m || "", d: d || "" };
}
function uniqDesc(values) {
  return [...new Set(values.filter(Boolean))].sort().reverse();
}
function fillSelect(sel, values) {
  const cur = sel.value;
  sel.innerHTML = '<option value="">전체</option>' +
    values.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join("");
  sel.value = [...sel.options].some(o => o.value === cur) ? cur : "";
}
function rebuildMonthDay() {
  const y = fYear.value;
  const scopeY = ALL.filter(b => !y || dateParts(b.date).y === y);
  fillSelect(fMonth, uniqDesc(scopeY.map(b => dateParts(b.date).m)));
  const m = fMonth.value;
  const scopeM = scopeY.filter(b => !m || dateParts(b.date).m === m);
  fillSelect(fDay, uniqDesc(scopeM.map(b => dateParts(b.date).d)));
}
function currentFiltered() {
  const y = fYear.value, m = fMonth.value, d = fDay.value;
  return ALL.filter(b => {
    const p = dateParts(b.date);
    return (!y || p.y === y) && (!m || p.m === m) && (!d || p.d === d);
  });
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

function renderCards() {
  const list = currentFiltered().sort((a, b) => (a.date < b.date ? 1 : -1));
  countEl.textContent = `${list.length}건`;
  emptyEl.classList.toggle("hidden", list.length > 0);
  cardsEl.innerHTML = list.map((b, i) => `
    <article class="card" data-i="${i}" tabindex="0">
      <div class="card__date">${esc(b.date)}</div>
      <h2 class="card__title">${esc(b.title)}</h2>
      <p class="card__summary">${esc(b.summary)}</p>
      <span class="card__badge">${esc((b.generator && b.generator.mode) || "")}</span>
    </article>`).join("");
  cardsEl.querySelectorAll(".card").forEach(el => {
    const b = list[Number(el.dataset.i)];
    el.onclick = () => openDetail(b);
    el.onkeydown = (e) => { if (e.key === "Enter") openDetail(b); };
  });
}

function init(all) {
  ALL = Array.isArray(all) ? all : [];
  fillSelect(fYear, uniqDesc(ALL.map(b => dateParts(b.date).y)));
  rebuildMonthDay();
  renderCards();
}

fYear.onchange = () => { rebuildMonthDay(); renderCards(); };
fMonth.onchange = () => { rebuildMonthDay(); renderCards(); };
fDay.onchange = renderCards;

document.getElementById("closeBtn").onclick = () => modal.classList.add("hidden");
modal.onclick = (e) => { if (e.target === modal) modal.classList.add("hidden"); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape") modal.classList.add("hidden"); });

fetch("briefings.json")
  .then(r => r.json())
  .then(init)
  .catch(() => { cardsEl.innerHTML = "<p class='empty'>브리핑을 불러오지 못했습니다.</p>"; });
