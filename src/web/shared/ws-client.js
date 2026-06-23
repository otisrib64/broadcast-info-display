// @ts-check

/** @typedef {{ rows: any[], columns?: any, image?: any, memo?: string, clock?: any }} AppState */
/** @typedef {(state: AppState) => void} StateHandler */
/** @typedef {(telemetry: any) => void} TelemetryHandler */
/** @typedef {() => void} FilesChangedHandler */

/** @type {WebSocket | null} */
let ws = null;
let retryDelay = 1000;

/** @type {StateHandler | null} */
let onStateCb = null;
/** @type {TelemetryHandler | null} */
let onTelemetryCb = null;
/** @type {FilesChangedHandler | null} */
let onFilesChangedCb = null;

/** @param {StateHandler} fn */
export function onState(fn) { onStateCb = fn; }

/** @param {TelemetryHandler} fn */
export function onTelemetry(fn) { onTelemetryCb = fn; }

/** @param {FilesChangedHandler} fn */
export function onFilesChanged(fn) { onFilesChangedCb = fn; }

/** @param {object} msg */
export function send(msg) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

/** @type {HTMLElement | null} */
let connDotEl = null;

/** @param {HTMLElement} el */
export function setConnIndicator(el) { connDotEl = el; }

function setConnected(online) {
  if (!connDotEl) return;
  connDotEl.textContent = online ? "● ONLINE" : "● OFFLINE";
  connDotEl.className = online ? "conn-badge online" : "conn-badge offline";
}

export function connect() {
  ws = new WebSocket(`ws://${location.host}`);

  ws.addEventListener("open", () => {
    setConnected(true);
    retryDelay = 1000;
  });

  ws.addEventListener("message", (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "state" && onStateCb) onStateCb(msg.state);
      else if (msg.type === "telemetry" && onTelemetryCb) onTelemetryCb(msg.telemetry);
      else if (msg.type === "filesChanged" && onFilesChangedCb) onFilesChangedCb();
    } catch { /* ignore malformed */ }
  });

  ws.addEventListener("close", () => {
    setConnected(false);
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 16000);
  });

  ws.addEventListener("error", () => ws?.close());
}
