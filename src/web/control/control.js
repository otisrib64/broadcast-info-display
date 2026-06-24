// @ts-check
import { connect, onState, onTelemetry, onFilesChanged, send, setConnIndicator } from "/shared/ws-client.js";
import {
  startClock, setBigClockElements, applyClockConfig,
  setHeaderClock, enableClockDrag, setOnClockDragEnd,
  setSwDisplayEl,
} from "/shared/clock.js";
import { renderCriticalStrip, renderMemoBanner, renderLegend, STATUS_LABEL } from "/shared/render.js";

// ── DOM refs ──────────────────────────────────────────────────────────────────
const tbody           = /** @type {HTMLTableSectionElement} */ (document.getElementById("tbody"));
const btnAdd          = /** @type {HTMLButtonElement} */       (document.getElementById("btn-add"));
const connIndicator   = /** @type {HTMLElement} */             (document.getElementById("conn-indicator"));
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
const btnModeClock    = /** @type {HTMLButtonElement} */       (document.getElementById("btn-mode-clock"));
const btnModeSw       = /** @type {HTMLButtonElement} */       (document.getElementById("btn-mode-sw"));
const swControls      = /** @type {HTMLElement} */             (document.getElementById("sw-controls"));
const swDisplay       = /** @type {HTMLElement} */             (document.getElementById("sw-display"));
const btnSwStart      = /** @type {HTMLButtonElement} */       (document.getElementById("btn-sw-start"));
const btnSwStop       = /** @type {HTMLButtonElement} */       (document.getElementById("btn-sw-stop"));
const btnSwReset      = /** @type {HTMLButtonElement} */       (document.getElementById("btn-sw-reset"));

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
/** @type {{ visible: boolean, scale: number, x: number, y: number, mode: "clock"|"stopwatch", stopwatch?: { running: boolean, startedAtMs: number|null, accumulatedMs: number } }} */
let clockCfg = { visible: false, scale: 1, x: 0, y: 92, mode: "clock" };

const STATUSES = ["ok", "standby", "atencao", "off", "manutencao"];
const TEXT_FIELDS = /** @type {const} */ (["frame", "model", "source", "description", "note"]);
const FIELD_DATALIST = { frame: "dl-frame", model: "dl-model", source: "dl-source", note: "dl-note" };

// ── Init ──────────────────────────────────────────────────────────────────────

setHeaderClock(clockEl);
setBigClockElements({ clock: bigClock, time: bigClockTime, date: bigClockDate, head: bigClockHead });
setSwDisplayEl(swDisplay);
startClock();
renderLegend(legendEl);
setConnIndicator(connIndicator);

enableClockDrag();
setOnClockDragEnd((pos) => {
  clockCfg = { ...clockCfg, x: pos.x, y: pos.y };
  sendClock();
});

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
    updateSwControls();
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

// ── Stopwatch controls ────────────────────────────────────────────────────────

function defaultSw() {
  return { running: false, startedAtMs: null, accumulatedMs: 0 };
}

function updateSwControls() {
  const isSw = clockCfg.mode === "stopwatch";
  swControls.classList.toggle("hidden", !isSw);
  btnModeClock.classList.toggle("active", !isSw);
  btnModeSw.classList.toggle("active", isSw);
  const sw = clockCfg.stopwatch ?? defaultSw();
  btnSwStart.disabled = sw.running;
  btnSwStop.disabled  = !sw.running;
  if (!isSw) swDisplay.textContent = "—";
}

btnModeClock.addEventListener("click", () => {
  clockCfg = { ...clockCfg, mode: "clock" };
  applyClockConfig(clockCfg);
  updateSwControls();
  sendClock();
});

btnModeSw.addEventListener("click", () => {
  clockCfg = { ...clockCfg, mode: "stopwatch", stopwatch: clockCfg.stopwatch ?? defaultSw() };
  applyClockConfig(clockCfg);
  updateSwControls();
  sendClock();
});

btnSwStart.addEventListener("click", () => {
  const sw = clockCfg.stopwatch ?? defaultSw();
  if (sw.running) return;
  clockCfg = { ...clockCfg, stopwatch: { ...sw, running: true, startedAtMs: Date.now() } };
  applyClockConfig(clockCfg);
  updateSwControls();
  sendClock();
});

