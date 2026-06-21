import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { loadState } from "./state.js";
import { parseClientMessage, applyMessage, sendState, broadcast } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_DIR = join(process.cwd(), "src", "web");

const HTML = { file: "index.html", mime: "text/html; charset=utf-8" };

// "/", "/control" and "/output" are the same single-page app: the Pi shows it on
// HDMI, operators edit it from the LAN, and every client stays in sync over WS.
const ROUTES: Record<string, { file: string; mime: string }> = {
  "/":        HTML,
  "/control": HTML,
  "/output":  HTML,
  "/app.css": { file: "app.css", mime: "text/css" },
  "/app.js":  { file: "app.js",  mime: "application/javascript" },
};

function serveStatic(urlPath: string): { body: Buffer; mime: string } | null {
  const route = ROUTES[urlPath];
  if (!route) return null;
  try {
    return { body: readFileSync(join(WEB_DIR, route.file)), mime: route.mime };
  } catch {
    return null;
  }
}

const state = loadState();
console.log({ operation: "startup", rows: state.rows.length, port: PORT });

const httpServer = createServer((req, res) => {
  const urlPath = req.url?.split("?")[0] ?? "/";
  const file = serveStatic(urlPath);
  if (!file) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  // No caching: after a git pull + restart the kiosk must load the new UI on reboot.
  res.writeHead(200, { "Content-Type": file.mime, "Cache-Control": "no-store" });
  res.end(file.body);
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Set<WebSocket>();

wss.on("connection", (ws, req) => {
  clients.add(ws);
  console.log({ operation: "ws.connect", clients: clients.size, ip: req.socket.remoteAddress });
  sendState(ws, loadState());

  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      console.warn({ operation: "ws.message", msg: "invalid message, ignored" });
      return;
    }
    // A failed state write (e.g. data dir not writable) must not crash the whole
    // appliance and disconnect every client — log it and keep serving.
    try {
      const next = applyMessage(msg);
      broadcast(clients, next);
    } catch (err) {
      console.error({
        operation: "ws.message",
        type: msg.type,
        error: err instanceof Error ? err.message : String(err),
        hint: "state save failed — is the data dir writable by the service user (pi)?",
      });
    }
  });

  ws.on("close", () => {
    clients.delete(ws);
    console.log({ operation: "ws.disconnect", clients: clients.size });
  });
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log({ operation: "listening", port: PORT, url: `http://localhost:${PORT}` });
});
