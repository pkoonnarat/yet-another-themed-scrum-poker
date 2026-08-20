# Story Poker — a Balatro-themed scrum poker 🃏

A no-login, real-time **planning poker** web app skinned to look, feel, sound and
animate like the game **Balatro** — pixel-art cards on a green felt table, chunky
dark side panels, gently wobbling cards, deal-in animations, one-by-one flip
reveals with escalating "combo" juice, and procedurally-synthesised retro blips.

Everything is **TypeScript**. It ships as a **single Cloudflare Worker** and uses
**one Durable Object per room** for in-memory (hibernation-safe) state and
WebSocket fan-out. No database. Runs on the **Workers free plan**.

## Highlights

- **No login.** Pick a name (saved in a cookie/localStorage), create or join a room.
- **Real-time** WebSocket sync across everyone in the room.
- On join you're dealt a random **suit + colour** identity (♠♥♣♦ × black/red/green/blue).
- **Full planning-poker deck** fanned at the bottom: `0 ½ 1 2 3 5 8 13 20 40 100 ☕ ?`.
- **Drag a card** onto the table (or tap it) to cast your estimate — face-down to everyone else.
- **Reveal** flips every card one-by-one; matching cards **combo** like a poker hand.
- The votes are scored as a Balatro **"poker hand"** (Pair, Full House, … up to
  **Perfect Consensus**) shown in the blue-chips × red-mult panel — pure flavour on
  top of the real answer.
- **Story Point** = the mean of the numeric votes to 1 dp (`☕`/`?` abstain).
- All-agree triggers a **CONSENSUS!** celebration with confetti + fanfare.
- Themed **joker row**, a "$" pot that grows on consensus, live player/vote counts,
  reconnect that keeps your identity, and a sound toggle.

## Deck & scoring

| Card | Value | Card | Value |
|------|-------|------|-------|
| `0 ½ 1 2 3` | as shown | `5 8 13 20 40 100` | as shown |
| `☕` | abstain (needs a break) | `?` | abstain (unsure) |

- **Story Point** is the arithmetic mean of the numeric votes, rounded to one
  decimal. Abstain cards are excluded.
- The **hand** is decorative: identical votes group like poker cards. All numeric
  votes equal (≥2 voters) = **Perfect Consensus** and bumps the `$` pot.

## Run it locally

```bash
npm install
npm run preview      # builds the client, then runs `wrangler dev` on :8787
```

Open http://localhost:8787, create a room, then open the room URL in a second
browser/tab to play against yourself.

Other scripts:

```bash
npm run build        # vite build → dist/client
npm run dev          # wrangler dev only (expects dist/client to exist)
npm run watch        # vite build --watch (run alongside `npm run dev`)
npm run typecheck    # tsc for client + worker
npm run check        # typecheck + build
```

## Deploy to Cloudflare (free tier)

```bash
npx wrangler login   # one-time, opens a browser to authorise your account
npm run deploy       # vite build + wrangler deploy
```

The Durable Object is declared as a **SQLite-backed** class
(`migrations: new_sqlite_classes`), which is what makes it eligible for the
Workers **free** plan. No other Cloudflare resources are required.

## Architecture

```
Browser (SPA, vanilla TS + Web Animations + Web Audio)
   │  WebSocket  /api/room/:code/ws
   ▼
Worker (src/worker/index.ts)         ← routing, room creation, static assets
   │  idFromName(code)
   ▼
RoomDO (src/worker/room.ts)          ← per-room state, votes, results,
                                        WebSocket hibernation + broadcast
```

- `src/shared/protocol.ts` — the single source of truth for the deck, wire
  message types, and the pure `averageOf` / `scoreHand` functions, imported by
  both the Durable Object (authoritative) and the client.
- The Worker serves the built SPA from `dist/client` via its `assets` binding
  with SPA fallback, and forwards `/api/*` to the room's Durable Object.
- Room state is persisted to Durable Object storage on every mutation, so it
  survives hibernation; a disconnected player is kept for a short grace window so
  a reload reconnects with the same identity.

## Notes

- No real Balatro assets are used — the pixel font is Google's open-licensed
  *Pixelify Sans*, and all sound is generated at runtime with the Web Audio API.
- Rooms live only as long as the Durable Object; there is no long-term database.
