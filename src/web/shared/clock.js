// @ts-check

/** @type {HTMLElement | null} */
let headerClockEl = null;
/** @type {HTMLElement | null} */
let bigClockEl = null;
/** @type {HTMLElement | null} */
let bigClockTimeEl = null;
/** @type {HTMLElement | null} */
let bigClockDateEl = null;
/** @type {HTMLElement | null} */
let bigClockHeadEl = null;
/** @type {HTMLElement | null} */
let swDisplayEl = null;

/** @param {HTMLElement} el */
export function setHeaderClock(el) { headerClockEl = el; }

/** @param {{ clock: HTMLElement, time: HTMLElement, date: HTMLElement, head: HTMLElement | null }} els */
export function setBigClockElements(els) {
  bigClockEl = els.clock;
  bigClockTimeEl = els.time;
  bigClockDateEl = els.date;
  bigClockHeadEl = els.head;
}

/** @param {HTMLElement} el — optional panel display inside control's Relógio tab */
export function setSwDisplayEl(el) { swDisplayEl = el; }

// ── Stopwatch state ──────────────────────────────────────────────────────────

/** @type {"clock" | "stopwatch"} */
let clockMode = "clock";
let swRunning = false;
/** @type {number | null} */
let swStartedAtMs = null;
let swAccumulatedMs = 0;

// ── Helpers ──────────────────────────────────────────────────────────────────

function now() { return new Date(); }

function pad(n) { return String(n).padStart(2, "0"); }

function formatTime(d) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDate(d) {
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}

function formatHeaderClock(d) {
  const date = d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" });
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  return `${date}  ${time}`;
}

/** @param {number} ms */
export function formatElapsed(ms) {
  const totalS = Math.floor(ms / 1000);
  const tenths = Math.floor((ms % 1000) / 100);
  const s = totalS % 60;
  const m = Math.floor(totalS / 60) % 60;
  const h = Math.floor(totalS / 3600);
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}.${tenths}`;
}

// ── Tick ──────────────────────────────────────────────────────────────────────

export function tick() {
  const d = now();
  if (headerClockEl) headerClockEl.textContent = formatHeaderClock(d);

  if (clockMode === "stopwatch") {
    const elapsed = swAccumulatedMs + (swRunning && swStartedAtMs !== null ? Date.now() - swStartedAtMs : 0);
    const formatted = formatElapsed(elapsed);
    if (bigClockTimeEl) bigClockTimeEl.textContent = formatted;
    if (bigClockDateEl) bigClockDateEl.textContent = "CRONÔMETRO";
    if (swDisplayEl) swDisplayEl.textContent = formatted;
  } else {
    if (bigClockTimeEl) bigClockTimeEl.textContent = formatTime(d);
    if (bigClockDateEl) bigClockDateEl.textContent = formatDate(d);
    if (swDisplayEl) swDisplayEl.textContent = "—";
  }
}

export function startClock() {
  tick();
  setInterval(tick, 100);
}

/** @param {{ visible: boolean, scale: number, x: number, y: number, mode?: "clock"|"stopwatch", stopwatch?: { running: boolean, startedAtMs: number|null, accumulatedMs: number } }} cfg */
export function applyClockConfig(cfg) {
  if (!bigClockEl) return;
  bigClockEl.classList.toggle("visible", cfg.visible);
  bigClockEl.style.setProperty("--clock-scale", String(cfg.scale));
  bigClockEl.style.left = cfg.x + "px";
  bigClockEl.style.top  = cfg.y + "px";
  bigClockEl.style.right = "auto";

  clockMode = cfg.mode ?? "clock";
  if (cfg.stopwatch) {
    swRunning       = cfg.stopwatch.running;
    swStartedAtMs   = cfg.stopwatch.startedAtMs;
    swAccumulatedMs = cfg.stopwatch.accumulatedMs;
  } else {
    swRunning = false; swStartedAtMs = null; swAccumulatedMs = 0;
  }
}

// ── Drag support (control page header has drag handle; output doesn't) ─────────

let dragging = false;
let dragOffX = 0;
let dragOffY = 0;
/** @type {{ x: number, y: number }} */
let clockPos = { x: 0, y: 0 };
/** @type {((pos: { x: number, y: number }) => void) | null} */
let onDragEnd = null;

/** @param {(pos: { x: number, y: number }) => void} fn */
export function setOnClockDragEnd(fn) { onDragEnd = fn; }

export function enableClockDrag() {
  if (!bigClockEl || !bigClockHeadEl) return;

  bigClockHeadEl.addEventListener("mousedown", (ev) => {
    if (!bigClockEl) return;
    dragging = true;
    const rect = bigClockEl.getBoundingClientRect();
    clockPos = { x: rect.left, y: rect.top };
    dragOffX = ev.clientX - rect.left;
    dragOffY = ev.clientY - rect.top;
    ev.preventDefault();
  });

  document.addEventListener("mousemove", (ev) => {
    if (!dragging || !bigClockEl) return;
    clockPos = { x: ev.clientX - dragOffX, y: ev.clientY - dragOffY };
    bigClockEl.style.left  = clockPos.x + "px";
    bigClockEl.style.top   = clockPos.y + "px";
    bigClockEl.style.right = "auto";
  });

  document.addEventListener("mouseup", () => {
    if (!dragging) return;
    dragging = false;
    if (onDragEnd) onDragEnd(clockPos);
  });
}
