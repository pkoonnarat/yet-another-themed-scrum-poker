import { type Color, type DeckCard, type Suit, SUIT_GLYPH } from "@shared/protocol";
import { el } from "./dom";

export const COLOR_HEX: Record<Color, string> = {
  black: "#33323a",
  red: "#e5484d",
  green: "#2ca24e",
  blue: "#3b82e0",
};

export const COLOR_DEEP: Record<Color, string> = {
  black: "#1c1b22",
  red: "#a02a2d",
  green: "#1a6d36",
  blue: "#2559a8",
};

const SPECIAL: Record<string, string> = { coffee: "☕", question: "?" };

/** A face-up playing card themed to a player's suit + colour. */
export function createCardFace(
  card: DeckCard,
  suit: Suit,
  color: Color,
): HTMLElement {
  const glyph = SUIT_GLYPH[suit];
  const special = SPECIAL[card.id];
  const root = el("div", {
    class: "card card-face",
    dataset: { color, suit, value: card.id },
    style: { "--suit": COLOR_HEX[color], "--deep": COLOR_DEEP[color] } as Partial<CSSStyleDeclaration>,
  });

  if (special) {
    root.append(
      el("span", { class: "corner tl", text: special }),
      el("span", { class: "pip-center special", text: special }),
      el("span", { class: "corner br", text: special }),
    );
    root.classList.add("is-special");
    return root;
  }

  const corner = (pos: string) =>
    el("span", { class: `corner ${pos}` }, [
      el("span", { class: "rank", text: card.label }),
      el("span", { class: "suit", text: glyph }),
    ]);

  root.append(
    corner("tl"),
    el("span", { class: "pip-center", text: card.label }),
    el("span", { class: "pip-suit", text: glyph }),
    corner("br"),
  );
  return root;
}

/** A face-down card back themed to a player's colour. */
export function createCardBack(color: Color): HTMLElement {
  return el(
    "div",
    {
      class: "card card-back",
      dataset: { color },
      style: {
        "--suit": COLOR_HEX[color],
        "--deep": COLOR_DEEP[color],
      } as Partial<CSSStyleDeclaration>,
    },
    [el("div", { class: "back-inner" }, [el("span", { class: "back-emblem", text: "❖" })])],
  );
}

/** Position of card `i` of `n` within the bottom hand fan (px + deg). */
export function fanSlot(i: number, n: number): { x: number; y: number; rot: number } {
  const spacing = Math.min(64, 720 / Math.max(n, 1));
  const rotStep = Math.min(2.4, 26 / Math.max(n, 1));
  const offset = i - (n - 1) / 2;
  return {
    x: offset * spacing,
    y: offset * offset * 0.9,
    rot: offset * rotStep,
  };
}
