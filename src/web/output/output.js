// @ts-check
import { connect, onState, onTelemetry, setConnIndicator } from "/shared/ws-client.js";
import { startClock, setBigClockElements, applyClockConfig, setHeaderClock } from "/shared/clock.js";
import { renderCriticalStrip, renderMemoBanner, renderLegend, makeStatusBadge, STATUS_LABEL } from "/shared/render.js";

const tbody        = /** @type {HTMLTableSectionElement} */ (document.getElementById("tbody"));
const theadRow     = /** @type {HTMLTableRowElement} */    (document.getElementById("thead-row"));
const memoBanner   = /** @type {HTMLElement} */            (document.getElementById("memo-banner"));
const criticalStrip= /** @type {HTMLElement} */            (document.getElementById("critical-strip"));
const rowCounter   = /** @type {HTMLElement} */            (document.getElementById("row-counter"));
const legendEl     = /** @type {HTMLElement} */            (document.getElementById("legend"));
const bigClock     = /** @type {HTMLElement} */            (document.getElementById("big-clock"));
const bigClockTime = /** @type {HTMLElement} */            (document.getElementById("big-clock-time"));
const bigClockDate = /** @type {HTMLElement} */            (document.getElementById("big-clock-date"));
const clockEl      = /** @type {HTMLElement} */            (document.getElementById("clock"));
const connIndicator= /** @type {HTMLElement} */            (document.getElementById("conn-indicator"));
const overlayImg   = /** @type {HTMLImageElement} */       (document.getElementById("overlay-img"));

// ── State ──────────────────────────────────────────────────────────────────────

/** @type {any[]} */
let rows = [];
/** @type {Record<string, string>} */
let columns = { frame: "Frame", model: "Modelo", source: "Fonte", description: "Descrição", note: "Nota", status: "Status" };

// ── Init clock ─────────────────────────────────────────────────────────────────

setHeaderClock(clockEl);
setBigClockElements({ clock: bigClock, time: bigClockTime, date: bigClockDate, head: null });
startClock();
renderLegend(legendEl);

setConnIndicator(connIndicator);

// ── Table render ───────────────────────────────────────────────────────────────

const TEXT_FIELDS = /** @type {const} */ (["frame", "model", "source", "description", "note"]);

function sameRowStructure(incoming) {
  const trs = tbody.children;
  if (trs.length !== incoming.length) return false;
  for (let i = 0; i < incoming.length; i++) {
    if (/** @type {HTMLElement} */ (trs[i]).dataset.id !== incoming[i].id) return false;
  }
  return true;
}

function renderTable() {
  tbody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      for (const field of TEXT_FIELDS) {
        const td = document.createElement("td");
        const box = document.createElement("div");
        box.className = "cell-box";
        box.textContent = row[field] ?? "";
        td.appendChild(box);
        tr.appendChild(td);
      }
      const tdStatus = document.createElement("td");
      tdStatus.appendChild(makeStatusBadge(row.status));
      tr.appendChild(tdStatus);
      return tr;
    })
  );
}

function patchTable() {
  for (const el of Array.from(tbody.children)) {
    const tr = /** @type {HTMLElement} */ (el);
    const row = rows.find((r) => r.id === tr.dataset.id);
    if (!row) continue;

    const cells = tr.querySelectorAll(".cell-box");
    TEXT_FIELDS.forEach((field, i) => {
      const cell = /** @type {HTMLElement | null} */ (cells[i]);
      if (cell && cell.textContent !== (row[field] ?? "")) {
        cell.textContent = row[field] ?? "";
      }
    });

    const badge = tr.querySelector(".status-badge");
    if (badge && (badge.className !== `status-badge ${row.status}` || badge.textContent !== STATUS_LABEL[row.status])) {
      const newBadge = makeStatusBadge(row.status);
      badge.replaceWith(newBadge);
    }
  }
}

function updateColumns() {
  const headers = theadRow.querySelectorAll("th");
  const fields = ["frame", "model", "source", "description", "note", "status"];
  headers.forEach((th, i) => {
    if (fields[i]) th.textContent = columns[fields[i]] ?? th.textContent;
  });
}

function updateRowCounter() {
  rowCounter.textContent = `${rows.length} linha${rows.length !== 1 ? "s" : ""}`;
}

// ── Image ──────────────────────────────────────────────────────────────────────

function renderImage(image) {
  if (!image?.src) { overlayImg.classList.add("hidden"); return; }
  overlayImg.src = image.src;
  overlayImg.style.left  = `${image.x}px`;
  overlayImg.style.top   = `${image.y}px`;
  overlayImg.style.width = `${image.width}px`;
  overlayImg.classList.toggle("hidden", !image.visible);
}

// ── WS state handler ───────────────────────────────────────────────────────────

onState((state) => {
  const structural = !sameRowStructure(state.rows);
  rows = state.rows;
  if (state.columns) columns = state.columns;
  if (state.clock) applyClockConfig(state.clock);

  updateColumns();
  if (structural) renderTable(); else patchTable();
  updateRowCounter();
  renderMemoBanner(memoBanner, state.memo ?? "");
  renderImage(state.image);
});

// ── Telemetry ─────────────────────────────────────────────────────────────────

onTelemetry((telemetry) => {
  criticalStrip.style.display = "";
  renderCriticalStrip(criticalStrip, telemetry);
});

// ── Connect ───────────────────────────────────────────────────────────────────

connect();
