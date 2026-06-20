// @ts-check
const tbody = /** @type {HTMLTableSectionElement} */ (document.getElementById("table-body"));
const connStatus = /** @type {HTMLElement} */ (document.getElementById("connection-status"));
const btnAdd = /** @type {HTMLButtonElement} */ (document.getElementById("btn-add"));

/** @type {{ id: string, frame: string, source: string, description: string, note: string, status: string }[]} */
let rows = [];
let ws = /** @type {WebSocket | null} */ (null);
let retryDelay = 1000;

const STATUSES = ["live", "standby", "off"];
const FIELDS = /** @type {const} */ (["frame", "source", "description", "note"]);

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
  return input;
}

/** @param {string} id @param {string} current */
function makeSelect(id, current) {
  const select = document.createElement("select");
  select.dataset.field = "status";
  select.dataset.id = id;
  select.className = `status-${current}`;
  for (const s of STATUSES) {
    const opt = document.createElement("option");
    opt.value = s;
    opt.textContent = s;
    if (s === current) opt.selected = true;
    select.appendChild(opt);
  }
  return select;
}

/** @param {string} id */
function makeRemoveButton(id) {
  const btn = document.createElement("button");
  btn.className = "danger";
  btn.textContent = "✕";
  btn.dataset.action = "remove";
  btn.dataset.id = id;
  return btn;
}

function render() {
  tbody.replaceChildren(
    ...rows.map((row) => {
      const tr = document.createElement("tr");
      tr.dataset.id = row.id;

      for (const field of FIELDS) {
        const td = document.createElement("td");
        td.appendChild(makeInput(field, row.id, row[field]));
        tr.appendChild(td);
      }

      const tdStatus = document.createElement("td");
      tdStatus.appendChild(makeSelect(row.id, row.status));
      tr.appendChild(tdStatus);

      const tdAction = document.createElement("td");
      tdAction.appendChild(makeRemoveButton(row.id));
      tr.appendChild(tdAction);

      return tr;
    })
  );
}

function sendState() {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "setState", state: { rows } }));
  }
}

tbody.addEventListener("input", (ev) => {
  const target = /** @type {HTMLInputElement | null} */ (ev.target);
  if (!target?.dataset.id || !target.dataset.field) return;
  const { id, field } = target.dataset;
  rows = rows.map((r) => r.id === id ? { ...r, [field]: target.value } : r);
  sendState();
});

tbody.addEventListener("change", (ev) => {
  const target = /** @type {HTMLSelectElement | null} */ (ev.target);
  if (target?.dataset.field !== "status") return;
  const { id } = target.dataset;
  rows = rows.map((r) => r.id === id ? { ...r, status: target.value } : r);
  target.className = `status-${target.value}`;
  sendState();
});

tbody.addEventListener("click", (ev) => {
  const btn = /** @type {HTMLElement | null} */ (ev.target);
  if (btn?.dataset.action !== "remove") return;
  const { id } = btn.dataset;
  rows = rows.filter((r) => r.id !== id);
  render();
  sendState();
});

btnAdd.addEventListener("click", () => {
  rows = [...rows, { id: generateId(), frame: "", source: "", description: "", note: "", status: "standby" }];
  render();
  sendState();
});

function connect() {
  ws = new WebSocket(`ws://${location.host}`);

  ws.addEventListener("open", () => {
    connStatus.textContent = "Conectado";
    connStatus.className = "status-connected";
    retryDelay = 1000;
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") {
        rows = msg.state.rows;
        render();
      }
    } catch { /* ignore */ }
  });

  ws.addEventListener("close", () => {
    connStatus.textContent = "Desconectado";
    connStatus.className = "status-disconnected";
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 16000);
  });

  ws.addEventListener("error", () => ws?.close());
}

connect();
