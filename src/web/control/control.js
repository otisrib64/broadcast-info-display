// @ts-check
import { connect, onState, onTelemetry, send, setConnIndicator } from "/shared/ws-client.js";
import {
  startClock, setBigClockElements, applyClockConfig,
  setHeaderClock, enableClockDrag, setOnClockDragEnd,
} from "/shared/clock.js";
import { renderCriticalStrip, renderMemoBanner, renderLegend, STATUS_LABEL } from "/shared/render.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tbody           = /** @type {HTMLTableSectionElement} */ (document.getElementById("tbody"));
const btnAdd          = /** @type {HTMLButtonElement} */       (document.getElementById("btn-add"));
const connIndicator   = /** @type {HTMLElement} */             (document.getElementById("conn-indicator"));
const connBadge       = /** @type {HTMLElement} */             (document.getElementById("conn-badge"));
const clockEl         = /** @type {HTMLElement} */             (document.getElementById("clock"));
const memoText        = /** @type {HTMLTextAreaElement} */     (document.getElementById("memo-text"));
const memoBanner      = /** @type {HTMLElement} */             (document.getElementById("memo-banner"));
const criticalStrip   = /** @type {HTMLElement} */             (document.getElementById("critical-strip"));
const rowCounterBadge = /** @type {HTMLElement} */             (document.getElementById("row-counter-badge"));
const legendEl        = /** @type {HTMLElement} */             (document.getElementById("legend"));
const overlayImg      = /** @type {HTMLImageElement} */        (document.getElementById("overlay-img"));
const imgFile         = /** @type {HTMLInputElement} */        (document.getElementById("img-file"));
const imgWidthIn      = /** @type {HTMLInputElement} */        (document.getElementById("img-width"));
const imgWidthVal     = /** @type {HTMLElement} */             (document.getElementById("img-width-val"));
const imgXIn          = /** @type {HTMLInputElement} */        (document.getElementById("img-x"));
const imgXVal         = /** @type {HTMLElement} */             (document.getElementById("img-x-val"));
const imgYIn          = /** @type {HTMLInputElement} */        (document.getElementById("img-y"));
const imgYVal         = /** @type {HTMLElement} */             (document.getElementById("img-y-val"));
const imgVisible      = /** @type {HTMLInputElement} */        (document.getElementById("img-visible"));
const btnImgRemove    = /** @type {HTMLButtonElement} */       (document.getElementById("btn-img-remove"));
const bigClock        = /** @type {HTMLElement} */             (document.getElementById("big-clock"));
const bigClockTime    = /** @type {HTMLElement} */             (document.getElementById("big-clock-time"));
const bigClockDate    = /** @type {HTMLElement} */             (document.getElementById("big-clock-date"));
const bigClockHead    = /** @type {HTMLElement} */             (document.getElementById("big-clock-head"));
const clockVisible    = /** @type {HTMLInputElement} */        (document.getElementById("clock-visible-toggle"));
const clockScaleSlider= /** @type {HTMLInputElement} */        (document.getElementById("clock-scale-slider"));
const clockScaleVal   = /** @type {HTMLElement} */             (document.getElementById("clock-scale-val"));

// Column header inputs
const colInputs = /** @type {NodeListOf<HTMLInputElement>} */ (document.querySelectorAll(".column-title-input"));

// ── State ──────────────────────────────────────────────────────────────────────

/** @type {any[]} */
let rows = [];
/** @type {any} */
let image;
/** @type {string} */
let memo = "";
/** @type {Record<string, string>} */
let columns = { frame: "Frame", model: "Modelo", source: "Fonte", description: "Descrição", note: "Nota", status: "Status" };
/** @type {{ visible: boolean, scale: number, x: number, y: number }} */
let clockCfg = { visible: false, scale: 1, x: 0, y: 92 };

const STATUSES = ["ok", "standby", "atencao", "off", "manutencao"];
const TEXT_FIELDS = /** @type {const} */ (["frame", "model", "source", "description", "note"]);
const FIELD_DATALIST = { frame: "dl-frame", model: "dl-model", source: "dl-source", note: "dl-note" };

// ── Init ──────────────────────────────────────────────────────────────────────

