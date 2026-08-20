// Tiny pixel-art engine: render an SVG sprite from an ASCII grid + palette.
// Each glyph maps to a colour; "." / " " are transparent. Horizontal runs of
// the same colour are merged into a single <rect> to keep node counts low.

const SVGNS = "http://www.w3.org/2000/svg";

export type Palette = Record<string, string>;

// ---- Sprites (cyber-jester + cyber-skull), 16 px wide grids ---------------
export const SPRITES: Record<string, string[]> = {
  jester: [
    "..y....y....y...",
    ".oyo..oyo..oyo..",
    ".mmm..ppp..ccc..",
    ".mmmm.ppp.cccc..",
    "..mmmpppppccc...",
    ".ommmpppppcccco.",
    ".offffffffffo...",
    ".offeeffeeffo...",
    ".offffffffffo...",
    ".offggggggffo...",
    ".offffffffffo...",
    "..offffffffo....",
    "..ocmcmcmcmco...",
    "...ooooooooo....",
  ],
  skull: [
    "...y........y...",
    "...o........o...",
    "....obbbbbbo....",
    "...obbbbbbbbo...",
    "..obbbbbbbbbbo..",
    "..obkkbbbbkkbo..",
    "..obkkbbbbkkbo..",
    "..obbbbmmbbbbo..",
    "..obbbbbbbbbbo..",
    "...obobobobo....",
    "...obobobobo....",
    "....obbbbbo.....",
    ".....oooooo.....",
  ],
};

// ---- Palettes -------------------------------------------------------------
export const PALETTES: Record<string, Palette> = {
  jesterPrime: {
    y: "#ffd23c",
    o: "#0a0a14",
    m: "#ff45e1",
    c: "#34e2ff",
    p: "#a24bff",
    f: "#241246",
    e: "#5effc8",
    g: "#eafcff",
  },
  jesterAcid: {
    y: "#eaff6b",
    o: "#08140c",
    m: "#39ff88",
    c: "#c6ff3d",
    p: "#39ffcf",
    f: "#0f2a1a",
    e: "#eaff9b",
    g: "#f0ffe0",
  },
  jesterEmber: {
    y: "#ffd23c",
    o: "#160808",
    m: "#ff5a3c",
    c: "#ffb43c",
    p: "#ff3c6e",
    f: "#2a1010",
    e: "#ffd24b",
    g: "#fff0e0",
  },
  skullCyber: {
    o: "#0a0a14",
    b: "#cfe8ff",
    k: "#ff45e1",
    m: "#34e2ff",
  },
  skullIce: {
    o: "#08101c",
    b: "#bfe0ff",
    k: "#3cc8ff",
    m: "#7ca7ff",
  },
};

export function pixelSprite(rows: string[], palette: Palette): SVGSVGElement {
  const h = rows.length;
  const w = Math.max(...rows.map((r) => r.length));
  const svg = document.createElementNS(SVGNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.setAttribute("shape-rendering", "crispEdges");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
  for (let y = 0; y < h; y++) {
    const row = rows[y];
    let x = 0;
    while (x < w) {
      const ch = row[x] ?? " ";
      const color = palette[ch];
      if (!color) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < w && row[x + run] === ch) run++;
      const rect = document.createElementNS(SVGNS, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(run));
      rect.setAttribute("height", "1");
      rect.setAttribute("fill", color);
      svg.appendChild(rect);
      x += run;
    }
  }
  return svg;
}

export function spriteEl(sprite: string, palette: string, cls = "pix-sprite"): SVGSVGElement {
  const svg = pixelSprite(SPRITES[sprite] ?? SPRITES.jester, PALETTES[palette] ?? PALETTES.jesterPrime);
  svg.setAttribute("class", cls);
  return svg;
}