btnSwStop.addEventListener("click", () => {
  const sw = clockCfg.stopwatch ?? defaultSw();
  if (!sw.running || sw.startedAtMs === null) return;
  const accumulatedMs = sw.accumulatedMs + (Date.now() - sw.startedAtMs);
  clockCfg = { ...clockCfg, stopwatch: { running: false, startedAtMs: null, accumulatedMs } };
  applyClockConfig(clockCfg);
  updateSwControls();
  sendClock();
});

btnSwReset.addEventListener("click", () => {
  clockCfg = { ...clockCfg, stopwatch: defaultSw() };
  applyClockConfig(clockCfg);
  updateSwControls();
  sendClock();
});

// ── Mini Cloud ────────────────────────────────────────────────────────────────

const cloudUsed     = /** @type {HTMLElement} */ (document.getElementById("cloud-used"));
const cloudDetail   = /** @type {HTMLElement} */ (document.getElementById("cloud-detail"));
const cloudFree     = /** @type {HTMLElement} */ (document.getElementById("cloud-free"));
const cloudBar      = /** @type {HTMLElement} */ (document.getElementById("cloud-bar"));
const cloudFileList = /** @type {HTMLElement} */ (document.getElementById("cloud-file-list"));
const cloudEmptyMsg = /** @type {HTMLElement} */ (document.getElementById("cloud-empty-msg"));
const cloudFileInput= /** @type {HTMLInputElement} */ (document.getElementById("cloud-file-input"));
const cloudUpStatus = /** @type {HTMLElement} */ (document.getElementById("cloud-upload-status"));
const fileDropZone  = /** @type {HTMLElement} */ (document.getElementById("file-drop-zone"));

const MAX_TOTAL = 250 * 1024 * 1024;

function fmtBytes(b) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fmtDate(ms) {
  return new Date(ms).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

async function loadCloudFiles() {
  try {
    const res = await fetch("/api/files");
    if (!res.ok) return;
    const files = /** @type {any[]} */ (await res.json());
    renderCloudFiles(files);
  } catch { /* offline */ }
}

/** @param {any[]} files */
function renderCloudFiles(files) {
  const totalBytes = files.reduce((s, f) => s + f.sizeBytes, 0);
  const pct = Math.min(100, (totalBytes / MAX_TOTAL) * 100);

  cloudUsed.textContent = fmtBytes(totalBytes);
  cloudDetail.textContent = `de 250 MB · ${files.length} / 15 arquivos`;
  cloudFree.textContent = `${fmtBytes(MAX_TOTAL - totalBytes)} livres`;
  cloudBar.style.width = `${pct.toFixed(1)}%`;

  if (files.length === 0) {
    cloudFileList.replaceChildren(cloudEmptyMsg);
    cloudEmptyMsg.style.display = "";
    return;
  }

  cloudEmptyMsg.style.display = "none";
  cloudFileList.replaceChildren(
    ...files.map((f) => {
      const row = document.createElement("div");
      row.className = "file-row";

      const nameCol = document.createElement("div");
      const name = document.createElement("div");
      name.className = "file-name"; name.textContent = f.originalName;
      const meta = document.createElement("div");
      meta.className = "file-meta"; meta.textContent = fmtDate(f.uploadedAtMs);
      nameCol.appendChild(name); nameCol.appendChild(meta);

      const sizeCol = document.createElement("div");
      sizeCol.className = "file-size"; sizeCol.textContent = fmtBytes(f.sizeBytes);

      const dlBtn = document.createElement("a");
      dlBtn.href = `/api/files/${encodeURIComponent(f.id)}`;
      dlBtn.download = f.originalName;
      dlBtn.className = "btn-outline btn-small";
      dlBtn.style.textAlign = "center"; dlBtn.style.display = "block";
      dlBtn.style.fontSize = "11px"; dlBtn.style.padding = "5px 8px";
      dlBtn.style.borderRadius = "var(--radius)"; dlBtn.style.border = "1px solid var(--border-mid)";
      dlBtn.style.color = "var(--text)"; dlBtn.style.textDecoration = "none";
      dlBtn.textContent = "Baixar";

      const delBtn = document.createElement("button");
      delBtn.className = "btn-danger btn-small"; delBtn.textContent = "Excluir";
      delBtn.addEventListener("click", async () => {
        delBtn.disabled = true;
        try {
          const r = await fetch(`/api/files/${encodeURIComponent(f.id)}`, { method: "DELETE" });
          if (r.ok) loadCloudFiles();
          else delBtn.disabled = false;
        } catch { delBtn.disabled = false; }
      });

      row.appendChild(nameCol); row.appendChild(sizeCol); row.appendChild(dlBtn); row.appendChild(delBtn);
      return row;
    })
  );
}

async function uploadFiles(files) {
  cloudUpStatus.textContent = "";
  for (const file of Array.from(files)) {
    const f = /** @type {File} */ (file);
    cloudUpStatus.textContent = `Enviando ${f.name}…`;
    const fd = new FormData();
    fd.append("file", f);
    try {
      const res = await fetch("/api/files", { method: "POST", body: fd });
      if (res.status === 413) { cloudUpStatus.textContent = `${f.name}: arquivo muito grande (máx 75 MB)`; continue; }
      if (res.status === 400) {
        const j = await res.json();
        cloudUpStatus.textContent = `${f.name}: ${j.error ?? "erro"}`;
        continue;
      }
      if (!res.ok) { cloudUpStatus.textContent = `${f.name}: erro ${res.status}`; continue; }
    } catch { cloudUpStatus.textContent = `${f.name}: falha de rede`; continue; }
  }
  cloudUpStatus.textContent = "Concluído.";
  setTimeout(() => { cloudUpStatus.textContent = ""; }, 3000);
  loadCloudFiles();
}

cloudFileInput.addEventListener("change", () => {
  if (cloudFileInput.files?.length) uploadFiles(cloudFileInput.files);
  cloudFileInput.value = "";
});

fileDropZone.addEventListener("dragover", (ev) => { ev.preventDefault(); fileDropZone.classList.add("drag-over"); });
fileDropZone.addEventListener("dragleave", () => fileDropZone.classList.remove("drag-over"));
fileDropZone.addEventListener("drop", (ev) => {
  ev.preventDefault();
  fileDropZone.classList.remove("drag-over");
  if (ev.dataTransfer?.files.length) uploadFiles(ev.dataTransfer.files);
});

// Refresh list when server signals filesChanged
onFilesChanged(() => loadCloudFiles());

// Load on tab open
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (/** @type {HTMLElement} */ (btn).dataset.tab === "nuvem") loadCloudFiles();
  });
});

