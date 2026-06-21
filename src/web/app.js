// @ts-check
const tbody       = /** @type {HTMLTableSectionElement} */ (document.getElementById("tbody"));
const connDot     = /** @type {HTMLElement} */ (document.getElementById("conn-indicator"));
const btnAdd      = /** @type {HTMLButtonElement} */ (document.getElementById("btn-add"));
const clock       = /** @type {HTMLElement} */ (document.getElementById("clock"));
const btnImgToggle  = /** @type {HTMLButtonElement} */ (document.getElementById("btn-img-toggle"));
const btnMemoToggle = /** @type {HTMLButtonElement} */ (document.getElementById("btn-memo-toggle"));
const memoPanel     = /** @type {HTMLElement} */ (document.getElementById("memo-panel"));
const memoText      = /** @type {HTMLTextAreaElement} */ (document.getElementById("memo-text"));
const imgPanel    = /** @type {HTMLElement} */ (document.getElementById("img-panel"));
const imgFile     = /** @type {HTMLInputElement} */ (document.getElementById("img-file"));
const imgWidthIn  = /** @type {HTMLInputElement} */ (document.getElementById("img-width"));
const imgWidthVal = /** @type {HTMLElement} */ (document.getElementById("img-width-val"));
const imgXIn      = /** @type {HTMLInputElement} */ (document.getElementById("img-x"));
const imgXVal     = /** @type {HTMLElement} */ (document.getElementById("img-x-val"));
const imgYIn      = /** @type {HTMLInputElement} */ (document.getElementById("img-y"));
const imgYVal     = /** @type {HTMLElement} */ (document.getElementById("img-y-val"));
const imgVisible  = /** @type {HTMLInputElement} */ (document.getElementById("img-visible"));
const btnImgRemove = /** @type {HTMLButtonElement} */ (document.getElementById("btn-img-remove"));
const overlayImg  = /** @type {HTMLImageElement} */ (document.getElementById("overlay-img"));

// ── State ─────────────────────────────────────────────────────────────────────

/** @type {{ id: string, frame: string, model: string, source: string, description: string, note: string, status: string }[]} */
let rows = [];
/** @type {{ src: string, x: number, y: number, width: number, visible: boolean } | undefined} */
let image;
/** @type {string} */
let memo = "";
let ws = /** @type {WebSocket | null} */ (null);
let retryDelay = 1000;

const STATUSES = ["ok", "standby", "atencao", "off"];
const STATUS_LABEL = { ok: "OK", standby: "STANDBY", atencao: "ATENÇÃO", off: "OFF" };
const TEXT_FIELDS = /** @type {const} */ (["frame", "model", "source", "description", "note"]);
const FIELD_DATALIST = { frame: "dl-frame", model: "dl-model", source: "dl-source", note: "dl-note" };

// ── Clock ─────────────────────────────────────────────────────────────────────

function tickClock() {
  const now = new Date();
  const date = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  clock.textContent = `${date}  ${time}`;
}
tickClock();
setInterval(tickClock, 1000);

// ── Table render ──────────────────────────────────────────────────────────────

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
        td.appendChild(makeInput(field, row.id, row[field]));
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

// ── Image overlay render ───────────────────────────────────────────────────────

function renderImage() {
  if (!image || !image.src) {
    overlayImg.classList.add("hidden");
    return;
  }
  overlayImg.src = image.src;
  overlayImg.style.left  = `${image.x}px`;
  overlayImg.style.top   = `${image.y}px`;
  overlayImg.style.width = `${image.width}px`;
  overlayImg.classList.toggle("hidden", !image.visible);

  // sync sliders without firing events
  imgWidthIn.value = String(image.width); imgWidthVal.textContent = String(image.width);
  imgXIn.value     = String(image.x);     imgXVal.textContent     = String(image.x);
  imgYIn.value     = String(image.y);     imgYVal.textContent     = String(image.y);
  imgVisible.checked = image.visible;
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function sendState() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "setState", state: { rows, image, memo } }));
  }
}

function connect() {
  ws = new WebSocket(`ws://${location.host}`);

  ws.addEventListener("open", () => {
    connDot.textContent = "● ONLINE";
    connDot.className = "conn-badge online";
    retryDelay = 1000;
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        rows  = msg.state.rows;
        image = msg.state.image;
        memo  = msg.state.memo ?? "";
        renderTable();
        renderImage();
        if (document.activeElement !== memoText) memoText.value = memo;
      }
    } catch { /* ignore */ }
  });

  ws.addEventListener("close", () => {
    connDot.textContent = "● OFFLINE";
    connDot.className = "conn-badge offline";
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 16000);
  });

  ws.addEventListener("error", () => ws?.close());
}

// ── Table events ──────────────────────────────────────────────────────────────

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
  sendState();
});

btnAdd.addEventListener("click", () => {
  const nextFrame = `Frame ${rows.length + 1}`;
  rows = [...rows, { id: generateId(), frame: nextFrame, model: "", source: "", description: "", note: "", status: "standby" }];
  renderTable();
  sendState();
});

// ── Panel toggles ─────────────────────────────────────────────────────────────

btnImgToggle.addEventListener("click", () => {
  imgPanel.classList.toggle("hidden");
});

btnMemoToggle.addEventListener("click", () => {
  memoPanel.classList.toggle("hidden");
  if (!memoPanel.classList.contains("hidden")) memoText.focus();
});

memoText.addEventListener("input", () => {
  memo = memoText.value;
  sendState();
});

// ── Image file upload ─────────────────────────────────────────────────────────

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

// ── Image sliders ─────────────────────────────────────────────────────────────

imgWidthIn.addEventListener("input", () => {
  const w = Number(imgWidthIn.value);
  imgWidthVal.textContent = String(w);
  if (!image) return;
  image = { ...image, width: w };
  renderImage();
  sendState();
});

imgXIn.addEventListener("input", () => {
  const x = Number(imgXIn.value);
  imgXVal.textContent = String(x);
  if (!image) return;
  image = { ...image, x };
  renderImage();
  sendState();
});

imgYIn.addEventListener("input", () => {
  const y = Number(imgYIn.value);
  imgYVal.textContent = String(y);
  if (!image) return;
  image = { ...image, y };
  renderImage();
  sendState();
});

imgVisible.addEventListener("change", () => {
  if (!image) return;
  image = { ...image, visible: imgVisible.checked };
  renderImage();
  sendState();
});

btnImgRemove.addEventListener("click", () => {
  image = undefined;
  overlayImg.classList.add("hidden");
  overlayImg.src = "";
  imgFile.value = "";
  sendState();
});

// ── Image drag ────────────────────────────────────────────────────────────────

let dragging = false;
let dragOffX = 0;
let dragOffY = 0;

overlayImg.addEventListener("mousedown", (ev) => {
  dragging = true;
  dragOffX = ev.clientX - (image?.x ?? 0);
  dragOffY = ev.clientY - (image?.y ?? 0);
  ev.preventDefault();
});

document.addEventListener("mousemove", (ev) => {
  if (!dragging || !image) return;
  image = { ...image, x: ev.clientX - dragOffX, y: ev.clientY - dragOffY };
  overlayImg.style.left = `${image.x}px`;
  overlayImg.style.top  = `${image.y}px`;
  imgXIn.value = String(Math.round(image.x)); imgXVal.textContent = imgXIn.value;
  imgYIn.value = String(Math.round(image.y)); imgYVal.textContent = imgYIn.value;
});

document.addEventListener("mouseup", () => {
  if (!dragging) return;
  dragging = false;
  sendState();
});

// ── Init ──────────────────────────────────────────────────────────────────────

connect();
