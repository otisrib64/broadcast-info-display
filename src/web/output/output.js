// @ts-check
const tbody = /** @type {HTMLTableSectionElement} */ (document.getElementById("table-body"));
const indicator = /** @type {HTMLElement} */ (document.getElementById("connection-indicator"));

const STATUS_CLASS = { live: "status-live", standby: "status-standby", off: "status-off" };
const STATUS_LABEL = { live: "LIVE", standby: "STANDBY", off: "OFF" };

/**
 * @param {{ id: string, frame: string, source: string, description: string, note: string, status: string }[]} rows
 */
function render(rows) {
  tbody.replaceChildren(
    ...rows.map((r) => {
      const tr = document.createElement("tr");
      const cells = [r.frame, r.source, r.description, r.note];
      for (const text of cells) {
        const td = document.createElement("td");
        td.textContent = text;
        tr.appendChild(td);
      }
      const tdStatus = document.createElement("td");
      const badge = document.createElement("span");
      badge.className = "status-badge " + (STATUS_CLASS[r.status] ?? "status-off");
      badge.textContent = STATUS_LABEL[r.status] ?? r.status.toUpperCase();
      tdStatus.appendChild(badge);
      tr.appendChild(tdStatus);
      return tr;
    })
  );
}

let retryDelay = 1000;

function connect() {
  const ws = new WebSocket(`ws://${location.host}`);

  ws.addEventListener("open", () => {
    indicator.className = "indicator connected";
    retryDelay = 1000;
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state") render(msg.state.rows);
    } catch { /* ignore malformed */ }
  });

  ws.addEventListener("close", () => {
    indicator.className = "indicator disconnected";
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 16000);
  });

  ws.addEventListener("error", () => ws.close());
}

connect();
