import {
  type CardId,
  type Color,
  type Phase,
  type PublicParticipant,
  type RoomSnapshot,
  type ServerEvent,
  type Suit,
  COLORS,
  SUITS,
  scoreHand,
} from "../shared/protocol";
import type { Env } from "./index";

interface Participant {
  id: string;
  name: string;
  suit: Suit;
  color: Color;
  connected: boolean;
  disconnectedAt: number;
}

interface PersistedState {
  initialized: boolean;
  name: string;
  roundNumber: number;
  phase: Phase;
  pot: number;
  participants: Participant[];
  votes: [string, CardId][];
}

const GRACE_MS = 45_000; // keep a disconnected player this long for reconnect
const MAX_NAME = 22;

/** Attachment helpers — the hibernatable socket carries its clientId. */
interface SocketAttachment {
  clientId: string;
}

export class RoomDO {
  private state: DurableObjectState;
  private code = "";
  private initialized = false;
  private name = "";
  private roundNumber = 1;
  private phase: Phase = "voting";
  private pot = 0;
  private participants = new Map<string, Participant>();
  private votes = new Map<string, CardId>();

  constructor(state: DurableObjectState, _env: Env) {
    this.state = state;
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<PersistedState>("room");
      if (saved) {
        this.initialized = saved.initialized;
        this.name = saved.name;
        this.roundNumber = saved.roundNumber;
        this.phase = saved.phase;
        this.pot = saved.pot ?? 0;
        this.participants = new Map(saved.participants.map((p) => [p.id, p]));
        this.votes = new Map(saved.votes);
      }
    });
  }

  // --- HTTP entrypoints (called by the Worker) ---------------------------
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.endsWith("/init")) {
      if (this.initialized) {
        return json({ ok: false, reason: "exists" }, 409);
      }
      const body = (await request.json().catch(() => ({}))) as {
        name?: string;
        code?: string;
      };
      this.initialized = true;
      this.name = sanitizeRoomName(body.name);
      this.code = body.code ?? "";
      this.roundNumber = 1;
      this.phase = "voting";
      await this.persist();
      return json({ ok: true, name: this.name });
    }

    if (path.endsWith("/exists")) {
      return json({ exists: this.initialized, name: this.name });
    }

    if (path.endsWith("/ws")) {
      if (!this.initialized) {
        return new Response("Room not found", { status: 404 });
      }
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }
      this.code = url.searchParams.get("code") ?? this.code;
      const pair = new WebSocketPair();
      const client = pair[0];
      const server = pair[1];
      this.state.acceptWebSocket(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  // --- WebSocket hibernation handlers ------------------------------------
  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(typeof raw === "string" ? raw : "") as Record<string, unknown>;
    } catch {
      return;
    }

    switch (msg.type) {
      case "hello": {
        const clientId = String(msg.clientId ?? "").slice(0, 64);
        if (!clientId) return;
        setAttachment(ws, { clientId });
        let p = this.participants.get(clientId);
        if (!p) {
          const [suit, color] = this.pickIdentity();
          p = {
            id: clientId,
            name: sanitizeName(msg.name, "Player"),
            suit,
            color,
            connected: true,
            disconnectedAt: 0,
          };
          this.participants.set(clientId, p);
        } else {
          p.connected = true;
          p.disconnectedAt = 0;
          if (typeof msg.name === "string" && msg.name.trim()) {
            p.name = sanitizeName(msg.name, p.name);
          }
        }
        await this.persist();
        this.broadcast("join");
        return;
      }
      case "setName": {
        const clientId = getAttachment(ws)?.clientId;
        if (!clientId) return;
        const p = this.participants.get(clientId);
        if (!p) return;
        p.name = sanitizeName(msg.name, p.name);
        await this.persist();
        this.broadcast("rename");
        return;
      }
      case "select": {
        const clientId = getAttachment(ws)?.clientId;
        if (!clientId || this.phase !== "voting") return;
        const value = msg.value as CardId | null;
        if (value === null || value === undefined) {
          this.votes.delete(clientId);
        } else if (typeof value === "string") {
          this.votes.set(clientId, value);
        }
        await this.persist();
        this.broadcast("select");
        return;
      }
      case "reveal": {
        if (this.phase !== "voting") return;
        this.phase = "revealed";
        if (this.currentResults().consensus) this.pot += 1;
        await this.persist();
        this.broadcast("reveal");
        return;
      }
      case "clear": {
        this.phase = "voting";
        this.votes.clear();
        this.roundNumber += 1;
        await this.persist();
        this.broadcast("clear");
        return;
      }
      case "ping": {
        try {
          ws.send(JSON.stringify({ type: "pong" }));
        } catch {
          /* ignore */
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const clientId = getAttachment(ws)?.clientId;
    if (!clientId) return;
    const stillOpen = this.state
      .getWebSockets()
      .some((s) => s !== ws && getAttachment(s)?.clientId === clientId);
    if (!stillOpen) {
      const p = this.participants.get(clientId);
      if (p) {
        p.connected = false;
        p.disconnectedAt = Date.now();
      }
    }
    await this.persist();
    this.broadcast("leave");
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  // --- Internals ---------------------------------------------------------
  private pickIdentity(): [Suit, Color] {
    const used = new Set(
      [...this.participants.values()]
        .filter((p) => p.connected)
        .map((p) => `${p.suit}:${p.color}`),
    );
    const combos: [Suit, Color][] = [];
    for (const s of SUITS) for (const c of COLORS) combos.push([s, c]);
    const free = combos.filter(([s, c]) => !used.has(`${s}:${c}`));
    const pool = free.length ? free : combos;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  private prune(): void {
    const now = Date.now();
    for (const [id, p] of this.participants) {
      if (!p.connected && now - p.disconnectedAt > GRACE_MS) {
        this.participants.delete(id);
        this.votes.delete(id);
      }
    }
  }

  private connectedParticipants(): Participant[] {
    return [...this.participants.values()].filter((p) => p.connected);
  }

  private currentResults() {
    const votes: CardId[] = [];
    for (const p of this.connectedParticipants()) {
      const v = this.votes.get(p.id);
      if (v) votes.push(v);
    }
    return scoreHand(votes);
  }

  private broadcast(event: ServerEvent): void {
    this.prune();
    const sockets = this.state.getWebSockets();
    const results = this.phase === "revealed" ? this.currentResults() : null;
    const roster = this.connectedParticipants();

    for (const ws of sockets) {
      const myId = getAttachment(ws)?.clientId ?? "";
      const participants: PublicParticipant[] = roster.map((p) => {
        const vote = this.votes.get(p.id) ?? null;
        const reveal = this.phase === "revealed" || p.id === myId;
        return {
          id: p.id,
          name: p.name,
          suit: p.suit,
          color: p.color,
          hasVoted: this.votes.has(p.id),
          vote: reveal ? vote : null,
          isYou: p.id === myId,
        };
      });
      const snap: RoomSnapshot = {
        type: "state",
        code: this.code,
        name: this.name,
        roundNumber: this.roundNumber,
        phase: this.phase,
        participants,
        results,
        youId: myId,
        pot: this.pot,
        event,
      };
      try {
        ws.send(JSON.stringify(snap));
      } catch {
        /* socket closing */
      }
    }
  }

  private async persist(): Promise<void> {
    const data: PersistedState = {
      initialized: this.initialized,
      name: this.name,
      roundNumber: this.roundNumber,
      phase: this.phase,
      pot: this.pot,
      participants: [...this.participants.values()],
      votes: [...this.votes.entries()],
    };
    await this.state.storage.put("room", data);
  }
}

// --- helpers ---------------------------------------------------------------
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sanitizeName(v: unknown, fallback: string): string {
  if (typeof v !== "string") return fallback;
  const cleaned = v.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, MAX_NAME);
  return cleaned || fallback;
}

function sanitizeRoomName(v: unknown): string {
  if (typeof v !== "string") return "Untitled Room";
  const cleaned = v.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, 40);
  return cleaned || "Untitled Room";
}

function setAttachment(ws: WebSocket, att: SocketAttachment): void {
  (ws as unknown as { serializeAttachment(v: unknown): void }).serializeAttachment(att);
}

function getAttachment(ws: WebSocket): SocketAttachment | null {
  const att = (ws as unknown as { deserializeAttachment(): unknown }).deserializeAttachment();
  return (att as SocketAttachment | null) ?? null;
}
