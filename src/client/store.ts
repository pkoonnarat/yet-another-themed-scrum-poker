// Local identity + preferences.
//   clientId  -> sessionStorage (per-tab, so two tabs = two players, but a
//                reload keeps identity for reconnect).
//   name      -> localStorage (shared across tabs; the user's preferred name).
//   soundOn   -> localStorage.

const ADJ = [
  "Nimble",
  "Cosmic",
  "Sneaky",
  "Turbo",
  "Velvet",
  "Rowdy",
  "Mellow",
  "Zesty",
  "Pixel",
  "Lucky",
];
const NOUN = [
  "Otter",
  "Sprinter",
  "Goblin",
  "Wizard",
  "Penguin",
  "Comet",
  "Yak",
  "Raccoon",
  "Mantis",
  "Wombat",
];

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

function randomName(): string {
  return `${pick(ADJ)} ${pick(NOUN)}`;
}

function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) +
    Math.random().toString(36).slice(2, 6)
  );
}

export function getClientId(): string {
  let id = sessionStorage.getItem("sp_clientId");
  if (!id) {
    id = uid();
    sessionStorage.setItem("sp_clientId", id);
  }
  return id;
}

export function getName(): string {
  let name = localStorage.getItem("sp_name");
  if (!name) {
    name = randomName();
    localStorage.setItem("sp_name", name);
  }
  return name;
}

export function setName(name: string): void {
  localStorage.setItem("sp_name", name.slice(0, 22));
}

export function getSoundOn(): boolean {
  return localStorage.getItem("sp_sound") !== "off";
}

export function setSoundOn(on: boolean): void {
  localStorage.setItem("sp_sound", on ? "on" : "off");
}
