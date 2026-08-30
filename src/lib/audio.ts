/* =====================================================================
 * Sound.
 *
 * Every sound in the game is synthesised here, at runtime, from
 * oscillators and filtered noise. Nothing is loaded, because the project
 * ships no audio files: a recorded engine is a licensing question and
 * several megabytes on a static deployment, and neither belongs in a
 * management sim where the sound is punctuation rather than the point.
 *
 * What that buys, besides the download: the engine note is a real
 * function of revs, so it rises and falls with the car rather than
 * looping a sample, and the whole thing is one file with no assets to
 * keep in step.
 *
 * Two rules hold throughout:
 *
 *   - the browser will not let audio start before a gesture, so the
 *     context is created lazily on the first real interaction and every
 *     call before that is a silent no-op rather than an error
 *   - the player's volume and mute survive a reload, because a game that
 *     forgets you turned it off is a game you turn off at the tab
 * ===================================================================== */

export type SoundId =
  /* --- interface ---------------------------------------------------- */
  | 'click'
  | 'confirm'
  | 'refuse'
  | 'notify'
  /* --- the garage --------------------------------------------------- */
  | 'build'
  | 'fit'
  /* --- the weekend -------------------------------------------------- */
  | 'lights'
  | 'lightsOut'
  | 'pitStop'
  | 'overtake'
  | 'radio'
  | 'fastestLap'
  | 'chequered'
  | 'retirement';

const STORAGE_KEY = 'mm.audio';

interface AudioPrefs {
  muted: boolean;
  /** 0-1, the player's own master level. */
  volume: number;
}

const DEFAULT_PREFS: AudioPrefs = { muted: false, volume: 0.55 };

function readPrefs(): AudioPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<AudioPrefs>;
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : DEFAULT_PREFS.muted,
      volume:
        typeof parsed.volume === 'number' && parsed.volume >= 0 && parsed.volume <= 1
          ? parsed.volume
          : DEFAULT_PREFS.volume,
    };
  } catch {
    /* Private windows and blocked site data both throw here. Sound is not
     * worth failing a render over. */
    return { ...DEFAULT_PREFS };
  }
}

function writePrefs(prefs: AudioPrefs): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Nothing to do; the setting simply will not survive the reload.
  }
}

let prefs = readPrefs();
let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;

const listeners = new Set<(prefs: AudioPrefs) => void>();

function announce(): void {
  for (const listener of listeners) listener({ ...prefs });
}

/** Subscribe to volume and mute changes. Returns the unsubscribe. */
export function onAudioPrefs(listener: (prefs: AudioPrefs) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function audioPrefs(): AudioPrefs {
  return { ...prefs };
}

/**
 * Brings the audio context up. Safe to call repeatedly, and must be
 * called from inside a user gesture the first time — every browser
 * refuses to start audio otherwise.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;

  if (!ctx) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    try {
      ctx = new Ctor();
    } catch {
      return;
    }

    master = ctx.createGain();
    master.gain.value = prefs.muted ? 0 : prefs.volume;
    master.connect(ctx.destination);

    /* One second of white noise, reused for everything percussive: the
     * wheel guns, the tyre squeal, the crowd. Generating it once is the
     * difference between a click costing nothing and costing a
     * millisecond of maths. */
    const frames = ctx.sampleRate;
    noiseBuffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const channel = noiseBuffer.getChannelData(0);
    for (let i = 0; i < frames; i++) channel[i] = Math.random() * 2 - 1;
  }

  if (ctx.state === 'suspended') void ctx.resume();
}

export function setVolume(volume: number): void {
  prefs = { ...prefs, volume: Math.max(0, Math.min(1, volume)) };
  writePrefs(prefs);
  if (master && ctx) {
    master.gain.setTargetAtTime(prefs.muted ? 0 : prefs.volume, ctx.currentTime, 0.02);
  }
  announce();
}

export function setMuted(muted: boolean): void {
  prefs = { ...prefs, muted };
  writePrefs(prefs);
  if (master && ctx) {
    master.gain.setTargetAtTime(muted ? 0 : prefs.volume, ctx.currentTime, 0.02);
  }
  announce();
}

