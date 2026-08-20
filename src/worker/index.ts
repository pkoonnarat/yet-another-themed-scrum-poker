import { RoomDO } from "./room";

export interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

export { RoomDO };

// Unambiguous room-code alphabet (no O/0, I/1 confusion).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LEN = 4;
const ROOM_RE = /^\/api\/room\/([A-Za-z0-9]{2,12})\/(ws|exists)$/;

function makeCode(): string {
  let out = "";
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LEN));
  for (let i = 0; i < CODE_LEN; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function roomStub(env: Env, code: string): DurableObjectStub {
  return env.ROOM.get(env.ROOM.idFromName(code.toUpperCase()));
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      // Create a room: allocate a fresh code + init its Durable Object.
      if (path === "/api/room" && request.method === "POST") {
        const body = (await request.json().catch(() => ({}))) as { name?: string };
        for (let attempt = 0; attempt < 6; attempt++) {
          const code = makeCode();
          const stub = roomStub(env, code);
          const res = await stub.fetch("https://do/init", {
            method: "POST",
            body: JSON.stringify({ name: body.name ?? "", code }),
            headers: { "content-type": "application/json" },
          });
          if (res.ok) {
            const data = (await res.json()) as { name: string };
            return json({ code, name: data.name });
          }
          // 409 => code already taken, try another.
        }
        return json({ error: "Could not allocate a room code" }, 503);
      }

      // Room-scoped routes: /api/room/:code/ws and /api/room/:code/exists
      const m = path.match(ROOM_RE);
      if (m) {
        const code = m[1].toUpperCase();
        const kind = m[2];
        const stub = roomStub(env, code);
        if (kind === "ws") {
          const doUrl = `https://do/ws?code=${encodeURIComponent(code)}`;
          return stub.fetch(new Request(doUrl, request));
        }
        return stub.fetch("https://do/exists");
      }

      return json({ error: "Not found" }, 404);
    }

    // Everything else: static SPA assets, with index.html fallback so deep
    // links like /room/ABCD resolve on hard reload.
    const assetRes = await env.ASSETS.fetch(request);
    if (assetRes.status === 404 && request.method === "GET") {
      return env.ASSETS.fetch(new Request(new URL("/", request.url), request));
    }
    return assetRes;
  },
} satisfies ExportedHandler<Env>;
