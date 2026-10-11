/**
 * Ambiance sonore pirate, entièrement synthétisée avec Web Audio (aucun fichier à charger) :
 *  - thème de fond : mélodie sombre en ré mineur, nappe de cordes, tambour de guerre et réverbération
 *  - pièces d'or : plusieurs tintements métalliques qui s'entrechoquent sur chaque bouton
 *  - « Yo-Ho-Ho ! » : voix grave de pirate pour l'annonce des paris
 */

const SOUND_KEY = "skull-king:sound";

const MUSIC_VOLUME = 0.2;
const MUSIC_DUCKED_VOLUME = 0.05;
const SFX_VOLUME = 0.8;
const FADE_SECONDS = 0.4;
const REVERB_SECONDS = 2.8;
const REVERB_SEND = 0.45;

const STEP_SECONDS = 0.4;
const SCHEDULER_INTERVAL_MS = 100;
const SCHEDULE_AHEAD_SECONDS = 0.8;
const STEPS_PER_BAR = 6;

// Demi-tons au-dessus de Ré4 (ré mineur harmonique : le do dièse tend la cadence), une croche par pas.
// Un pas à null prolonge la note précédente.
const MELODY = [
  7, null, null, 8, null, 7,
  5, null, null, 3, null, 0,
  8, null, null, 7, null, 5,
  -1, null, null, 2, null, null,
  12, null, null, 10, null, 8,
  8, null, null, 7, null, 5,
  5, null, null, 2, null, -1,
  0, null, null, null, null, null,
];
// Fondamentale de chaque mesure (Dm, Dm, Si bémol, La, Dm, Sol m, La, Dm), en demi-tons au-dessus de Ré2.
const BAR_ROOTS = [0, 0, -4, 7, 0, 5, 7, 0];
const D4_MIDI = 62;
const D2_MIDI = 38;
const FIFTH_INTERVAL = 7;
const LAST_BAR_INDEX = BAR_ROOTS.length - 1;

const LEAD_CUTOFF_HZ = 1300;
const PAD_CUTOFF_HZ = 520;
const PAD_ATTACK_SECONDS = 0.7;
const DRUM_HIT_GAIN = 0.9;
const DRUM_SOFT_GAIN = 0.45;
const SOFT_DRUM_STEP = 3;

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

/** Réponse impulsionnelle synthétique : du bruit qui s'éteint, pour donner l'effet d'une grande salle. */
function createReverbImpulse() {
  const length = Math.ceil(ctx.sampleRate * REVERB_SECONDS);
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** 3;
  }
  return impulse;
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
  const reverb = ctx.createConvolver();
  const reverbSend = ctx.createGain();
  reverb.buffer = createReverbImpulse();
  reverbSend.gain.value = REVERB_SEND;
  musicBus.connect(reverbSend).connect(reverb).connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(master);
  return ctx;
}

function isReady() {
  return !muted && ensureContext() !== null && ctx.state === "running";
}

/* ---------- musique de fond ---------- */

function playLead(time, midi, length) {
  const osc = ctx.createOscillator();
  const vibrato = ctx.createOscillator();
  const vibratoDepth = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.value = midiToHz(midi);
  vibrato.frequency.value = 5;
  vibratoDepth.gain.value = midiToHz(midi) * 0.008;
  vibrato.connect(vibratoDepth).connect(osc.frequency);
  filter.type = "lowpass";
  filter.frequency.value = LEAD_CUTOFF_HZ;
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(0.4, time + 0.12);
  amp.gain.setValueAtTime(0.4, time + length * 0.7);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  osc.connect(filter).connect(amp).connect(musicBus);
  osc.start(time);
  vibrato.start(time);
  osc.stop(time + length + 0.05);
  vibrato.stop(time + length + 0.05);
}

