import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { loadState } from "./state.js";
import { parseClientMessage, applyMessage, sendState, broadcast } from "./protocol.js";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_DIR = join(process.cwd(), "src", "web");

function serveStatic(urlPath: string): { body: Buffer; mime: string } | null {
  const routes: Record<string, string> = {
    "/": join(WEB_DIR, "output", "index.html"),
    "/output": join(WEB_DIR, "output", "index.html"),
    "/output/": join(WEB_DIR, "output", "index.html"),
    "/output/output.js": join(WEB_DIR, "output", "output.js"),
    "/output/output.css": join(WEB_DIR, "output", "output.css"),
    "/control": join(WEB_DIR, "control", "index.html"),
    "/control/": join(WEB_DIR, "control", "index.html"),
    "/control/control.js": join(WEB_DIR, "control", "control.js"),
    "/control/control.css": join(WEB_DIR, "control", "control.css"),
  };

  const filePath = routes[urlPath];
  if (!filePath) return null;

  try {
    const body = readFileSync(filePath);
    const ext = filePath.split(".").pop() ?? "";
    const mimes: Record<string, string> = {
      html: "text/html; charset=utf-8",
      js: "application/javascript",
      css: "text/css",
    };
    return { body, mime: mimes[ext] ?? "application/octet-stream" };
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
  console.log({ operation: "listening", port: PORT, control: `http://localhost:${PORT}/control`, output: `http://localhost:${PORT}/output` });
});