// ── Network tab ───────────────────────────────────────────────────────────────

const netCurrentBar   = /** @type {HTMLElement} */       (document.getElementById("net-current-bar"));
const netBtnDhcp      = /** @type {HTMLButtonElement} */ (document.getElementById("net-btn-dhcp"));
const netBtnStatic    = /** @type {HTMLButtonElement} */ (document.getElementById("net-btn-static"));
const netStaticFields = /** @type {HTMLElement} */       (document.getElementById("net-static-fields"));
const netIp           = /** @type {HTMLInputElement} */  (document.getElementById("net-ip"));
const netPrefix       = /** @type {HTMLSelectElement} */ (document.getElementById("net-prefix"));
const netGateway      = /** @type {HTMLInputElement} */  (document.getElementById("net-gateway"));
const netDns1         = /** @type {HTMLInputElement} */  (document.getElementById("net-dns1"));
const netDns2         = /** @type {HTMLInputElement} */  (document.getElementById("net-dns2"));
const btnNetApply     = /** @type {HTMLButtonElement} */ (document.getElementById("btn-net-apply"));
const netModalBackdrop= /** @type {HTMLElement} */       (document.getElementById("net-modal-backdrop"));
const netModalTable   = /** @type {HTMLElement} */       (document.getElementById("net-modal-table"));
const netModalAck     = /** @type {HTMLInputElement} */  (document.getElementById("net-modal-ack"));
const btnNetCancel    = /** @type {HTMLButtonElement} */ (document.getElementById("btn-net-cancel"));
const btnNetConfirm   = /** @type {HTMLButtonElement} */ (document.getElementById("btn-net-confirm"));
const netModalStatus  = /** @type {HTMLElement} */       (document.getElementById("net-modal-status"));

/** @type {{ connection: string, iface: string, mode: "dhcp"|"static", ip: string, prefix: number, gateway: string, dns: string[] } | null} */
let netCurrent = null;
let netMode = /** @type {"dhcp"|"static"} */ ("dhcp");

