import { el, mount } from "./dom";
import { createRoom, roomExists } from "./net";
import { getName, setName } from "./store";
import { playError, playSelect, unlockAudio } from "./sound";

export function renderLanding(
  root: HTMLElement,
  navigate: (code: string) => void,
): void {
  let creating = false;

  const nameInput = el("input", {
    class: "name-input",
    type: "text",
    value: getName(),
    maxlength: 22,
    placeholder: "your name",
  }) as HTMLInputElement;
  nameInput.addEventListener("change", () => {
    const v = nameInput.value.trim();
    if (v) setName(v);
  });

  const identity = el("div", { class: "landing-identity" }, [
    el("span", { class: "id-label", text: "YOU ARE" }),
    nameInput,
  ]);

  // ---- Create panel --------------------------------------------------------
  const createError = el("div", { class: "panel-error" });
  const roomNameInput = el("input", {
    class: "text-input",
    type: "text",
    maxlength: 40,
    placeholder: "e.g. Sprint 42 Grooming",
  }) as HTMLInputElement;

  const createForm = el("div", { class: "reveal-form hidden" }, [
    el("label", { class: "field-label", text: "ROOM NAME" }),
    roomNameInput,
    el("button", {
      class: "btn btn-blue btn-chunky",
      text: "Deal Me In",
      on: { click: () => void doCreate() },
    }),
  ]);

  const createBtn = el("button", {
    class: "btn btn-gold btn-chunky big",
    text: "Create Room",
    on: {
      click: () => {
        unlockAudio();
        playSelect();
        creating = true;
        createForm.classList.remove("hidden");
        createBtn.classList.add("hidden");
        roomNameInput.focus();
      },
    },
  });

  async function doCreate(): Promise<void> {
    const rn = roomNameInput.value.trim() || "Untitled Room";
    createBtn.disabled = true;
    createError.textContent = "";
    try {
      const { code } = await createRoom(rn);
      playSelect();
      navigate(code);
    } catch {
      playError();
      createError.textContent = "Couldn't create room. Try again.";
      createBtn.disabled = false;
    }
  }
  roomNameInput.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") void doCreate();
  });

  const createPanel = el("section", { class: "landing-panel create" }, [
    el("div", { class: "panel-badge", text: "＋" }),
    el("h2", { class: "panel-title", text: "New Table" }),
    el("p", { class: "panel-sub", text: "Start a fresh room and invite the crew." }),
    createBtn,
    createForm,
    createError,
  ]);

  // ---- Join panel ----------------------------------------------------------
  const joinError = el("div", { class: "panel-error" });
  const codeInput = el("input", {
    class: "text-input code",
    type: "text",
    maxlength: 12,
    placeholder: "ABCD",
  }) as HTMLInputElement;
  codeInput.addEventListener("input", () => {
    codeInput.value = codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  const joinBtn = el("button", {
    class: "btn btn-red btn-chunky big",
    text: "Join",
    on: { click: () => void doJoin() },
  });

  async function doJoin(): Promise<void> {
    unlockAudio();
    const code = codeInput.value.trim().toUpperCase();
    if (code.length < 2) {
      joinError.textContent = "Enter a room code.";
      playError();
      return;
    }
    joinBtn.disabled = true;
    joinError.textContent = "";
    try {
      const { exists } = await roomExists(code);
      if (!exists) {
        joinError.textContent = "Room not found. Check the code.";
        playError();
        joinBtn.disabled = false;
        return;
      }
      playSelect();
      navigate(code);
    } catch {
      joinError.textContent = "Network hiccup. Try again.";
      playError();
      joinBtn.disabled = false;
    }
  }
  codeInput.addEventListener("keydown", (e) => {
    if ((e as KeyboardEvent).key === "Enter") void doJoin();
  });

  const joinPanel = el("section", { class: "landing-panel join" }, [
    el("div", { class: "panel-badge", text: "⇢" }),
    el("h2", { class: "panel-title", text: "Join Table" }),
    el("p", { class: "panel-sub", text: "Got a code? Grab a seat." }),
    codeInput,
    joinBtn,
    joinError,
  ]);

  const header = el("header", { class: "landing-header" }, [
    el("div", { class: "logo-chip", text: "★" }),
    el("h1", { class: "landing-title" }, [
      el("span", { class: "t-word", text: "STORY" }),
      el("span", { class: "t-word accent", text: "POKER" }),
    ]),
    el("p", { class: "landing-tagline", text: "Planning poker, juiced." }),
  ]);

  const page = el("div", { class: "landing" }, [
    header,
    identity,
    el("div", { class: "landing-panels" }, [createPanel, joinPanel]),
    el("footer", { class: "landing-foot", text: "No login • No database • Just vibes ★" }),
  ]);

  mount(root, page);
  void creating;
}
