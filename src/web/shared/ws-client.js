// @ts-check

/**
 * Shapes below mirror StateSchema in src/shared/types.ts (the server is the
 * source of truth; this browser module can't import the .ts). Keep in sync.
 * @typedef {{ frame:string, model:string, source:string, description:string, note:string, status:string }} Row
 * @typedef {Record<"frame"|"model"|"source"|"description"|"note"|"status", string>} Columns
 * @typedef {{ src:string, x:number, y:number, width:number, visible:boolean }} ImageConfig
 * @typedef {{ visible:boolean, scale:number, x:number, y:number, mode?:"clock"|"stopwatch" }} ClockConfig
 * @typedef {{ rows: Row[], columns?: Columns, image?: ImageConfig, memo?: string, clock?: ClockConfig }} AppState
 */
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

/**
 * Minimal shape guard for messages coming off the socket. The server is
 * trusted, but a malformed frame shouldn't be able to push undefined into the
 * render callbacks and blow up the page.
 * @param {any} m
 * @returns {m is { type: "state", state: AppState } | { type: "telemetry", telemetry: any } | { type: "filesChanged" }}
 */
function isServerMessage(m) {
  if (typeof m !== "object" || m === null || typeof m.type !== "string") return false;
  if (m.type === "state")        return typeof m.state === "object" && m.state !== null && Array.isArray(m.state.rows);
  if (m.type === "telemetry")    return "telemetry" in m;
  if (m.type === "filesChanged") return true;
  return false;
}

export function connect() {
  ws = new WebSocket(`ws://${location.host}`);

  ws.addEventListener("open", () => {
    setConnected(true);
    retryDelay = 1000;
  });

  ws.addEventListener("message", (ev) => {
    let msg;
    try {
      msg = JSON.parse(ev.data);
    } catch {
      return; // ignore malformed JSON
    }
    if (!isServerMessage(msg)) {
      console.warn("ws: ignored server message with unexpected shape");
      return;
    }
    if (msg.type === "state" && onStateCb) onStateCb(msg.state);
    else if (msg.type === "telemetry" && onTelemetryCb) onTelemetryCb(msg.telemetry);
    else if (msg.type === "filesChanged" && onFilesChangedCb) onFilesChangedCb();
  });

  ws.addEventListener("close", () => {
    setConnected(false);
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 16000);
  });

  ws.addEventListener("error", () => ws?.close());
}
