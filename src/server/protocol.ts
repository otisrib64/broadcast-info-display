import type { WebSocket } from "ws";
import { ClientMessageSchema, type ClientMessage, type ServerMessage, type State } from "../shared/types.js";
import { getState, saveState } from "./state.js";

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
      const rows = exists
        ? current.rows.map((r) => (r.id === msg.row.id ? msg.row : r))
        : [...current.rows, msg.row];
      const next = { rows };
      saveState(next);
      return next;
    }
    case "removeRow": {
      const next = { rows: current.rows.filter((r) => r.id !== msg.id) };
      saveState(next);
      return next;
    }
    case "reorder": {
      const byId = new Map(current.rows.map((r) => [r.id, r]));
      const rows = msg.ids.flatMap((id) => {
        const row = byId.get(id);
        return row ? [row] : [];
      });
      const next = { rows };
      saveState(next);
      return next;
    }
  }
}

export function sendState(ws: WebSocket, state: State): void {
  const msg: ServerMessage = { type: "state", state };
  ws.send(JSON.stringify(msg));
}

export function broadcast(clients: Set<WebSocket>, state: State): void {
  const payload = JSON.stringify({ type: "state", state } satisfies ServerMessage);
  for (const client of clients) {
    if (client.readyState === 1 /* OPEN */) {
      client.send(payload);
    }
  }
}
