// Procedural retro sound via the Web Audio API — no audio files shipped.
import { getSoundOn, setSoundOn } from "./store";

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = getSoundOn();

function ac(): AudioContext | null {
  if (typeof AudioContext === "undefined") return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.32;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

/** Call from a user gesture so the AudioContext is allowed to start. */
export function unlockAudio(): void {
  ac();
}

export function isSoundOn(): boolean {
  return enabled;
}

export function toggleSound(): boolean {
  enabled = !enabled;
  setSoundOn(enabled);
  if (enabled) blip(660, 0.08, "triangle", 0.4);
  return enabled;
}

type Wave = OscillatorType;

function tone(
  freq: number,
  dur: number,
  wave: Wave,
  gain: number,
  when = 0,
  glideTo?: number,
): void {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = wave;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function noise(dur: number, gain: number, when = 0, hp = 800): void {
  const c = ac();
  if (!c || !master || !enabled) return;
  const t0 = c.currentTime + when;
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = hp;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

function blip(freq: number, dur: number, wave: Wave, gain: number): void {
  tone(freq, dur, wave, gain);
}

// --- public sound events ----------------------------------------------------

export function playHover(): void {
  tone(520, 0.05, "triangle", 0.12);
}

export function playSelect(): void {
  tone(720, 0.06, "square", 0.22);
  tone(1080, 0.05, "square", 0.12, 0.02);
}

export function playDeal(i = 0): void {
  noise(0.09, 0.25, i * 0.045, 1200);
  tone(300 + i * 12, 0.07, "sine", 0.1, i * 0.045);
}

export function playFlip(): void {
  noise(0.05, 0.18, 0, 1500);
  tone(880, 0.05, "square", 0.14);
}

/** Rising combo blip — pitch escalates with the stacking step. */
export function playCombo(step: number): void {
  const base = 440;
  const freq = base * Math.pow(2, Math.min(step, 12) / 12);
  tone(freq, 0.12, "square", 0.26, 0, freq * 1.5);
  tone(freq * 2, 0.1, "triangle", 0.1, 0.01);
}

export function playReveal(): void {
  tone(392, 0.14, "sawtooth", 0.16, 0, 523);
}

export function playClear(): void {
  noise(0.18, 0.22, 0, 600);
  tone(400, 0.16, "sine", 0.14, 0, 180);
}

export function playFanfare(): void {
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C E G C
  notes.forEach((n, i) => {
    tone(n, 0.28, "square", 0.24, i * 0.09);
    tone(n * 2, 0.24, "triangle", 0.08, i * 0.09);
  });
  tone(1318.5, 0.5, "square", 0.2, notes.length * 0.09);
}

export function playError(): void {
  tone(200, 0.18, "sawtooth", 0.2, 0, 120);
}