setHeaderClock(clockEl);
setBigClockElements({ clock: bigClock, time: bigClockTime, date: bigClockDate, head: bigClockHead });
startClock();
renderLegend(legendEl);
setConnIndicator(connIndicator);

enableClockDrag();
setOnClockDragEnd((pos) => {
  clockCfg = { ...clockCfg, x: pos.x, y: pos.y };
  sendClock();
});

// Sync connBadge state with ws-client indicator
const observer = new MutationObserver(() => {
  const isOnline = connIndicator.classList.contains("online") || connIndicator.textContent?.includes("ONLINE");
  connBadge.textContent = isOnline ? "● ONLINE" : "● OFFLINE";
  connBadge.className = isOnline ? "conn-badge online" : "conn-badge offline";
});
observer.observe(connIndicator, { characterData: true, childList: true, subtree: true });

// ── Tabs ──────────────────────────────────────────────────────────────────────

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    const tab = /** @type {HTMLElement} */ (btn).dataset.tab;
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    document.querySelectorAll(".tab-panel").forEach((p) => p.classList.add("hidden"));
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.remove("hidden");
  });
});

// ── Table helpers ─────────────────────────────────────────────────────────────

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** @param {string} field @param {string} id @param {string} value */
function makeInput(field, id, value) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.dataset.field = field;
  input.dataset.id = id;
  const listId = FIELD_DATALIST[field];
  if (listId) input.setAttribute("list", listId);
  return input;
}

/** @param {string} id @param {string} current */
function makeSelect(id, current) {
  const sel = document.createElement("select");
  sel.dataset.field = "status";
  sel.dataset.id = id;
  sel.className = current;
  for (const s of STATUSES) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = STATUS_LABEL[s] ?? s.toUpperCase();
    if (s === current) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

/** @param {string} id */
function makeRemoveBtn(id) {
  const btn = document.createElement("button");
  btn.className = "btn-remove";
  btn.textContent = "✕";
  btn.dataset.action = "remove";
  btn.dataset.id = id;
  return btn;
}

function renderTable() {
  tbody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;
      for (const field of TEXT_FIELDS) {
        const td = document.createElement("td");
        td.appendChild(makeInput(field, row.id, row[field] ?? ""));
        tr.appendChild(td);
      }
      const tdSel = document.createElement("td");
      tdSel.appendChild(makeSelect(row.id, row.status));
      tr.appendChild(tdSel);
      const tdAct = document.createElement("td");
      tdAct.appendChild(makeRemoveBtn(row.id));
      tr.appendChild(tdAct);
      return tr;
    })
  );
}

function sameRowStructure(incoming) {
  const trs = tbody.children;
  if (trs.length !== incoming.length) return false;
  for (let i = 0; i < incoming.length; i++) {
    if (/** @type {HTMLElement} */ (trs[i]).dataset.id !== incoming[i].id) return false;
  }
  return true;
}

function patchTable() {
  const active = document.activeElement;
  for (const el of Array.from(tbody.children)) {
    const tr = /** @type {HTMLElement} */ (el);
    const row = rows.find((r) => r.id === tr.dataset.id);
    if (!row) continue;
    for (const field of TEXT_FIELDS) {
      const input = /** @type {HTMLInputElement | null} */ (tr.querySelector(`input[data-field="${field}"]`));
      if (!input || input === active) continue;
      if (input.value !== (row[field] ?? "")) input.value = row[field] ?? "";
    }
    const sel = /** @type {HTMLSelectElement | null} */ (tr.querySelector('select[data-field="status"]'));
    if (sel && sel !== active && sel.value !== row.status) {
      sel.value = row.status;
      sel.className = row.status;
    }
  }
}

function updateRowCounter() {
  const n = rows.length;
  rowCounterBadge.textContent = `${n} / 20`;
  btnAdd.disabled = n >= 20;
}

function syncColumnInputs() {
  colInputs.forEach((input) => {
    const col = input.dataset.col;
    if (col && columns[col] !== undefined && document.activeElement !== input) {
      input.value = columns[col];
    }
  });
}

// ── Send helpers ──────────────────────────────────────────────────────────────

function sendState() {
  send({ type: "setState", state: { rows, image, memo, columns, clock: clockCfg } });
}

function sendClock() {
  send({ type: "setClock", clock: clockCfg });
}

