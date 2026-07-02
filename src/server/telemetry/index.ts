import type { WebSocket } from "ws";
import type { ServerMessage, Telemetry } from "../../shared/types.js";
import { broadcastMessage } from "../protocol.js";
import { detectLocation } from "./geolocation.js";
import { fetchWeather } from "./weather.js";
import { checkInternet, getInternetStatus } from "./internet.js";

const WEATHER_INTERVAL_MS  = 10 * 60 * 1000; // 10 min
const INTERNET_INTERVAL_MS = 30 * 1000;       // 30 s

let lastTelemetry: Telemetry = {
  location: null,
  weather:  null,
  internet: { online: false, onlineSinceMs: null, lastDownAtMs: null },
};

function buildMessage(): ServerMessage {
  return { type: "telemetry", telemetry: lastTelemetry };
}

function broadcastTelemetry(clients: Set<WebSocket>): void {
  broadcastMessage(clients, buildMessage());
}

export function sendTelemetryTo(ws: WebSocket): void {
  if (ws.readyState === 1) ws.send(JSON.stringify(buildMessage()));
}

export function startTelemetry(clients: Set<WebSocket>): void {
  // Initial internet check + weather fetch on startup
  checkInternet().then((net) => {
    lastTelemetry = { ...lastTelemetry, internet: net };
    broadcastTelemetry(clients);

    detectLocation().then((loc) => {
      lastTelemetry = { ...lastTelemetry, location: loc };
      broadcastTelemetry(clients);

      if (loc) {
        fetchWeather(loc.lat, loc.lon).then((wx) => {
          lastTelemetry = { ...lastTelemetry, weather: wx };
          broadcastTelemetry(clients);
        }).catch(() => { /* degraded */ });
      }
    }).catch(() => { /* degraded */ });
  }).catch(() => { /* degraded */ });

  // Internet check every 30s
  setInterval(async () => {
    try {
      const net = await checkInternet();
      lastTelemetry = { ...lastTelemetry, internet: net };
      broadcastTelemetry(clients);
    } catch {
      lastTelemetry = { ...lastTelemetry, internet: getInternetStatus() };
    }
  }, INTERNET_INTERVAL_MS);

  // Weather refresh every 10 min
  setInterval(async () => {
    try {
      const loc = lastTelemetry.location;
      if (!loc) {
        const newLoc = await detectLocation();
        if (newLoc) lastTelemetry = { ...lastTelemetry, location: newLoc };
      }
      const l = lastTelemetry.location;
      if (l) {
        const wx = await fetchWeather(l.lat, l.lon);
        lastTelemetry = { ...lastTelemetry, weather: wx };
        broadcastTelemetry(clients);
      }
    } catch {
      /* keep last known value */
    }
  }, WEATHER_INTERVAL_MS);
}
