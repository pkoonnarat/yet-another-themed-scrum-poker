import {
  type CardId,
  type Color,
  type PublicParticipant,
  type RoomSnapshot,
  type Suit,
  DECK,
  DECK_BY_ID,
  SUIT_GLYPH,
} from "@shared/protocol";
import { clear, el, mount, wait } from "./dom";
import { Net } from "./net";
import { getName, setName } from "./store";
import { COLOR_HEX, createCardBack, createCardFace, fanSlot } from "./cards";
import {
  isSoundOn,
  playClear,
  playCombo,
  playDeal,
  playFanfare,
  playFlip,
  playHover,
  playReveal,
  playSelect,
  toggleSound,
  unlockAudio,
} from "./sound";

const JOKERS = [
  { emoji: "🎩", name: "The Facilitator", desc: "Keeps the round moving. Nudges lurkers to vote." },
  { emoji: "🔥", name: "Deadline", desc: "Cards wobble twice as hard. Ship it anyway." },
  { emoji: "📈", name: "Scope Creep", desc: "Every estimate is secretly a little bigger." },
  { emoji: "🦆", name: "Rubber Duck", desc: "Explains the ticket to itself. It helps." },
  { emoji: "☕", name: "Fuel", desc: "Abstain guilt-free. Refill required." },
];

interface Seat {
  root: HTMLElement;
  slot: HTMLElement;
  token: HTMLElement;
  nametag: HTMLElement;
  placed: HTMLElement | null;
  id: string;
}

export class RoomView {
  private root: HTMLElement;
  private code: string;
  private net: Net;
  private snapshot: RoomSnapshot | null = null;
  private prevPhase: "voting" | "revealed" | null = null;
  private prevRound = 0;
  private seats = new Map<string, Seat>();
  private handCards = new Map<CardId, HTMLElement>();
  private mySuit: Suit | null = null;
  private myColor: Color | null = null;
  private handBuilt = false;
  private revealing = false;

  // element refs (assigned in build)
  private idName!: HTMLElement;
  private idToken!: HTMLElement;
  private idSub!: HTMLElement;
  private scoreValue!: HTMLElement;
  private hpName!: HTMLElement;
  private hpChips!: HTMLElement;
  private hpMult!: HTMLElement;
  private hpPanel!: HTMLElement;
  private revealBtn!: HTMLButtonElement;
  private clearBtn!: HTMLButtonElement;
  private statPlayers!: HTMLElement;
  private statVoted!: HTMLElement;
  private potValue!: HTMLElement;
  private roundValue!: HTMLElement;
  private banner!: HTMLElement;
  private seatsEl!: HTMLElement;
  private handEl!: HTMLElement;
  private tableEl!: HTMLElement;
  private connDot!: HTMLElement;

  constructor(root: HTMLElement, code: string) {
    this.root = root;
    this.code = code.toUpperCase();
    this.build();
    this.net = new Net(this.code, {
      onSnapshot: (s) => this.onSnapshot(s),
      onError: (m) => this.toast(m),
      onStatus: (st) => this.setStatus(st),
    });
    this.net.connect();
    unlockAudio();
  }

  destroy(): void {
    this.net.close();
  }

