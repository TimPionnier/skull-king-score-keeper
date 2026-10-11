/**
 * Ambiance sonore pirate, jouée avec Web Audio :
 *  - thème de fond (synthétisé) : mélodie sombre en ré mineur, nappe de cordes, tambour de guerre et réverbération
 *  - pièces d'or, tonnerre et voix « Yo, Ho, Ho » : enregistrements générés avec ElevenLabs (public/audio)
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

// Annonce des paris : orage, puis « Yo », « Ho », « Ho ! », puis « Montrez vos paris ».
// L'écran et le son partent des mêmes valeurs pour rester synchronisés.
export const STORM_STEP = 1;
export const YO_STEP = 2;
export const HO_STEP = 3;
export const HO_FINAL_STEP = 4;
export const BETS_STEP = 5;
export const LIGHTNING_FLASH_SECONDS = [0.2, 0.6];
export const YO_HO_SCHEDULE_MS = [
  { step: YO_STEP, at: 1000 },
  { step: HO_STEP, at: 1700 },
  { step: HO_FINAL_STEP, at: 2400 },
  { step: BETS_STEP, at: 3400 },
];
export const YO_HO_FINISH_MS = 4500;

let ctx = null;
let master = null;
let musicBus = null;
let sfxBus = null;
let reverbInput = null;
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
  reverbInput = ctx.createGain();
  musicBus.connect(reverbSend).connect(reverbInput);
  reverbInput.connect(reverb).connect(master);
  // Le compresseur évite la saturation quand beaucoup de pièces tintent en même temps.
  const sfxCompressor = ctx.createDynamicsCompressor();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOLUME;
  sfxBus.connect(sfxCompressor).connect(master);
  loadSamples();
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

/* ---------- échantillons sonores ---------- */

// Fichiers générés avec ElevenLabs (voir scripts/generate-audio.mjs) et servis depuis public/audio.
const SAMPLE_FILES = {
  coins: "coins.mp3",
  thunder: "thunder.mp3",
  yo: "voice-yo.mp3",
  ho: "voice-ho.mp3",
  hoFinal: "voice-ho-final.mp3",
};
const VOICE_SAMPLE_BY_STEP = { [YO_STEP]: "yo", [HO_STEP]: "ho", [HO_FINAL_STEP]: "hoFinal" };

const SILENCE_THRESHOLD_RATIO = 0.1;
const SAMPLE_LEAD_IN_SECONDS = 0.01;
const COIN_GAIN = 0.9;
const COIN_RATE_MIN = 0.93;
const COIN_RATE_MAX = 1.07;
const SECOND_THUNDER_GAIN = 0.5;
const SECOND_THUNDER_RATE = 0.8;
const VOICE_GAIN = 1.2;
const VOICE_REVERB_SEND = 0.25;

const samples = new Map();
let samplesRequested = false;
let activeVoice = null;

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function createNoiseBuffer(seconds) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function createNoiseBurst(time, length, { type, frequency, gain, destination }) {
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  noise.buffer = createNoiseBuffer(length);
  filter.type = type;
  filter.frequency.value = frequency;
  amp.gain.setValueAtTime(gain, time);
  amp.gain.exponentialRampToValueAtTime(0.0001, time + length);
  noise.connect(filter).connect(amp).connect(destination);
  noise.start(time);
}

/** Les enregistrements commencent par un peu de silence : on le repère pour caler le son sur l'instant voulu. */
function findOnsetSeconds(buffer) {
  const data = buffer.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < data.length; i += 1) peak = Math.max(peak, Math.abs(data[i]));
  let index = 0;
  while (index < data.length && Math.abs(data[index]) < peak * SILENCE_THRESHOLD_RATIO) index += 1;
  return index / buffer.sampleRate;
}

function loadSamples() {
  if (samplesRequested) return;
  samplesRequested = true;
  Object.entries(SAMPLE_FILES).forEach(async ([name, file]) => {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}audio/${file}`);
      const buffer = await ctx.decodeAudioData(await response.arrayBuffer());
      samples.set(name, { buffer, onset: findOnsetSeconds(buffer) });
    } catch {
      // Échantillon indisponible : l'effet correspondant reste silencieux.
    }
  });
}

function playSample(name, { when = ctx.currentTime, gain = 1, rate = 1, reverbSend = 0 } = {}) {
  const sample = samples.get(name);
  if (!sample) return null;
  const source = ctx.createBufferSource();
  const amp = ctx.createGain();
  source.buffer = sample.buffer;
  source.playbackRate.value = rate;
  amp.gain.value = gain;
  source.connect(amp).connect(sfxBus);
  if (reverbSend > 0) {
    const tap = ctx.createGain();
    tap.gain.value = reverbSend;
    amp.connect(tap).connect(reverbInput);
  }
  source.start(when, Math.max(0, sample.onset - SAMPLE_LEAD_IN_SECONDS));
  return source;
}

/** Une poignée de pièces d'or : le même enregistrement, légèrement varié en hauteur pour ne pas se répéter. */
export function playCoin() {
  if (!isReady()) return;
  playSample("coins", { gain: COIN_GAIN, rate: randomBetween(COIN_RATE_MIN, COIN_RATE_MAX) });
}

/** Un coup de tonnerre par éclair, au même instant que lui (LIGHTNING_FLASH_SECONDS) ; le second est plus lointain. */
function playThunder() {
  const now = ctx.currentTime;
  playSample("thunder", { when: now + LIGHTNING_FLASH_SECONDS[0] });
  playSample("thunder", { when: now + LIGHTNING_FLASH_SECONDS[1], gain: SECOND_THUNDER_GAIN, rate: SECOND_THUNDER_RATE });
}

export function stopVoice() {
  try { activeVoice?.stop(); } catch { /* déjà terminée */ }
  activeVoice = null;
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

/**
 * Joue l'étape de l'annonce : tonnerre, « Yo », « Ho », « Ho ! » ou coup de tambour.
 * `onStart` est toujours appelé exactement une fois, même si le son est coupé, pour que l'affichage avance.
 */
export function playYoHo(step, onStart = () => {}) {
  if (!isReady()) {
    onStart();
    return;
  }
  if (step === STORM_STEP) {
    duckMusic(YO_HO_FINISH_MS / 1000);
    playThunder();
  } else if (step in VOICE_SAMPLE_BY_STEP) {
    stopVoice();
    activeVoice = playSample(VOICE_SAMPLE_BY_STEP[step], { gain: VOICE_GAIN, reverbSend: VOICE_REVERB_SEND });
  } else {
    playDrum();
  }
  // Le son met un instant à sortir des haut-parleurs (beaucoup plus avec un casque Bluetooth) : l'image attend le même délai.
  setTimeout(onStart, getOutputLatencySeconds() * 1000);
}

/** Délai entre l'instant où un son est programmé et celui où on l'entend vraiment. */
export function getOutputLatencySeconds() {
  if (!ctx) return 0;
  return ctx.outputLatency || ctx.baseLatency || 0;
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
  // Le contexte peut être créé (en pause) avant le premier toucher : les échantillons sont alors déjà décodés
  // quand arrive le premier tonnerre, qui sinon manquerait à l'appel.
  ensureContext();

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
