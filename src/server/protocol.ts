import type { WebSocket } from "ws";
import { ClientMessageSchema, MAX_ROWS, type ClientMessage, type Row, type ServerMessage, type State } from "../shared/types.js";
import { getState, saveState } from "./state.js";

/**
 * Defensive reorder: dedupes ids and re-appends rows missing from the message
 * so a malformed reorder can never duplicate or silently drop a row.
 */
export function reorderRows(rows: Row[], ids: string[]): Row[] {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const ordered = ids.flatMap((id) => {
    const row = byId.get(id);
    if (!row || seen.has(id)) return [];
    seen.add(id);
    return [row];
  });
  const missing = rows.filter((r) => !seen.has(r.id));
  return [...ordered, ...missing];
}

export function parseClientMessage(raw: string): ClientMessage | null {
  try {
    const parsed = ClientMessageSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    return parsed.data;
  } catch {
    return null;
  }
}

export function applyMessage(msg: ClientMessage): State {
  const current = getState();

  switch (msg.type) {
    case "setState": {
      saveState(msg.state);
      return msg.state;
    }
    case "upsertRow": {
      const exists = current.rows.some((r) => r.id === msg.row.id);
      // The control disables "+ Linha" at the cap; this is defense in depth so
      // an extra insert degrades to a no-op instead of a ZodError in saveState.
      if (!exists && current.rows.length >= MAX_ROWS) {
        console.warn({ operation: "upsertRow", msg: "rows_limit_reached", limit: MAX_ROWS });
        return current;
      }
      const rows = exists
        ? current.rows.map((r) => (r.id === msg.row.id ? msg.row : r))
        : [...current.rows, msg.row];
      const next = { ...current, rows };
      saveState(next);
      return next;
    }
    case "removeRow": {
      const next = { ...current, rows: current.rows.filter((r) => r.id !== msg.id) };
      saveState(next);
      return next;
    }
    case "reorder": {
      const next = { ...current, rows: reorderRows(current.rows, msg.ids) };
      saveState(next);
      return next;
    }
    case "setColumns": {
      const next = { ...current, columns: msg.columns };
      saveState(next);
      return next;
    }
    case "setClock": {
      const next = { ...current, clock: msg.clock };
      saveState(next);
      return next;
    }
  }
}

export function sendState(ws: WebSocket, state: State): void {
  const msg: ServerMessage = { type: "state", state };
  ws.send(JSON.stringify(msg));
}

// A stalled client (bad Wi-Fi, frozen kiosk) never drains its send buffer;
// pushing more frames would grow it without bound and OOM the Pi. Skipping is
// safe: state is snapshot-based (next broadcast carries everything) and
// telemetry is disposable.
const MAX_BUFFERED_BYTES = 8 * 1024 * 1024;

export function broadcastMessage(clients: Set<WebSocket>, msg: ServerMessage): void {
  const payload = JSON.stringify(msg);
  for (const client of clients) {
    if (client.readyState !== 1 /* OPEN */) continue;
    if (client.bufferedAmount > MAX_BUFFERED_BYTES) {
      console.warn({ operation: "broadcast", msg: "skipped slow client", buffered: client.bufferedAmount });
      continue;
    }
    client.send(payload);
  }
}

export function broadcast(clients: Set<WebSocket>, state: State): void {
  broadcastMessage(clients, { type: "state", state });
}
