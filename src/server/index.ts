import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { loadState } from "./state.js";
import { parseClientMessage, applyMessage, sendState, broadcast } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_DIR = join(process.cwd(), "src", "web");

const ROUTES: Record<string, { file: string; mime: string }> = {
  "/":        { file: "index.html", mime: "text/html; charset=utf-8" },
  "/app.css": { file: "app.css",    mime: "text/css" },
  "/app.js":  { file: "app.js",     mime: "application/javascript" },
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
  res.writeHead(200, { "Content-Type": file.mime });
  res.end(file.body);
});

const wss = new WebSocketServer({ server: httpServer });
const clients = new Set<WebSocket>();

wss.on("connection", (ws) => {
  clients.add(ws);
  sendState(ws, loadState());

  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      console.warn({ operation: "ws.message", msg: "invalid message, ignored" });
      return;
    }
    const next = applyMessage(msg);
    broadcast(clients, next);
  });

  ws.on("close", () => clients.delete(ws));
});

httpServer.listen(PORT, "0.0.0.0", () => {
  console.log({ operation: "listening", port: PORT, url: `http://localhost:${PORT}` });
});
