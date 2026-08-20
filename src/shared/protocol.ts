// ---------------------------------------------------------------------------
// Shared protocol: deck, wire messages, and pure scoring functions.
// Imported by BOTH the Durable Object (authoritative) and the browser client.
// Keep this file free of DOM/Workers globals so it type-checks under both.
// ---------------------------------------------------------------------------

export type CardId =
  | "0"
  | "0.5"
  | "1"
  | "2"
  | "3"
  | "5"
  | "8"
  | "13"
  | "20"
  | "40"
  | "100"
  | "coffee"
  | "question";

export interface DeckCard {
  id: CardId;
  /** Big glyph shown on the card face. */
  label: string;
  /** Numeric weight for averaging, or null for abstain cards (☕ / ?). */
  numeric: number | null;
}

/** Full planning-poker deck. Order = deal order (bottom-right → fanned hand). */
export const DECK: DeckCard[] = [
  { id: "0", label: "0", numeric: 0 },
  { id: "0.5", label: "½", numeric: 0.5 },
  { id: "1", label: "1", numeric: 1 },
  { id: "2", label: "2", numeric: 2 },
  { id: "3", label: "3", numeric: 3 },
  { id: "5", label: "5", numeric: 5 },
  { id: "8", label: "8", numeric: 8 },
  { id: "13", label: "13", numeric: 13 },
  { id: "20", label: "20", numeric: 20 },
  { id: "40", label: "40", numeric: 40 },
  { id: "100", label: "100", numeric: 100 },
  { id: "coffee", label: "☕", numeric: null },
  { id: "question", label: "?", numeric: null },
];

export const DECK_BY_ID: Record<string, DeckCard> = Object.fromEntries(
  DECK.map((c) => [c.id, c]),
);

export type Suit = "spade" | "heart" | "club" | "diamond";
export type Color = "black" | "red" | "green" | "blue";

export const SUITS: Suit[] = ["spade", "heart", "club", "diamond"];
export const COLORS: Color[] = ["black", "red", "green", "blue"];

export const SUIT_GLYPH: Record<Suit, string> = {
  spade: "♠",
  heart: "♥",
  club: "♣",
  diamond: "♦",
};

export type Phase = "voting" | "revealed";

/** What a client learns about a participant (vote hidden until reveal). */
export interface PublicParticipant {
  id: string;
  name: string;
  suit: Suit;
  color: Color;
  hasVoted: boolean;
  /** Populated only when revealed, or when it's the recipient's own card. */
  vote: CardId | null;
  isYou: boolean;
}

export interface HandResult {
  handName: string;
  chips: number;
  mult: number;
  score: number;
  /** Mean of numeric votes to 1 dp, or null when nobody cast a numeric vote. */
  average: number | null;
  /** True when every numeric vote matches (>= 2 numeric voters). */
  consensus: boolean;
  distribution: { value: CardId; count: number }[];
  numericCount: number;
  abstainCount: number;
}

export type ServerEvent =
  | "sync"
  | "join"
  | "leave"
  | "select"
  | "reveal"
  | "clear"
  | "rename";

export interface RoomSnapshot {
  type: "state";
  code: string;
  name: string;
  roundNumber: number;
  phase: Phase;
  participants: PublicParticipant[];
  results: HandResult | null;
  youId: string;
  /** Consensus rounds reached so far (the themed "$" pot). */
  pot: number;
  event: ServerEvent;
}

// ---- Client → Server -------------------------------------------------------
export type ClientMessage =
  | { type: "hello"; clientId: string; name: string }
  | { type: "setName"; name: string }
  | { type: "select"; value: CardId | null }
  | { type: "reveal" }
  | { type: "clear" }
  | { type: "ping" };

// ---- Server → Client -------------------------------------------------------
export type ServerMessage =
  | RoomSnapshot
  | { type: "error"; message: string }
  | { type: "pong" };

// ---------------------------------------------------------------------------
// Pure scoring helpers (shared, deterministic).
// ---------------------------------------------------------------------------

export function numericValuesOf(votes: CardId[]): number[] {
  const out: number[] = [];
  for (const v of votes) {
    const n = DECK_BY_ID[v]?.numeric;
    if (n !== null && n !== undefined) out.push(n);
  }
  return out;
}

export function averageOf(votes: CardId[]): number | null {
  const nums = numericValuesOf(votes);
  if (nums.length === 0) return null;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round((sum / nums.length) * 10) / 10;
}

interface HandDef {
  name: string;
  chips: number;
  mult: number;
}

/**
 * Map the multiset of cast votes to a Balatro-flavoured "poker hand".
 * Purely decorative colour on top of the real average, shown in the
 * blue-chips × red-mult panel.
 */
export function scoreHand(votes: CardId[]): HandResult {
  const counts = new Map<CardId, number>();
  for (const v of votes) counts.set(v, (counts.get(v) ?? 0) + 1);

  const distribution = [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));

  const groupSizes = distribution.map((d) => d.count).sort((a, b) => b - a);
  const g1 = groupSizes[0] ?? 0;
  const g2 = groupSizes[1] ?? 0;
  const voters = votes.length;

  const nums = numericValuesOf(votes);
  const numericCount = nums.length;
  const abstainCount = voters - numericCount;
  const allNumericEqual =
    numericCount >= 2 && nums.every((n) => n === nums[0]);
  const consensus = allNumericEqual;

  let def: HandDef;
  if (voters === 0) {
    def = { name: "No Cards", chips: 0, mult: 0 };
  } else if (consensus && g1 === voters) {
    def = { name: "Perfect Consensus", chips: 120, mult: 12 };
  } else if (g1 >= 5) {
    def = { name: "Five of a Kind", chips: 100, mult: 10 };
  } else if (g1 === 4) {
    def = { name: "Four of a Kind", chips: 60, mult: 7 };
  } else if (g1 === 3 && g2 >= 2) {
    def = { name: "Full House", chips: 40, mult: 4 };
  } else if (g1 === 3) {
    def = { name: "Three of a Kind", chips: 30, mult: 3 };
  } else if (g1 === 2 && g2 === 2) {
    def = { name: "Two Pair", chips: 20, mult: 2 };
  } else if (g1 === 2) {
    def = { name: "Pair", chips: 10, mult: 2 };
  } else if (voters === 1) {
    def = { name: "Lone Wolf", chips: 5, mult: 1 };
  } else {
    def = { name: "High Card", chips: 5, mult: 1 };
  }

  return {
    handName: def.name,
    chips: def.chips,
    mult: def.mult,
    score: def.chips * def.mult,
    average: averageOf(votes),
    consensus,
    distribution,
    numericCount,
    abstainCount,
  };
}
