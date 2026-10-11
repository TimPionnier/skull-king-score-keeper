/**
 * Ambiance sonore pirate, entièrement synthétisée avec Web Audio (aucun fichier à charger) :
 *  - thème de fond : petite mélodie de chanson de marin, en boucle
 *  - pièce d'or : tintement sur chaque bouton
 *  - « Yo-Ho-Ho ! » : voix grave de pirate pour l'annonce des paris
 */

const SOUND_KEY = "skull-king:sound";

const MUSIC_VOLUME = 0.16;
const MUSIC_DUCKED_VOLUME = 0.04;
const SFX_VOLUME = 0.8;
const FADE_SECONDS = 0.4;

const STEP_SECONDS = 0.24;
const SCHEDULER_INTERVAL_MS = 100;
const SCHEDULE_AHEAD_SECONDS = 0.5;
const STEPS_PER_BAR = 6;

// Demi-tons au-dessus de Ré (mode dorien), un temps = une croche, mesure à 6/8. null = silence.
const MELODY = [
  0, null, 0, 3, 7, null,
  5, null, 3, 2, 0, null,
  0, 0, 3, 7, 10, 7,
  5, 3, 2, 0, null, null,
];
const BASS_ROOTS = [0, 5, 0, 7];
const D4_MIDI = 62;
const D2_MIDI = 38;
const BASS_FIFTH_STEP = 3;
const BASS_FIFTH_INTERVAL = 7;

const VOWEL_O_FORMANTS = [520, 920];
const VOWEL_I_FORMANTS = [320, 2200];

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let muted = readMuted();
let schedulerId = null;
let nextStepTime = 0;
let stepIndex = 0;
let listeners = new Set();
let gestureBound = false;

function readMuted() {
  try { return localStorage.getItem(SOUND_KEY) === "off"; } catch { return false; }
}

function midiToHz(midi) {
  return 440 * 2 ** ((midi - 69) / 12);
}

function ensureContext() {
  if (ctx) return ctx;
  const AudioCtor = window.AudioContext ?? window.webkitAudioContext;
  if (!AudioCtor) return null;
  ctx = new AudioCtor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_VOLUME;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(master);
  return ctx;
}

function isReady() {
  return !muted && ensureContext() !== null && ctx.state === "running";
}

/* ---------- musique de fond ---------- */

function playPluck(time, midi, { type, gain, length }) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.value = midiToHz(midi);
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(gain, time + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.connect(amp).connect(musicBus);
  osc.start(time);
  osc.stop(time + length + 0.05);
}

function scheduleStep(time, step) {
  const note = MELODY[step % MELODY.length];
  if (note !== null) playPluck(time, D4_MIDI + note, { type: "triangle", gain: 0.5, length: STEP_SECONDS * 1.6 });

  const bar = Math.floor(step / STEPS_PER_BAR) % BASS_ROOTS.length;
  const stepInBar = step % STEPS_PER_BAR;
  if (stepInBar === 0) playPluck(time, D2_MIDI + BASS_ROOTS[bar], { type: "sawtooth", gain: 0.35, length: STEP_SECONDS * 2.4 });
  if (stepInBar === BASS_FIFTH_STEP) {
    playPluck(time, D2_MIDI + BASS_ROOTS[bar] + BASS_FIFTH_INTERVAL, { type: "sawtooth", gain: 0.25, length: STEP_SECONDS * 2 });
  }
}

function runScheduler() {
  while (nextStepTime < ctx.currentTime + SCHEDULE_AHEAD_SECONDS) {
    scheduleStep(nextStepTime, stepIndex);
    nextStepTime += STEP_SECONDS;
    stepIndex = (stepIndex + 1) % MELODY.length;
  }
}

function startMusic() {
  if (schedulerId !== null || !isReady()) return;
  nextStepTime = ctx.currentTime + 0.1;
  schedulerId = setInterval(runScheduler, SCHEDULER_INTERVAL_MS);
  runScheduler();
}

function stopMusic() {
  if (schedulerId === null) return;
  clearInterval(schedulerId);
  schedulerId = null;
}

/** Baisse la musique le temps d'un effet important (ex. le Yo-Ho-Ho). */
export function duckMusic(seconds) {
  if (!ctx) return;
  const now = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(now);
  musicBus.gain.setTargetAtTime(MUSIC_DUCKED_VOLUME, now, 0.1);
  musicBus.gain.setTargetAtTime(MUSIC_VOLUME, now + seconds, 0.3);
}

/* ---------- pièce d'or ---------- */