function sendColumns() {
  send({ type: "setColumns", columns });
}

// ── Image render ───────────────────────────────────────────────────────────────

function renderImage() {
  if (!image?.src) { overlayImg.classList.add("hidden"); return; }
  overlayImg.src = image.src;
  overlayImg.style.left  = `${image.x}px`;
  overlayImg.style.top   = `${image.y}px`;
  overlayImg.style.width = `${image.width}px`;
  overlayImg.classList.toggle("hidden", !image.visible);
  imgWidthIn.value = String(image.width); imgWidthVal.textContent = String(image.width);
  imgXIn.value = String(image.x);         imgXVal.textContent = String(image.x);
  imgYIn.value = String(image.y);         imgYVal.textContent = String(image.y);
  imgVisible.checked = image.visible;
}

// ── WS state handler ───────────────────────────────────────────────────────────

onState((state) => {
  const structural = !sameRowStructure(state.rows);
  rows  = state.rows;
  image = state.image;
  memo  = state.memo ?? "";
  if (state.columns) columns = state.columns;
  if (state.clock)   {
    clockCfg = state.clock;
    applyClockConfig(clockCfg);
    clockVisible.checked = clockCfg.visible;
    clockScaleSlider.value = String(clockCfg.scale);
    clockScaleVal.textContent = `${Math.round(clockCfg.scale * 100)}%`;
  }

  if (structural) renderTable(); else patchTable();
  updateRowCounter();
  syncColumnInputs();
  renderMemoBanner(memoBanner, memo);
  renderImage();
  if (document.activeElement !== memoText) memoText.value = memo;
});

// ── Telemetry ─────────────────────────────────────────────────────────────────

onTelemetry((telemetry) => {
  criticalStrip.style.display = "";
  renderCriticalStrip(criticalStrip, telemetry);

  // Also update status dashboard cards
  const loc = telemetry.location;
  const wx  = telemetry.weather;
  const net = telemetry.internet;

  const dashLocation = document.getElementById("dash-location");
  const dashRegion   = document.getElementById("dash-region");
  if (dashLocation) dashLocation.textContent = loc ? loc.city : "—";
  if (dashRegion)   dashRegion.textContent   = loc ? loc.region : "sem dados";

  const dashTemp      = document.getElementById("dash-temp");
  const dashCondition = document.getElementById("dash-condition");
  if (dashTemp)      dashTemp.textContent      = wx ? `${wx.tempC.toFixed(1)}°C` : "—";
  if (dashCondition) dashCondition.textContent = wx ? wx.condition : "sem dados";

  const dashRain    = document.getElementById("dash-rain");
  const dashRainSub = document.getElementById("dash-rain-sub");
  if (dashRain)    dashRain.textContent    = wx ? (wx.raining ? "Chuva" : "Sem chuva") : "—";
  if (dashRainSub) dashRainSub.textContent = wx ? `${wx.rainChancePct}% chance` : "sem dados";

  const dashInternet    = document.getElementById("dash-internet");
  const dashInternetSub = document.getElementById("dash-internet-sub");
  if (dashInternet)    dashInternet.textContent    = net.online ? "Online" : "Offline";
  if (dashInternetSub) {
    if (net.online && net.onlineSinceMs) {
      const mins = Math.floor((Date.now() - net.onlineSinceMs) / 60000);
      dashInternetSub.textContent = mins < 60 ? `${mins}min ininterrupto` : `${Math.floor(mins / 60)}h ininterrupto`;
    } else if (!net.online && net.lastDownAtMs) {
      const mins = Math.floor((Date.now() - net.lastDownAtMs) / 60000);
      dashInternetSub.textContent = `Caiu há ${mins}min`;
    } else {
      dashInternetSub.textContent = "—";
    }
  }
});

// ── Table events ───────────────────────────────────────────────────────────────

tbody.addEventListener("input", (ev) => {
  const t = /** @type {HTMLInputElement | null} */ (ev.target);
  if (!t?.dataset.id || !t.dataset.field) return;
  rows = rows.map((r) => r.id === t.dataset.id ? { ...r, [t.dataset.field]: t.value } : r);
  sendState();
});