/** Nappe de cordes : deux ondes légèrement désaccordées, filtrées, avec une attaque lente. */
function playPad(time, midi, length) {
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  filter.type = "lowpass";
  filter.frequency.value = PAD_CUTOFF_HZ;
  amp.gain.setValueAtTime(0.0001, time);
  amp.gain.exponentialRampToValueAtTime(0.5, time + PAD_ATTACK_SECONDS);
  amp.gain.setValueAtTime(0.5, time + length - PAD_ATTACK_SECONDS);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  filter.connect(amp).connect(musicBus);
  [-6, 6].forEach((detuneCents) => {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = midiToHz(midi);
    osc.detune.value = detuneCents;
    osc.connect(filter);
    osc.start(time);
    osc.stop(time + length + 0.05);
  });
}

/** Tambour de guerre : une chute de fréquence très grave et un souffle de peau. */
function playWarDrum(time, gain) {
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(95, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.3);
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
  osc.connect(amp).connect(musicBus);
  osc.start(time);
  osc.stop(time + 0.75);
  createNoiseBurst(time, 0.08, { type: "lowpass", frequency: 400, gain: gain * 0.5, destination: musicBus });
}

/** Durée d'une note de mélodie : jusqu'à la prochaine attaque. */
function noteLengthSteps(step) {
  let length = 1;
  while (MELODY[(step + length) % MELODY.length] === null) length += 1;
  return length;
}

function scheduleStep(time, step) {
  const note = MELODY[step];
  if (note !== null) playLead(time, D4_MIDI + note, noteLengthSteps(step) * STEP_SECONDS * 0.95);

  const bar = Math.floor(step / STEPS_PER_BAR);
  const stepInBar = step % STEPS_PER_BAR;
  if (stepInBar === 0) {
    const barSeconds = STEPS_PER_BAR * STEP_SECONDS;
    const root = D2_MIDI + BAR_ROOTS[bar];
    playPad(time, root, barSeconds);
    playPad(time, root + FIFTH_INTERVAL + 12, barSeconds);
    playWarDrum(time, DRUM_HIT_GAIN);
    if (bar === LAST_BAR_INDEX) playWarDrum(time + STEP_SECONDS * SOFT_DRUM_STEP, DRUM_HIT_GAIN);
    return;
  }
  if (stepInBar === SOFT_DRUM_STEP) playWarDrum(time, DRUM_SOFT_GAIN);
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

/* ---------- pièces d'or ---------- */

const CLINK_COUNT_MIN = 4;
const CLINK_COUNT_MAX = 6;
const CLINK_SPREAD_SECONDS = 0.22;
const CLINK_BASE_HZ_MIN = 2400;
const CLINK_BASE_HZ_MAX = 4200;
// Partiels inharmoniques : ce qui donne le timbre du métal frappé plutôt que celui d'une note.
const CLINK_PARTIAL_RATIOS = [1, 1.47, 2.09, 2.74];
const CLINK_DECAY_SECONDS = 0.16;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createNoiseBurst(time, length, { type, frequency, gain, destination }) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  noise.buffer = buffer;
  filter.type = type;
  filter.frequency.value = frequency;
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  noise.connect(filter).connect(amp).connect(destination);
  noise.start(time);
}

function playClink(time, baseHz, loudness) {
  // Le choc : un court claquement aigu avant que le métal ne sonne.
  createNoiseBurst(time, 0.02, { type: "highpass", frequency: 5000, gain: 0.5 * loudness, destination: sfxBus });
  const decay = CLINK_DECAY_SECONDS * randomBetween(0.7, 1.3);
  CLINK_PARTIAL_RATIOS.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = baseHz * ratio * randomBetween(0.995, 1.005);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime((0.3 * loudness) / (i + 1), time + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay / (i * 0.6 + 1));
    osc.connect(amp).connect(sfxBus);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  });
}

/** Une poignée de pièces qui s'entrechoquent : plusieurs tintements désordonnés, de hauteurs variées. */
export function playCoin() {
  if (!isReady()) return;
  const now = ctx.currentTime;
  const clinks = Math.round(randomBetween(CLINK_COUNT_MIN, CLINK_COUNT_MAX));
  for (let i = 0; i < clinks; i += 1) {
    const offset = i === 0 ? 0 : randomBetween(0.02, CLINK_SPREAD_SECONDS);
    playClink(now + offset, randomBetween(CLINK_BASE_HZ_MIN, CLINK_BASE_HZ_MAX), randomBetween(0.5, 1));
  }
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
