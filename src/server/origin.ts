import type { IncomingMessage } from "node:http";

/**
 * Cross-site guard for state-changing requests (WS connect, upload, delete).
 * Browsers always send Origin on WebSocket handshakes and cross-site POSTs, so
 * a page on another site (opened by an operator on the LAN) can't drive the
 * on-air display. Requests without Origin come from non-browser tools (curl,
 * Companion) and are allowed — the service is LAN-only by design.
 */
export function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  const host = req.headers.host;
  if (!host) return false;
  try {
    return new URL(origin).host === host.toLowerCase();
  } catch {
    return false;
  }
}