tbody.addEventListener("change", (ev) => {
  const t = /** @type {HTMLSelectElement | null} */ (ev.target);
  if (t?.dataset.field !== "status") return;
  rows = rows.map((r) => r.id === t.dataset.id ? { ...r, status: t.value } : r);
  t.className = t.value;
  sendState();
});

tbody.addEventListener("click", (ev) => {
  const t = /** @type {HTMLElement | null} */ (ev.target);
  if (t?.dataset.action !== "remove") return;
  rows = rows.filter((r) => r.id !== t.dataset.id);
  renderTable();
  updateRowCounter();
  sendState();
});

btnAdd.addEventListener("click", () => {
  if (rows.length >= 20) return;
  const nextFrame = `Frame ${rows.length + 1}`;
  rows = [...rows, { id: generateId(), frame: nextFrame, model: "", source: "", description: "", note: "", status: "standby" }];
  renderTable();
  updateRowCounter();
  sendState();
});

// ── Column name events ─────────────────────────────────────────────────────────

colInputs.forEach((input) => {
  input.addEventListener("input", () => {
    const col = input.dataset.col;
    if (!col) return;
    columns = { ...columns, [col]: input.value };
    sendColumns();
  });
});

// ── Memo events ────────────────────────────────────────────────────────────────

memoText.addEventListener("input", () => {
  memo = memoText.value;
  renderMemoBanner(memoBanner, memo);
  sendState();
});

// ── Image events ───────────────────────────────────────────────────────────────

imgFile.addEventListener("change", () => {
  const file = imgFile.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const src = /** @type {string} */ (reader.result);
    image = { src, x: image?.x ?? 50, y: image?.y ?? 50, width: image?.width ?? 200, visible: true };
    renderImage();
    sendState();
  });
  reader.readAsDataURL(file);
});

imgWidthIn.addEventListener("input", () => {
  const w = Number(imgWidthIn.value); imgWidthVal.textContent = String(w);
  if (!image) return;
  image = { ...image, width: w }; renderImage(); sendState();
});
imgXIn.addEventListener("input", () => {
  const x = Number(imgXIn.value); imgXVal.textContent = String(x);
  if (!image) return;
  image = { ...image, x }; renderImage(); sendState();
});
imgYIn.addEventListener("input", () => {
  const y = Number(imgYIn.value); imgYVal.textContent = String(y);
  if (!image) return;
  image = { ...image, y }; renderImage(); sendState();
});
imgVisible.addEventListener("change", () => {
  if (!image) return;
  image = { ...image, visible: imgVisible.checked }; renderImage(); sendState();
});
btnImgRemove.addEventListener("click", () => {
  image = undefined; overlayImg.classList.add("hidden"); overlayImg.src = ""; imgFile.value = "";
  sendState();
});

// Image drag
let dragging = false, dragOffX = 0, dragOffY = 0;
overlayImg.addEventListener("mousedown", (ev) => {
  dragging = true;
  dragOffX = ev.clientX - (image?.x ?? 0); dragOffY = ev.clientY - (image?.y ?? 0);
  ev.preventDefault();
});
document.addEventListener("mousemove", (ev) => {
  if (!dragging || !image) return;
  image = { ...image, x: ev.clientX - dragOffX, y: ev.clientY - dragOffY };
  overlayImg.style.left = `${image.x}px`; overlayImg.style.top = `${image.y}px`;
  imgXIn.value = String(Math.round(image.x)); imgXVal.textContent = imgXIn.value;
  imgYIn.value = String(Math.round(image.y)); imgYVal.textContent = imgYIn.value;
});
document.addEventListener("mouseup", () => { if (!dragging) return; dragging = false; sendState(); });

// ── Clock settings events ─────────────────────────────────────────────────────

clockVisible.addEventListener("change", () => {
  clockCfg = { ...clockCfg, visible: clockVisible.checked };
  applyClockConfig(clockCfg);
  sendClock();
});

clockScaleSlider.addEventListener("input", () => {
  const scale = parseFloat(clockScaleSlider.value);
  clockScaleVal.textContent = `${Math.round(scale * 100)}%`;
  clockCfg = { ...clockCfg, scale };
  applyClockConfig(clockCfg);
  sendClock();
});

// ── Connect ───────────────────────────────────────────────────────────────────

connect();