function setNetMode(mode) {
  netMode = mode;
  netBtnDhcp.classList.toggle("active", mode === "dhcp");
  netBtnStatic.classList.toggle("active", mode === "static");
  netStaticFields.style.display = mode === "static" ? "" : "none";
}

async function loadNetworkConfig() {
  netCurrentBar.innerHTML = '<span class="net-current-label">Carregando…</span>';
  try {
    const res = await fetch("/api/network");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    netCurrent = await res.json();
    const c = netCurrent;
    const dnsStr = c.dns.join(", ") || "—";
    netCurrentBar.innerHTML =
      `<span class="net-current-label">Interface ${c.iface}</span>&nbsp;&nbsp;` +
      `Modo: <b>${c.mode === "static" ? "IP fixo" : "DHCP"}</b>&nbsp;&nbsp;` +
      `IP: <b>${c.ip || "—"}/${c.prefix}</b>&nbsp;&nbsp;` +
      `Gateway: <b>${c.gateway || "—"}</b>&nbsp;&nbsp;` +
      `DNS: <b>${dnsStr}</b>`;
    // Pre-fill form with current values
    setNetMode(c.mode);
    netIp.value      = c.ip;
    netPrefix.value  = String(c.prefix);
    netGateway.value = c.gateway;
    netDns1.value    = c.dns[0] ?? "";
    netDns2.value    = c.dns[1] ?? "";
  } catch (e) {
    netCurrentBar.innerHTML =
      `<span style="color:var(--off)">Erro ao ler configuração: ${e instanceof Error ? e.message : String(e)}</span>`;
  }
}

netBtnDhcp.addEventListener("click",   () => setNetMode("dhcp"));
netBtnStatic.addEventListener("click", () => setNetMode("static"));

// Load when tab opens
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (/** @type {HTMLElement} */ (btn).dataset.tab === "rede") loadNetworkConfig();
  });
});

// Open modal
btnNetApply.addEventListener("click", () => {
  const dns = [netDns1.value.trim(), netDns2.value.trim()].filter(Boolean);
  const rows = netMode === "dhcp"
    ? [["Modo", "DHCP automático"]]
    : [
        ["Modo",      "IP fixo"],
        ["IP / Máscara", `${netIp.value.trim()}/${netPrefix.value}`],
        ["Gateway",   netGateway.value.trim()],
        ["DNS",       dns.join(", ") || "—"],
      ];

  netModalTable.innerHTML = rows
    .map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`)
    .join("");

  netModalAck.checked = false;
  btnNetConfirm.disabled = true;
  netModalStatus.textContent = "";
  netModalBackdrop.classList.remove("hidden");
});

netModalAck.addEventListener("change", () => {
  btnNetConfirm.disabled = !netModalAck.checked;
});

btnNetCancel.addEventListener("click", () => {
  netModalBackdrop.classList.add("hidden");
});

btnNetConfirm.addEventListener("click", async () => {
  btnNetConfirm.disabled = true;
  btnNetCancel.disabled  = true;
  netModalStatus.style.color = "var(--text-muted)";
  netModalStatus.textContent = "Aplicando…";

  const dns = [netDns1.value.trim(), netDns2.value.trim()].filter(Boolean);
  const body = {
    connection: netCurrent?.connection ?? "Wired connection 1",
    mode:       netMode,
    ip:         netIp.value.trim(),
    prefix:     Number(netPrefix.value),
    gateway:    netGateway.value.trim(),
    dns,
  };

  try {
    const res = await fetch("/api/network", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    if (res.ok) {
      netModalStatus.style.color = "var(--ok)";
      netModalStatus.textContent = "Configuração aplicada com sucesso.";
      setTimeout(() => {
        netModalBackdrop.classList.add("hidden");
        loadNetworkConfig();
      }, 1800);
    } else {
      netModalStatus.style.color = "var(--off)";
      netModalStatus.textContent = `Erro: ${data.error ?? res.status}`;
      btnNetConfirm.disabled = false;
      btnNetCancel.disabled  = false;
    }
  } catch (e) {
    netModalStatus.style.color = "var(--off)";
    netModalStatus.textContent = `Falha de rede: ${e instanceof Error ? e.message : String(e)}`;
    btnNetConfirm.disabled = false;
    btnNetCancel.disabled  = false;
  }
});

// ── Connect ───────────────────────────────────────────────────────────────────

connect();
