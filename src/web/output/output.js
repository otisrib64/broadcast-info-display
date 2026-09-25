// @ts-check
import { connect, onState, onTelemetry } from "/shared/ws-client.js";
import { startClock, setBigClockElements, applyClockConfig, setHeaderClock } from "/shared/clock.js";
import { renderCriticalStrip, renderMemoBanner, renderLegend, makeStatusBadge, STATUS_LABEL } from "/shared/render.js";

const tbody = /** @type {HTMLTableSectionElement} */ (document.getElementById("tbody"));
const thead = /** @type {HTMLTableRowElement} */ (document.getElementById("thead-row"));
const rowCounter = /** @type {HTMLElement} */ (document.getElementById("row-counter"));
const memo = /** @type {HTMLElement} */ (document.getElementById("memo-banner"));
const strip = /** @type {HTMLElement} */ (document.getElementById("critical-strip"));
const legend = /** @type {HTMLElement} */ (document.getElementById("legend"));
const overlay = /** @type {HTMLImageElement} */ (document.getElementById("overlay-img"));
const clock = /** @type {HTMLElement} */ (document.getElementById("clock"));
const bigClock = /** @type {HTMLElement} */ (document.getElementById("big-clock"));
const bigTime = /** @type {HTMLElement} */ (document.getElementById("big-clock-time"));
const bigDate = /** @type {HTMLElement} */ (document.getElementById("big-clock-date"));
let rows = [];
let columns = { frame: "Frame", model: "Modelo", source: "Fonte", description: "Descrição", note: "Nota", status: "Status" };

setHeaderClock(clock);
setBigClockElements({ clock: bigClock, time: bigTime, date: bigDate, head: null });
startClock();
renderLegend(legend);

function updateHeaders() {
  const fields = ["frame", "model", "source", "description", "note", "status"];
  thead.querySelectorAll("th").forEach((th, i) => { if (fields[i]) th.textContent = columns[fields[i]] ?? th.textContent; });
}

function renderTable() {
  tbody.replaceChildren(...rows.map((row) => {
    const tr = document.createElement("tr");
    tr.dataset.id = row.id;
    for (const field of ["frame", "model", "source", "description", "note"]) {
      const td = document.createElement("td");
      const value = document.createElement("div");
      value.className = "cell-box";
      value.textContent = row[field] ?? "";
      td.appendChild(value); tr.appendChild(td);
    }
    const status = document.createElement("td");
    status.appendChild(makeStatusBadge(row.status));
    tr.appendChild(status);
    return tr;
  }));
}

function renderImage(image) {
  if (!image?.src?.startsWith("data:image/")) { overlay.classList.add("hidden"); return; }
  overlay.src = image.src;
  overlay.style.left = `${image.x}px`;
  overlay.style.top = `${image.y}px`;
  overlay.style.width = `${image.width}px`;
  overlay.classList.toggle("hidden", !image.visible);
}

onState((state) => {
  rows = state.rows;
  if (state.columns) columns = state.columns;
  updateHeaders();
  renderTable();
  rowCounter.textContent = `${rows.length} linha${rows.length === 1 ? "" : "s"}`;
  renderMemoBanner(memo, state.memo ?? "");
  renderImage(state.image);
  if (state.clock) applyClockConfig(state.clock);
});
onTelemetry((telemetry) => { strip.style.display = ""; renderCriticalStrip(strip, telemetry); });
connect();
