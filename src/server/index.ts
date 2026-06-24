import { createServer } from "node:http";
import { join } from "node:path";
import { WebSocketServer, type WebSocket } from "ws";
import { loadState } from "./state.js";
import { parseClientMessage, applyMessage, sendState, broadcast } from "./protocol.js";
import { resolveStatic } from "./static.js";
import { startTelemetry, sendTelemetryTo } from "./telemetry/index.js";
import { handleList, handleUpload, handleDownload, handleDelete } from "./files/api.js";
import { handleGetNetwork, handleApplyNetwork } from "./network/api.js";
import type { ServerMessage } from "../shared/types.js";

const PORT = Number(process.env.PORT ?? 8080);
const WEB_DIR = join(process.cwd(), "src", "web");

function serveFile(
  res: import("node:http").ServerResponse,
  webDir: string,
  path: string,
): boolean {
  const file = resolveStatic(webDir, path);
  if (!file) return false;
  res.writeHead(200, { "Content-Type": file.mime, "Cache-Control": "no-store" });
  res.end(file.body);
  return true;
}

const state = loadState();
console.log({ operation: "startup", rows: state.rows.length, port: PORT });

function broadcastFilesChanged(): void {
  const payload = JSON.stringify({ type: "filesChanged" } satisfies ServerMessage);
  for (const ws of clients) {
    if (ws.readyState === 1) ws.send(payload);
  }
}

const httpServer = createServer((req, res) => {
  const urlPath = req.url?.split("?")[0] ?? "/";
  const method  = req.method ?? "GET";

  // ── Network API ────────────────────────────────────────────────────────────
  if (urlPath === "/api/network" && method === "GET") {
    handleGetNetwork(res);
    return;
  }
  if (urlPath === "/api/network" && method === "POST") {
    handleApplyNetwork(req, res).catch((err) => {
      console.error({ operation: "network.apply", error: err instanceof Error ? err.message : String(err) });
    });
    return;
  }

  // ── Mini Cloud API ──────────────────────────────────────────────────────────
  if (urlPath === "/api/files" && method === "GET") {
    handleList(res);
    return;
  }
  if (urlPath === "/api/files" && method === "POST") {
    handleUpload(req, res, broadcastFilesChanged).catch((err) => {
      console.error({ operation: "upload", error: err instanceof Error ? err.message : String(err) });
    });
    return;
  }
  const fileMatch = urlPath.match(/^\/api\/files\/([^/]+)$/);
  const fileId    = fileMatch?.[1];
  if (fileId) {
    if (method === "GET")    { handleDownload(res, fileId); return; }
    if (method === "DELETE") { handleDelete(res, fileId, broadcastFilesChanged); return; }
  }

  // Redirect root to /control
  if (urlPath === "/") {
    res.writeHead(302, { Location: "/control" });
    res.end();
    return;
  }

  // Route: /control → control/index.html
  if (urlPath === "/control") {
    if (serveFile(res, WEB_DIR, "control/index.html")) return;
  }

  // Route: /output → output/index.html
  if (urlPath === "/output") {
    if (serveFile(res, WEB_DIR, "output/index.html")) return;
  }

  // Static assets under /shared/, /control/, /output/
  if (
    urlPath.startsWith("/shared/") ||
    urlPath.startsWith("/control/") ||
    urlPath.startsWith("/output/")
  ) {
    // Strip leading slash for resolveStatic
    const rel = urlPath.slice(1);
    if (serveFile(res, WEB_DIR, rel)) return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const wss = new WebSocketServer({ server: httpServer });
export const clients = new Set<WebSocket>();

// Start telemetry loop — intervals run server-side; never touches state.json
startTelemetry(clients);

wss.on("connection", (ws, req) => {
  clients.add(ws);
  console.log({ operation: "ws.connect", clients: clients.size, ip: req.socket.remoteAddress });
  sendState(ws, loadState());
  sendTelemetryTo(ws);

  ws.on("message", (data) => {
    const msg = parseClientMessage(data.toString());
    if (!msg) {
      console.warn({ operation: "ws.message", msg: "invalid message, ignored" });
      return;
    }
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