  // -------------------------------------------------------------------------
  private build(): void {
    // ---- Sidebar ----
    this.idToken = el("div", { class: "id-token", text: "★" });
    this.idName = el("div", { class: "id-name", text: getName() });
    this.idSub = el("div", { class: "id-sub", text: "tap to rename" });
    const identity = el(
      "div",
      {
        class: "panel blind-panel",
        title: "This is you — click to rename",
        on: { click: () => this.editName() },
      },
      [
        this.idToken,
        el("div", { class: "id-meta" }, [
          el("div", { class: "id-eyebrow", text: "BIG BLIND" }),
          this.idName,
          this.idSub,
        ]),
      ],
    );

    this.scoreValue = el("div", { class: "score-value", text: "0" });
    const scorePanel = el("div", { class: "panel score-panel" }, [
      el("div", { class: "score-label", text: "Story\nPoint" }),
      el("div", { class: "score-figure" }, [
        el("span", { class: "chip-star", text: "✳" }),
        this.scoreValue,
      ]),
    ]);

    this.hpName = el("div", { class: "hp-name", text: "Waiting…" });
    this.hpChips = el("div", { class: "hp-chips", text: "—" });
    this.hpMult = el("div", { class: "hp-mult", text: "—" });
    this.hpPanel = el("div", { class: "panel hand-panel dim" }, [
      el("div", { class: "hp-head" }, [this.hpName, el("span", { class: "hp-lvl", text: "lvl.1" })]),
      el("div", { class: "hp-calc" }, [
        this.hpChips,
        el("span", { class: "hp-x", text: "×" }),
        this.hpMult,
      ]),
    ]);

    this.revealBtn = el("button", {
      class: "btn btn-blue btn-chunky reveal",
      text: "Reveal Cards",
      on: { click: () => this.doReveal() },
    }) as HTMLButtonElement;
    this.clearBtn = el("button", {
      class: "btn btn-red btn-chunky clear",
      text: "Clear Cards",
      on: { click: () => this.doClear() },
    }) as HTMLButtonElement;

    this.statPlayers = el("div", { class: "stat-value", text: "0" });
    this.statVoted = el("div", { class: "stat-value alt", text: "0" });
    const stats = el("div", { class: "stat-row" }, [
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Players" }),
        this.statPlayers,
      ]),
      el("div", { class: "stat" }, [
        el("div", { class: "stat-label", text: "Voted" }),
        this.statVoted,
      ]),
    ]);

    const miniBtns = el("div", { class: "mini-btns" }, [
      el("button", {
        class: "mini-btn info",
        text: "Run Info",
        on: { click: () => this.openRunInfo() },
      }),
      el("button", {
        class: "mini-btn opts",
        text: "Options",
        on: { click: () => this.openOptions() },
      }),
    ]);

    this.potValue = el("div", { class: "money", text: "$0" });
    this.roundValue = el("div", { class: "round-num", text: "1" });
    const bottomRow = el("div", { class: "bottom-row" }, [
      this.potValue,
      el("div", { class: "ante-box" }, [
        el("div", { class: "ante-label", text: "Round" }),
        this.roundValue,
      ]),
    ]);

    this.connDot = el("div", { class: "status-dot", title: "connecting" });
    const codeChip = el("div", { class: "code-chip", title: "Room code" }, [
      el("span", { class: "code-key", text: "ROOM" }),
      el("span", { class: "code-val", text: this.code }),
      this.connDot,
    ]);

    const sidebar = el("aside", { class: "sidebar" }, [
      identity,
      scorePanel,
      this.hpPanel,
      el("div", { class: "controls" }, [this.revealBtn, this.clearBtn]),
      stats,
      miniBtns,
      bottomRow,
      codeChip,
    ]);

    // ---- Table ----
    const jokerRow = el("div", { class: "jokers" }, [
      el("div", { class: "joker-count", text: `${JOKERS.length}/5` }),
      ...JOKERS.map((j, i) => this.buildJoker(j, i)),
      el("div", { class: "joker-count muted", text: "0/2" }),
    ]);

    this.banner = el("div", { class: "phase-banner" });
    this.seatsEl = el("div", { class: "seats" });
    this.handEl = el("div", { class: "hand locked" });
    const deck = el("div", { class: "deck", title: "The deck" }, [
      el("div", { class: "deck-card d3" }),
      el("div", { class: "deck-card d2" }),
      el("div", { class: "deck-card d1" }),
      el("div", { class: "deck-count", text: "∞" }),
    ]);

    this.tableEl = el("main", { class: "table" }, [
      jokerRow,
      this.banner,
      this.seatsEl,
      deck,
      this.handEl,
    ]);

    mount(this.root, el("div", { class: "room" }, [sidebar, this.tableEl]));
  }

  private buildJoker(j: (typeof JOKERS)[number], i: number): HTMLElement {
    const tip = el("div", { class: "joker-tip" }, [
      el("div", { class: "joker-tip-name", text: j.name }),
      el("div", { class: "joker-tip-desc", text: j.desc }),
    ]);
    return el(
      "div",
      {
        class: "joker",
        style: { animationDelay: `${i * 0.3}s` } as Partial<CSSStyleDeclaration>,
        on: { pointerenter: () => isSoundOn() && playHover() },
      },
      [el("span", { class: "joker-emoji", text: j.emoji }), tip],
    );
  }

  // -------------------------------------------------------------------------
  private onSnapshot(snap: RoomSnapshot): void {
    const me = snap.participants.find((p) => p.isYou);
    // Build / rebuild hand once identity is known.
    if (me && (this.mySuit !== me.suit || this.myColor !== me.color)) {
      this.mySuit = me.suit;
      this.myColor = me.color;
      this.buildHand();
    }

    const prev = this.snapshot;
    this.snapshot = snap;

    this.updateSidebar(snap, me);
    this.reconcileRoster(snap);

    const revealNow =
      prev != null &&
      prev.phase === "voting" &&
      snap.phase === "revealed" &&
      !this.revealing;
    const clearNow =
      (prev != null && prev.phase === "revealed" && snap.phase === "voting") ||
      (this.prevRound !== 0 && snap.roundNumber > this.prevRound);

    if (clearNow && snap.phase === "voting") {
      this.runClear(snap);
    } else if (revealNow) {
      void this.runReveal(snap);
    } else if (!this.revealing) {
      this.renderSeatCardsInstant(snap);
    }

    this.updateHandSelection(me);
    this.updateControls(snap);
    this.updateBanner(snap);

    this.prevPhase = snap.phase;
    this.prevRound = snap.roundNumber;
  }

  private updateSidebar(snap: RoomSnapshot, me?: PublicParticipant): void {
    if (me) {
      this.idName.textContent = me.name;
      this.idToken.textContent = SUIT_GLYPH[me.suit];
      this.idToken.style.setProperty("--suit", COLOR_HEX[me.color]);
      this.idToken.dataset.color = me.color;
      this.idSub.textContent = `${me.color} ${me.suit} • tap to rename`;
    }
    this.statPlayers.textContent = String(snap.participants.length);
    const voted = snap.participants.filter((p) => p.hasVoted).length;
    this.statVoted.textContent = `${voted}/${snap.participants.length}`;
    this.potValue.textContent = `$${snap.pot}`;
    this.roundValue.textContent = String(snap.roundNumber);

    if (snap.phase === "revealed" && snap.results) {
      const avg = snap.results.average;
      this.scoreValue.textContent = avg == null ? "—" : avg.toFixed(1);
      this.hpName.textContent = snap.results.handName;
      this.hpChips.textContent = String(snap.results.chips);
      this.hpMult.textContent = String(snap.results.mult);
      this.hpPanel.classList.remove("dim");
    } else {
      this.scoreValue.textContent = "0";
      this.hpName.textContent = "Waiting…";
      this.hpChips.textContent = "—";
      this.hpMult.textContent = "—";
      this.hpPanel.classList.add("dim");
    }
  }

  private updateControls(snap: RoomSnapshot): void {
    const anyVotes = snap.participants.some((p) => p.hasVoted);
    this.revealBtn.disabled = snap.phase === "revealed" || !anyVotes;
    this.clearBtn.disabled = snap.phase === "voting" && !anyVotes;
    this.handEl.classList.toggle("locked", snap.phase === "revealed");
  }

  private updateBanner(snap: RoomSnapshot): void {
    if (this.revealing) return;
    if (snap.phase === "revealed" && snap.results) {
      this.banner.textContent = snap.results.handName;
      this.banner.classList.add("show");
    } else {
      const voted = snap.participants.filter((p) => p.hasVoted).length;
      const n = snap.participants.length;
      this.banner.textContent =
        voted === 0
          ? "Pick your card ▾"
          : voted >= n
            ? "All in! Ready to reveal ▾"
            : `Voted ${voted}/${n} — waiting…`;
      this.banner.classList.remove("show");
    }
  }

  // ---- Seats --------------------------------------------------------------
  private reconcileRoster(snap: RoomSnapshot): void {
    const present = new Set(snap.participants.map((p) => p.id));
    for (const [id, seat] of this.seats) {
      if (!present.has(id)) {
        seat.root.classList.add("leaving");
        setTimeout(() => seat.root.remove(), 260);
        this.seats.delete(id);
      }
    }
    for (const p of snap.participants) {
      let seat = this.seats.get(p.id);
      if (!seat) {
        seat = this.createSeat(p);
        this.seats.set(p.id, seat);
        this.seatsEl.append(seat.root);
      }
      seat.nametag.textContent = p.name;
      seat.root.classList.toggle("you", p.isYou);
      seat.token.textContent = SUIT_GLYPH[p.suit];
      seat.token.style.setProperty("--suit", COLOR_HEX[p.color]);
      seat.token.dataset.color = p.color;
    }
  }

  private createSeat(p: PublicParticipant): Seat {
    const slot = el("div", { class: "slot" });
    const token = el("div", { class: "seat-token", dataset: { color: p.color } });
    const nametag = el("div", { class: "nametag" }, [token, el("span", { text: p.name })]);
    const root = el("div", { class: "seat entering" }, [slot, nametag]);
    setTimeout(() => root.classList.remove("entering"), 30);
    // nametag holds token + name span; refresh reference to the name span
    const nameSpan = nametag.querySelector("span") as HTMLElement;
    return { root, slot, token, nametag: nameSpan, placed: null, id: p.id };
  }

  /** Ensure a face-down placed card exists in the seat for this colour. */
  private ensurePlaced(seat: Seat, color: Color): HTMLElement {
    if (seat.placed) return seat.placed;
    const back = createCardBack(color);
    const front = el("div", { class: "flip-face front" });
    const inner = el("div", { class: "flip-inner" }, [
      el("div", { class: "flip-face back" }, [back]),
      front,
    ]);
    const placed = el("div", { class: "placed pop-in" }, [inner]);
    seat.slot.append(placed);
    seat.placed = placed;
    return placed;
  }

  private setFront(seat: Seat, vote: CardId, p: PublicParticipant): void {
    const placed = seat.placed;
    if (!placed) return;
    const front = placed.querySelector(".flip-face.front") as HTMLElement;
    clear(front);
    front.append(createCardFace(DECK_BY_ID[vote], p.suit, p.color));
  }

  private removeCard(seat: Seat): void {
    if (seat.placed) {
      seat.placed.remove();
      seat.placed = null;
    }
    seat.root.classList.remove("no-vote");
  }

  /** Render all seat cards to their final state without the flip sequence. */
  private renderSeatCardsInstant(snap: RoomSnapshot): void {
    for (const p of snap.participants) {
      const seat = this.seats.get(p.id);
      if (!seat) continue;
      if (snap.phase === "voting") {
        seat.root.classList.remove("no-vote", "matched");
        if (p.hasVoted) {
          this.ensurePlaced(seat, p.color);
          seat.placed?.querySelector(".flip-inner")?.classList.remove("flipped");
        } else {
          this.removeCard(seat);
        }
      } else {
        if (p.vote != null) {
          this.ensurePlaced(seat, p.color);
          this.setFront(seat, p.vote, p);
          seat.placed?.querySelector(".flip-inner")?.classList.add("flipped");
          seat.root.classList.remove("no-vote");
        } else {
          this.removeCard(seat);
          seat.root.classList.add("no-vote");
        }
      }
    }
  }

  // ---- Reveal sequence ----------------------------------------------------
  private async runReveal(snap: RoomSnapshot): Promise<void> {
    this.revealing = true;
    if (isSoundOn()) playReveal();

    const voters = snap.participants.filter((p) => p.vote != null);
    // Prepare fronts on existing (or new) face-down cards.
    for (const p of voters) {
      const seat = this.seats.get(p.id);
      if (!seat) continue;
      this.ensurePlaced(seat, p.color);
      this.setFront(seat, p.vote as CardId, p);
      seat.placed?.querySelector(".flip-inner")?.classList.remove("flipped");
    }
    // Non-voters shown as empty.
    for (const p of snap.participants.filter((x) => x.vote == null)) {
      const seat = this.seats.get(p.id);
      if (seat) {
        this.removeCard(seat);
        seat.root.classList.add("no-vote");
      }
    }

    this.banner.textContent = "Revealing…";
    this.banner.classList.remove("show");

    const seen = new Map<CardId, number>();
    let comboStep = 0;
    await wait(220);

    for (const p of voters) {
      const seat = this.seats.get(p.id);
      const vote = p.vote as CardId;
      if (!seat || !seat.placed) continue;
      seat.placed.querySelector(".flip-inner")?.classList.add("flipped");
      if (isSoundOn()) playFlip();

      const count = (seen.get(vote) ?? 0) + 1;
      seen.set(vote, count);

      const numeric = DECK_BY_ID[vote]?.numeric;
      this.floatChip(seat.placed, numeric == null ? DECK_BY_ID[vote].label : String(numeric));

      if (count >= 2) {
        comboStep++;
        if (isSoundOn()) playCombo(comboStep);
        seat.root.classList.add("matched");
        // re-flag the earlier same-value seats as matched
        for (const q of voters) {
          if (q.vote === vote) this.seats.get(q.id)?.root.classList.add("matched");
        }
        this.comboPop(comboStep);
        this.shake(Math.min(comboStep, 4));
      }
      await wait(360);
    }

    // Results panels juice
    this.pulse(this.scoreValue.parentElement as HTMLElement);
    this.pulse(this.hpPanel);
    if (snap.results?.handName) {
      this.banner.textContent = snap.results.handName;
      this.banner.classList.add("show");
    }

    if (snap.results?.consensus) {
      await wait(200);
      this.celebrate();
    }
    this.revealing = false;
  }

  private runClear(snap: RoomSnapshot): void {
    if (isSoundOn()) playClear();
    for (const seat of this.seats.values()) {
      seat.root.classList.remove("matched", "no-vote");
      if (seat.placed) {
        const placed = seat.placed;
        placed.classList.add("fly-out");
        setTimeout(() => placed.remove(), 320);
        seat.placed = null;
      }
    }
    this.banner.classList.remove("show");
    // Re-deal the hand for a fresh feel.
    this.dealHand();
    // Ensure any already-present votes (race) render.
    setTimeout(() => {
      if (this.snapshot === snap && !this.revealing) this.renderSeatCardsInstant(snap);
    }, 340);
  }

  // ---- Hand ---------------------------------------------------------------
  private buildHand(): void {
    if (!this.mySuit || !this.myColor) return;
    clear(this.handEl);
    this.handCards.clear();
    DECK.forEach((card, idx) => {
      const face = createCardFace(card, this.mySuit as Suit, this.myColor as Color);
      const inner = el("div", { class: "hc-inner" }, [face]);
      inner.style.animationDelay = `${idx * -0.37}s`;
      const lift = el("div", { class: "hc-lift" }, [inner]);
      const hc = el("div", {
        class: "hand-card",
        dataset: { value: card.id },
      });
      hc.append(lift);
      this.attachCardInput(hc, card.id);
      this.handEl.append(hc);
      this.handCards.set(card.id, hc);
    });
    this.handBuilt = true;
    this.layoutHand();
    this.dealHand();
  }

  private layoutHand(): void {
    const n = this.handCards.size;
    let i = 0;
    for (const hc of this.handCards.values()) {
      const { x, y, rot } = fanSlot(i, n);
      hc.style.setProperty("--x", `${x}px`);
      hc.style.setProperty("--y", `${y}px`);
      hc.style.setProperty("--rot", `${rot}deg`);
      hc.style.setProperty("--i", String(i));
      i++;
    }
  }

  private dealHand(): void {
    if (!this.handBuilt) return;
    const cards = [...this.handCards.values()];
    cards.forEach((hc, i) => {
      hc.classList.remove("dealing");
      hc.style.transform =
        "translate(-50%,-50%) translate(520px, 40px) rotate(40deg) scale(0.3)";
      hc.style.opacity = "0";
      // force reflow so the transition runs from the deck position
      void hc.offsetWidth;
      hc.style.transitionDelay = `${i * 0.035}s`;
      hc.classList.add("dealing");
      hc.style.transform = "";
      hc.style.opacity = "1";
      if (isSoundOn()) playDeal(i);
    });
    setTimeout(() => {
      cards.forEach((hc) => {
        hc.classList.remove("dealing");
        hc.style.transitionDelay = "";
      });
    }, cards.length * 35 + 500);
  }

  private updateHandSelection(me?: PublicParticipant): void {
    const mine = me?.vote ?? null;
    for (const [value, hc] of this.handCards) {
      hc.classList.toggle("selected", value === mine);
    }
  }

  private attachCardInput(hc: HTMLElement, value: CardId): void {
    let startX = 0;
    let startY = 0;
    let dragging = false;
    let pointerId = -1;

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging && Math.hypot(dx, dy) > 8) {
        if (this.handEl.classList.contains("locked")) return;
        dragging = true;
        hc.classList.add("dragging");
      }
      if (dragging) {
        hc.style.setProperty("--drag-x", `${e.clientX}px`);
        hc.style.setProperty("--drag-y", `${e.clientY}px`);
      }
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      hc.removeEventListener("pointermove", onMove);
      hc.removeEventListener("pointerup", onUp);
      hc.removeEventListener("pointercancel", onUp);
      try {
        hc.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      const wasDragging = dragging;
      dragging = false;
      hc.classList.remove("dragging");
      hc.style.removeProperty("--drag-x");
      hc.style.removeProperty("--drag-y");
      if (this.handEl.classList.contains("locked")) return;

      const handTop = this.handEl.getBoundingClientRect().top;
      if (wasDragging) {
        if (e.clientY < handTop + 20) this.select(value);
      } else {
        this.toggleSelect(value);
      }
    };

    hc.addEventListener("pointerdown", (e) => {
      const pe = e as PointerEvent;
      if (this.handEl.classList.contains("locked")) return;
      pointerId = pe.pointerId;
      startX = pe.clientX;
      startY = pe.clientY;
      dragging = false;
      try {
        hc.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      hc.addEventListener("pointermove", onMove);
      hc.addEventListener("pointerup", onUp);
      hc.addEventListener("pointercancel", onUp);
      unlockAudio();
    });

    hc.addEventListener("pointerenter", () => {
      if (!this.handEl.classList.contains("locked") && isSoundOn()) playHover();
    });
  }

  private select(value: CardId): void {
    this.net.send({ type: "select", value });
    if (isSoundOn()) playSelect();
  }

  private toggleSelect(value: CardId): void {
    const current = this.snapshot?.participants.find((p) => p.isYou)?.vote ?? null;
    if (current === value) {
      this.net.send({ type: "select", value: null });
    } else {
      this.net.send({ type: "select", value });
      if (isSoundOn()) playSelect();
    }
  }

  private doReveal(): void {
    if (this.revealBtn.disabled) return;
    this.net.send({ type: "reveal" });
    this.squish(this.revealBtn);
  }

  private doClear(): void {
    this.net.send({ type: "clear" });
    this.squish(this.clearBtn);
  }

  // ---- Effects ------------------------------------------------------------
  private floatChip(anchor: HTMLElement, text: string): void {
    const r = anchor.getBoundingClientRect();
    const chip = el("div", { class: "float-chip", text: `+${text}` });
    chip.style.left = `${r.left + r.width / 2}px`;
    chip.style.top = `${r.top}px`;
    document.body.append(chip);
    setTimeout(() => chip.remove(), 900);
  }

  private comboPop(step: number): void {
    const pop = el("div", { class: "combo-pop", text: `COMBO ×${step + 1}` });
    this.tableEl.append(pop);
    setTimeout(() => pop.remove(), 900);
  }

  private pulse(node: HTMLElement | null): void {
    if (!node) return;
    node.classList.remove("pulse");
    void node.offsetWidth;
    node.classList.add("pulse");
  }

  private squish(node: HTMLElement): void {
    node.classList.remove("squish");
    void node.offsetWidth;
    node.classList.add("squish");
  }

  private shake(intensity: number): void {
    this.tableEl.style.setProperty("--shake", `${intensity}px`);
    this.tableEl.classList.remove("shaking");
    void this.tableEl.offsetWidth;
    this.tableEl.classList.add("shaking");
    setTimeout(() => this.tableEl.classList.remove("shaking"), 300);
  }

  private celebrate(): void {
    if (isSoundOn()) playFanfare();
    const banner = el("div", { class: "consensus-banner" }, [
      el("div", { class: "cb-title", text: "CONSENSUS!" }),
      el("div", { class: "cb-sub", text: "Everyone agrees ★" }),
    ]);
    this.tableEl.append(banner);
    setTimeout(() => banner.remove(), 2600);
    this.confetti();
    this.shake(4);
  }

  private confetti(): void {
    const colors = ["#e5484d", "#2ca24e", "#3b82e0", "#f0c14b", "#ffffff"];
    for (let i = 0; i < 90; i++) {
      const c = el("div", { class: "confetti" });
      c.style.left = `${Math.random() * 100}%`;
      c.style.background = colors[i % colors.length];
      c.style.animationDelay = `${Math.random() * 0.4}s`;
      c.style.animationDuration = `${1.4 + Math.random() * 1.4}s`;
      c.style.setProperty("--drift", `${(Math.random() - 0.5) * 240}px`);
      this.tableEl.append(c);
      setTimeout(() => c.remove(), 3200);
    }
  }

  // ---- Modals / misc ------------------------------------------------------
  private editName(): void {
    const me = this.snapshot?.participants.find((p) => p.isYou);
    const current = me?.name ?? getName();
    const input = el("input", {
      class: "id-name-input",
      type: "text",
      value: current,
      maxlength: 22,
    }) as HTMLInputElement;
    this.idName.replaceWith(input);
    input.focus();
    input.select();
    let done = false;
    const restore = () => {
      if (input.isConnected) input.replaceWith(this.idName);
    };
    const commit = () => {
      if (done) return;
      done = true;
      input.removeEventListener("blur", commit);
      const v = input.value.trim() || current;
      setName(v);
      this.net.send({ type: "setName", name: v });
      this.idName.textContent = v;
      restore();
    };
    input.addEventListener("keydown", (e) => {
      const key = (e as KeyboardEvent).key;
      if (key === "Enter") commit();
      else if (key === "Escape") {
        done = true;
        input.removeEventListener("blur", commit);
        restore();
      }
    });
    input.addEventListener("blur", commit);
  }

  private openOptions(): void {
    const link = location.href;
    const soundRow = el("button", {
      class: "opt-row",
      text: `Sound: ${isSoundOn() ? "ON" : "OFF"}`,
      on: {
        click: (e) => {
          const on = toggleSound();
          (e.currentTarget as HTMLElement).textContent = `Sound: ${on ? "ON" : "OFF"}`;
        },
      },
    });
    const copyRow = el("button", {
      class: "opt-row",
      text: "Copy Invite Link",
      on: {
        click: () => {
          navigator.clipboard?.writeText(link).then(
            () => this.toast("Invite link copied!"),
            () => this.toast(link),
          );
        },
      },
    });
    const renameRow = el("button", {
      class: "opt-row",
      text: "Rename Yourself",
      on: {
        click: () => {
          this.closeModal();
          this.editName();
        },
      },
    });
    this.modal("Options", [
      el("div", { class: "opt-list" }, [soundRow, copyRow, renameRow]),
      el("div", { class: "opt-code", text: `Room code: ${this.code}` }),
    ]);
  }

  private openRunInfo(): void {
    this.modal("How To Play", [
      el("ul", { class: "howto" }, [
        el("li", { html: "Drag a card up onto the table — or tap it — to cast your estimate." }),
        el("li", { html: "Everyone's card stays <b>face-down</b> until someone hits <b>Reveal Cards</b>." }),
        el("li", { html: "Matching cards <b>combo</b> like a poker hand. All-agree = <b>Consensus!</b>" }),
        el("li", { html: "<b>Story Point</b> is the average of numeric votes (☕ and ? abstain)." }),
        el("li", { html: "Hit <b>Clear Cards</b> to start the next round." }),
      ]),
      el("div", { class: "howto-foot", text: "Anyone can reveal or clear. Share the room code to invite others." }),
    ]);
  }

  private modal(title: string, body: (Node | string)[]): void {
    this.closeModal();
    const overlay = el(
      "div",
      {
        class: "overlay",
        on: {
          click: (e) => {
            if (e.target === e.currentTarget) this.closeModal();
          },
        },
      },
      [
        el("div", { class: "modal" }, [
          el("div", { class: "modal-head" }, [
            el("div", { class: "modal-title", text: title }),
            el("button", {
              class: "modal-close",
              text: "✕",
              on: { click: () => this.closeModal() },
            }),
          ]),
          el("div", { class: "modal-body" }, body),
        ]),
      ],
    );
    overlay.dataset.role = "overlay";
    document.body.append(overlay);
  }

  private closeModal(): void {
    document.querySelector('[data-role="overlay"]')?.remove();
  }

  private toast(text: string): void {
    const t = el("div", { class: "toast", text });
    document.body.append(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 300);
    }, 2200);
  }

  private setStatus(status: "connecting" | "open" | "closed"): void {
    this.connDot.dataset.status = status;
    this.connDot.title = status;
  }
}
