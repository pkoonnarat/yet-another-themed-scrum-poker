import type { ClientMessage, RoomSnapshot, ServerMessage } from "@shared/protocol";
import { getClientId, getName } from "./store";

interface NetHandlers {
  onSnapshot: (snap: RoomSnapshot) => void;
  onError: (message: string) => void;
  onStatus: (status: "connecting" | "open" | "closed") => void;
}

export class Net {
  private ws: WebSocket | null = null;
  private code: string;
  private handlers: NetHandlers;
  private attempts = 0;
  private closedByUser = false;
  private heartbeat: number | null = null;

  constructor(code: string, handlers: NetHandlers) {
    this.code = code.toUpperCase();
    this.handlers = handlers;
  }

  connect(): void {
    this.closedByUser = false;
    this.handlers.onStatus("connecting");
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const url = `${proto}://${location.host}/api/room/${this.code}/ws`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;

    ws.addEventListener("open", () => {
      this.attempts = 0;
      this.handlers.onStatus("open");
      this.send({ type: "hello", clientId: getClientId(), name: getName() });
      this.startHeartbeat();
    });

    ws.addEventListener("message", (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(ev.data as string) as ServerMessage;
      } catch {
        return;
      }
      if (msg.type === "state") this.handlers.onSnapshot(msg);
      else if (msg.type === "error") this.handlers.onError(msg.message);
    });

    ws.addEventListener("close", () => {
      this.stopHeartbeat();
      this.handlers.onStatus("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    });

    ws.addEventListener("error", () => {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    });
  }

  private scheduleReconnect(): void {
    this.attempts++;
    const delay = Math.min(8000, 400 * 2 ** Math.min(this.attempts, 5));
    setTimeout(() => {
      if (!this.closedByUser) this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeat = window.setInterval(() => {
      this.send({ type: "ping" });
    }, 25000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat != null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  send(msg: ClientMessage): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close(): void {
    this.closedByUser = true;
    this.stopHeartbeat();
    this.ws?.close();
  }
}

/** Ask the Worker whether a room code exists (before opening a socket). */
export async function roomExists(
  code: string,
): Promise<{ exists: boolean; name: string }> {
  const res = await fetch(`/api/room/${encodeURIComponent(code)}/exists`);
  if (!res.ok) return { exists: false, name: "" };
  return (await res.json()) as { exists: boolean; name: string };
}

export async function createRoom(
  name: string,
): Promise<{ code: string; name: string }> {
  const res = await fetch("/api/room", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("create failed");
  return (await res.json()) as { code: string; name: string };
}
