import "./styles.css";
import { renderLanding } from "./landing";
import { RoomView } from "./room";
import { applyCrt } from "./store";

applyCrt();

const app = document.getElementById("app") as HTMLElement;
let room: RoomView | null = null;

function parseCode(path: string): string | null {
  const m = path.match(/^\/room\/([A-Za-z0-9]{2,12})$/);
  return m ? m[1].toUpperCase() : null;
}

function boot(): void {
  if (room) {
    room.destroy();
    room = null;
  }
  const code = parseCode(location.pathname);
  if (code) {
    document.title = `Room ${code} · Scrumlatro`;
    room = new RoomView(app, code);
  } else {
    document.title = "Scrumlatro";
    renderLanding(app, (c) => {
      history.pushState({}, "", `/room/${c}`);
      boot();
    });
  }
}

window.addEventListener("popstate", boot);
boot();