export function playCoin() {
  if (!isReady()) return;
  const now = ctx.currentTime;
  // Deux tintements rapprochés : l'attaque de la pièce puis son rebond.
  [
    { delay: 0, base: 1760 },
    { delay: 0.07, base: 2349 },
  ].forEach(({ delay, base }) => {
    const start = now + delay;
    // Partiels inharmoniques : c'est ce qui donne le timbre métallique.
    [1, 2.76, 5.4].forEach((ratio, i) => {
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = base * ratio;
      const peak = 0.28 / (i + 1);
      amp.gain.setValueAtTime(0.0001, start);
      amp.gain.exponentialRampToValueAtTime(peak, start + 0.005);
      amp.gain.exponentialRampToValueAtTime(0.0001, start + 0.28 / (i + 1) + 0.08);
      osc.connect(amp).connect(sfxBus);
      osc.start(start);
      osc.stop(start + 0.4);
    });
  });
}

/* ---------- Yo-Ho-Ho ---------- */

function createBreath(time, length) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  noise.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.value = 1800;
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(0.25, time + length * 0.4);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  noise.connect(filter).connect(amp).connect(sfxBus);
  noise.start(time);
}

/**
 * Voix grave de pirate par synthèse à formants : une onde en dent de scie passée dans deux filtres
 * passe-bande qui imitent la voyelle « o ».
 */
function sing({ hz, endHz, length, startVowel, breath }) {
  const start = ctx.currentTime + (breath ? 0.06 : 0);
  if (breath) createBreath(ctx.currentTime, 0.1);

  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const vibratoDepth = ctx.createGain();
  const amp = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(hz, start);
  osc.frequency.exponentialRampToValueAtTime(endHz, start + length);
  vibrato.frequency.value = 5.5;
  vibratoDepth.gain.value = hz * 0.015;
  vibrato.connect(vibratoDepth).connect(osc.frequency);

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(0.9, start + 0.06);
  amp.gain.setValueAtTime(0.9, start + length * 0.65);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);

  VOWEL_O_FORMANTS.forEach((target, i) => {
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 6;
    filter.frequency.setValueAtTime(startVowel ? VOWEL_I_FORMANTS[i] : target, start);
    filter.frequency.exponentialRampToValueAtTime(target, start + length * 0.35);
    const formantGain = ctx.createGain();
    formantGain.gain.value = i === 0 ? 1 : 0.6;
    osc.connect(filter).connect(formantGain).connect(amp);
  });

  amp.connect(sfxBus);
  osc.start(start);
  vibrato.start(start);
  osc.stop(start + length + 0.05);
  vibrato.stop(start + length + 0.05);
}

const YO_HO_STEPS = {
  1: { hz: 147, endHz: 139, length: 0.5, startVowel: true, breath: false },
  2: { hz: 123, endHz: 117, length: 0.5, startVowel: false, breath: true },
  3: { hz: 98, endHz: 82, length: 0.8, startVowel: false, breath: true },
};

/** Étapes 1 à 3 : « Yo », « Ho », « Ho ! ». Étape 4 : coup de tambour pour « Montrez vos paris ». */
export function playYoHo(step) {
  if (!isReady()) return;
  if (step === 1) duckMusic(3);
  const voice = YO_HO_STEPS[step];
  if (voice) {
    sing(voice);
    return;
  }
  playDrum();
}

function playDrum() {
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.25);
  amp.gain.setValueAtTime(1, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
  osc.connect(amp).connect(sfxBus);
  osc.start(now);
  osc.stop(now + 0.45);
}

/* ---------- activation / coupure ---------- */

function notify() {
  listeners.forEach((listener) => listener(muted));
}

export function isMuted() {
  return muted;
}

export function subscribeMuted(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setMuted(next) {
  muted = next;
  try { localStorage.setItem(SOUND_KEY, next ? "off" : "on"); } catch { /* stockage indisponible */ }
  notify();
  if (next) {
    if (master) master.gain.setTargetAtTime(0, ctx.currentTime, FADE_SECONDS / 3);
    stopMusic();
    return;
  }
  if (!ensureContext()) return;
  ctx.resume().then(() => {
    master.gain.setTargetAtTime(1, ctx.currentTime, FADE_SECONDS / 3);
    startMusic();
  });
}

/**
 * Les navigateurs interdisent le son avant un geste de l'utilisateur : on attend le premier toucher,
 * puis chaque bouton déclenche le tintement de pièce. Retourne la fonction de nettoyage.
 */
export function bindAudio() {
  if (gestureBound) return () => {};
  gestureBound = true;

  const onPointerDown = (event) => {
    if (muted) return;
    const context = ensureContext();
    if (!context) return;
    const button = event.target instanceof Element ? event.target.closest("button") : null;
    const isActiveButton = button !== null && !button.disabled;
    context.resume().then(() => {
      startMusic();
      if (isActiveButton) playCoin();
    });
  };
  const onVisibility = () => {
    if (!ctx || muted) return;
    if (document.hidden) {
      stopMusic();
      return;
    }
    startMusic();
  };

  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("visibilitychange", onVisibility);
  return () => {
    gestureBound = false;
    document.removeEventListener("pointerdown", onPointerDown, true);
    document.removeEventListener("visibilitychange", onVisibility);
    stopMusic();
  };
}