export function toggleMuted(): void {
  setMuted(!prefs.muted);
}

/* ---------------------------- the primitives --------------------------- */

interface ToneOptions {
  /** Hz at the start. */
  from: number;
  /** Hz at the end; omitted holds the pitch. */
  to?: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  /** Seconds from now. */
  delay?: number;
}

function tone(options: ToneOptions): void {
  if (!ctx || !master || prefs.muted) return;

  const now = ctx.currentTime + (options.delay ?? 0);
  const { from, to = options.from, duration, type = 'sine', gain = 0.2 } = options;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, now);
  if (to !== from) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), now + duration);

  /* A short attack and an exponential tail: anything with a hard edge on
   * either end clicks, and a click on every UI sound is what makes an
   * interface exhausting. */
  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + Math.min(0.02, duration * 0.2));
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(envelope);
  envelope.connect(master);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

interface NoiseOptions {
  duration: number;
  gain?: number;
  /** Band-pass centre in Hz. */
  frequency?: number;
  q?: number;
  delay?: number;
}

function noise(options: NoiseOptions): void {
  if (!ctx || !master || !noiseBuffer || prefs.muted) return;

  const now = ctx.currentTime + (options.delay ?? 0);
  const { duration, gain = 0.15, frequency = 1800, q = 1.2 } = options;

  const source = ctx.createBufferSource();
  source.buffer = noiseBuffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = frequency;
  filter.Q.value = q;

  const envelope = ctx.createGain();
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(gain, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(master);
  source.start(now);
  source.stop(now + duration + 0.02);
}

/* ------------------------------ the sounds ----------------------------- */

/**
 * One shot per event.
 *
 * Every one of these is deliberately short. A management screen is a
 * place people spend an hour, and anything longer than a couple of
 * hundred milliseconds becomes something they mute rather than something
 * they notice.
 */
export function playSound(id: SoundId): void {
  if (!ctx || prefs.muted) return;

  switch (id) {
    /* --- interface -------------------------------------------------- */
    case 'click':
      tone({ from: 620, to: 540, duration: 0.05, type: 'triangle', gain: 0.06 });
      break;
    case 'confirm':
      // A rising third: the shape every interface uses for "yes", because
      // it is the one people already read as yes.
      tone({ from: 540, duration: 0.09, type: 'sine', gain: 0.11 });
      tone({ from: 810, duration: 0.13, type: 'sine', gain: 0.1, delay: 0.07 });
      break;
    case 'refuse':
      tone({ from: 260, to: 180, duration: 0.16, type: 'sawtooth', gain: 0.09 });
      break;
    case 'notify':
      tone({ from: 880, duration: 0.07, type: 'sine', gain: 0.09 });
      tone({ from: 1170, duration: 0.11, type: 'sine', gain: 0.08, delay: 0.08 });
      break;

    /* --- the garage ------------------------------------------------- */
    case 'build':
      /* An impact wrench: a burst of filtered noise with a pitch drop
       * under it, which is most of what a wheel gun sounds like. */
      noise({ duration: 0.09, gain: 0.13, frequency: 2600, q: 0.8 });
      noise({ duration: 0.07, gain: 0.1, frequency: 2200, q: 0.9, delay: 0.1 });
      tone({ from: 190, to: 130, duration: 0.16, type: 'square', gain: 0.05 });
      break;
    case 'fit':
      noise({ duration: 0.06, gain: 0.11, frequency: 3200, q: 1.4 });
      tone({ from: 700, to: 940, duration: 0.1, type: 'triangle', gain: 0.08, delay: 0.04 });
      break;

    /* --- the weekend ------------------------------------------------ */
    case 'lights':
      // One of the five red lights coming on.
      tone({ from: 440, duration: 0.16, type: 'square', gain: 0.1 });
      break;
    case 'lightsOut':
      /* Lights out: the low note the whole grid is waiting for, then the
       * field going away from you. */
      tone({ from: 300, to: 150, duration: 0.5, type: 'sawtooth', gain: 0.16 });
      noise({ duration: 0.85, gain: 0.09, frequency: 420, q: 0.5, delay: 0.05 });
      break;
    case 'pitStop':
      // Four guns, roughly together, the way they actually sound.
      for (let i = 0; i < 4; i++) {
        noise({ duration: 0.07, gain: 0.1, frequency: 2400 + i * 220, q: 0.9, delay: i * 0.045 });
      }
      break;
    case 'overtake':
      tone({ from: 420, to: 760, duration: 0.18, type: 'triangle', gain: 0.1 });
      break;
    case 'radio':
      // The squelch that opens a radio channel.
      noise({ duration: 0.045, gain: 0.07, frequency: 1500, q: 3 });
      tone({ from: 1500, duration: 0.05, type: 'square', gain: 0.045, delay: 0.03 });
      break;
    case 'fastestLap':
      tone({ from: 780, duration: 0.08, type: 'sine', gain: 0.1 });
      tone({ from: 1040, duration: 0.08, type: 'sine', gain: 0.1, delay: 0.07 });
      tone({ from: 1560, duration: 0.16, type: 'sine', gain: 0.11, delay: 0.14 });
      break;
    case 'chequered':
      tone({ from: 660, duration: 0.12, type: 'triangle', gain: 0.12 });
      tone({ from: 880, duration: 0.12, type: 'triangle', gain: 0.12, delay: 0.11 });
      tone({ from: 1320, duration: 0.34, type: 'triangle', gain: 0.13, delay: 0.22 });
      break;
    case 'retirement':
      // A engine dying: pitch falling away with the noise floor under it.
      tone({ from: 340, to: 70, duration: 0.75, type: 'sawtooth', gain: 0.12 });
      noise({ duration: 0.4, gain: 0.05, frequency: 300, q: 0.6, delay: 0.1 });
      break;
    default:
      break;
  }
}

/* ------------------------------ the engine ----------------------------- */

/**
 * The car, held as a continuous note rather than fired as events.
 *
 * A management game does not need a convincing V6, but it does need the
 * race screen to feel like it is running. Two detuned sawtooths through
 * a low-pass, with the pitch and the filter both following revs, is
 * enough to read as an engine at the far end of a pit lane — and it
 * costs three nodes rather than a megabyte.
 */
interface EngineVoice {
  setRevs(revs: number): void;
  stop(): void;
}

let engine: EngineVoice | null = null;

export function startEngine(): void {
  if (!ctx || !master || engine || prefs.muted) return;

  const primary = ctx.createOscillator();
  const detuned = ctx.createOscillator();
  primary.type = 'sawtooth';
  detuned.type = 'sawtooth';
  detuned.detune.value = 11;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 900;
  filter.Q.value = 1.1;

  const gain = ctx.createGain();
  // Deliberately well under the one-shots: this is a bed, not an event.
  gain.gain.value = 0.035;

  primary.connect(filter);
  detuned.connect(filter);
  filter.connect(gain);
  gain.connect(master);

  primary.start();
  detuned.start();

  engine = {
    setRevs(revs: number) {
      if (!ctx) return;
      const clamped = Math.max(0, Math.min(1, revs));
      const hz = 58 + clamped * 150;
      primary.frequency.setTargetAtTime(hz, ctx.currentTime, 0.09);
      detuned.frequency.setTargetAtTime(hz * 1.005, ctx.currentTime, 0.09);
      filter.frequency.setTargetAtTime(500 + clamped * 2200, ctx.currentTime, 0.12);
      gain.gain.setTargetAtTime(0.02 + clamped * 0.03, ctx.currentTime, 0.15);
    },
    stop() {
      if (!ctx) return;
      gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
      const at = ctx.currentTime + 0.5;
      primary.stop(at);
      detuned.stop(at);
    },
  };
}

export function setEngineRevs(revs: number): void {
  engine?.setRevs(revs);
}

export function stopEngine(): void {
  engine?.stop();
  engine = null;
}

/** True once the context exists, so the UI can show sound as live. */
export function audioReady(): boolean {
  return ctx !== null && ctx.state === 'running';
}
