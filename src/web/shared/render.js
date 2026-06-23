// @ts-check

// ── Critical strip ─────────────────────────────────────────────────────────────

/** @param {HTMLElement} container @param {any} telemetry */
export function renderCriticalStrip(container, telemetry) {
  const loc = telemetry.location;
  const wx  = telemetry.weather;
  const net = telemetry.internet;

  container.replaceChildren();

  // Location card
  container.appendChild(makeInfoCard({
    label: "Localização",
    main:  loc ? loc.city : "—",
    sub:   loc ? loc.region : "sem dados",
    icon:  "📍",
  }));

  // Weather card
  if (wx) {
    const rainTag = document.createElement("span");
    rainTag.className = "rain-tag " + (wx.raining ? "rain-now" : wx.rainChancePct > 40 ? "rain-alert" : "");
    rainTag.textContent = wx.raining
      ? "Chuva agora"
      : wx.rainChancePct > 0
        ? `${wx.rainChancePct}% chance`
        : "Sem chuva";

    container.appendChild(makeInfoCard({
      label: "Clima",
      main:  `${wx.tempC.toFixed(1)}°C`,
      sub:   wx.condition,
      icon:  "🌤",
      extra: rainTag,
    }));
  } else {
    container.appendChild(makeInfoCard({ label: "Clima", main: "—", sub: "sem dados", icon: "🌤" }));
  }

  // Rain forecast card (reuse weather data)
  if (wx) {
    const tag = document.createElement("span");
    tag.className = "rain-tag " + (wx.raining ? "rain-now" : wx.rainChancePct > 40 ? "rain-alert" : "");
    tag.textContent = wx.raining ? "Chovendo" : "Previsão OK";
    container.appendChild(makeInfoCard({
      label: "Previsão",
      main:  wx.raining ? "Chuva" : "Sem chuva",
      sub:   `${wx.rainChancePct}% nas prox. horas`,
      icon:  wx.raining ? "🌧" : "☀️",
      extra: tag,
    }));
  } else {
    container.appendChild(makeInfoCard({ label: "Previsão", main: "—", sub: "sem dados", icon: "🌧" }));
  }

  // Internet card
  const led = document.createElement("span");
  led.className = "internet-led" + (net.online ? "" : " offline");

  let uptime = "";
  if (net.online && net.onlineSinceMs) {
    const mins = Math.floor((Date.now() - net.onlineSinceMs) / 60000);
    uptime = mins < 60 ? `${mins}min online` : `${Math.floor(mins / 60)}h online`;
  } else if (!net.online && net.lastDownAtMs) {
    const mins = Math.floor((Date.now() - net.lastDownAtMs) / 60000);
    uptime = `Caiu há ${mins}min`;
  }

  container.appendChild(makeInfoCard({
    label: "Internet",
    main:  net.online ? "Online" : "Offline",
    sub:   uptime || "—",
    icon:  net.online ? "🌐" : "❌",
    extra: led,
  }));
}

/**
 * @param {{ label: string, main: string, sub: string, icon: string, extra?: HTMLElement }} opts
 */
function makeInfoCard({ label, main, sub, icon, extra }) {
  const card = document.createElement("div");
  card.className = "info-card";

  const left = document.createElement("div");
  const l = document.createElement("span");
  l.className = "info-label"; l.textContent = label;
  const m = document.createElement("span");
  m.className = "info-main"; m.textContent = main;
  const s = document.createElement("span");
  s.className = "info-sub"; s.textContent = sub;
  left.appendChild(l); left.appendChild(m); left.appendChild(s);

  const right = document.createElement("div");
  right.style.display = "flex"; right.style.flexDirection = "column";
  right.style.alignItems = "center"; right.style.gap = "6px";
  const ico = document.createElement("span");
  ico.className = "info-icon"; ico.textContent = icon;
  right.appendChild(ico);
  if (extra) right.appendChild(extra);

  card.appendChild(left); card.appendChild(right);
  return card;
}

// ── Memo banner ────────────────────────────────────────────────────────────────

/** @param {HTMLElement} el @param {string} memo */
export function renderMemoBanner(el, memo) {
  el.textContent = memo;
  el.classList.toggle("hidden", memo.trim() === "");
}

// ── Legend ─────────────────────────────────────────────────────────────────────

const LEGEND_ITEMS = [
  { cls: "ok",         label: "OK" },
  { cls: "standby",    label: "STANDBY" },
  { cls: "atencao",    label: "ATENÇÃO" },
  { cls: "off",        label: "OFF" },
  { cls: "manutencao", label: "MANUTENÇÃO" },
];

/** @param {HTMLElement} el */
export function renderLegend(el) {
  el.replaceChildren();
  for (const { cls, label } of LEGEND_ITEMS) {
    const item = document.createElement("span");
    item.className = "legend-item";
    const dot = document.createElement("span");
    dot.className = `legend-dot ${cls}`;
    const txt = document.createTextNode(label);
    item.appendChild(dot); item.appendChild(txt);
    el.appendChild(item);
  }
}

// ── Status display helpers ─────────────────────────────────────────────────────

export const STATUS_LABEL = {
  ok:         "OK",
  standby:    "STANDBY",
  atencao:    "ATENÇÃO",
  off:        "OFF",
  manutencao: "MANUTENÇÃO",
};

/** @param {string} status @returns {HTMLElement} */
export function makeStatusBadge(status) {
  const el = document.createElement("div");
  el.className = `status-badge ${status}`;
  el.textContent = STATUS_LABEL[status] ?? status.toUpperCase();
  return el;
}
