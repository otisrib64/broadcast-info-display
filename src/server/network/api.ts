import type { IncomingMessage, ServerResponse } from "node:http";
import { readNetworkConfig, applyNetworkConfig, validateNetworkInput } from "./config.js";

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(payload);
}

// GET /api/network → current config
export function handleGetNetwork(res: ServerResponse): void {
  try {
    json(res, 200, readNetworkConfig());
  } catch (err) {
    json(res, 500, { error: String(err instanceof Error ? err.message : err) });
  }
}

// POST /api/network → apply config
export async function handleApplyNetwork(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body = "";
  for await (const chunk of req) body += chunk;

  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    json(res, 400, { error: "invalid_json" });
    return;
  }

  if (typeof input !== "object" || input === null) {
    json(res, 400, { error: "invalid_body" });
    return;
  }

  const raw = input as Record<string, unknown>;
  const payload = {
    connection: String(raw["connection"] ?? ""),
    mode:       (raw["mode"] === "static" ? "static" : "dhcp") as "static" | "dhcp",
    ip:         String(raw["ip"]      ?? ""),
    prefix:     Number(raw["prefix"]  ?? 24),
    gateway:    String(raw["gateway"] ?? ""),
    dns:        (Array.isArray(raw["dns"]) ? raw["dns"] : []).map(String),
  };

  const err = validateNetworkInput(payload);
  if (err) { json(res, 400, { error: err }); return; }

  try {
    applyNetworkConfig(payload);
    json(res, 200, { ok: true });
  } catch (e) {
    json(res, 500, { error: e instanceof Error ? e.message : String(e) });
  }
}
