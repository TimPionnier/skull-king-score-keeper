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

// Un tas de pièces qui dégringole : beaucoup de petits chocs, plus denses au début, qui s'étalent ensuite.
const CLINK_COUNT_MIN = 12;
const CLINK_COUNT_MAX = 18;
const CLINK_SPREAD_SECONDS = 0.55;
const CLINK_SPREAD_CURVE = 1.7;
const CLINK_BASE_HZ_MIN = 1900;
const CLINK_BASE_HZ_MAX = 4300;
// Partiels inharmoniques : ce qui donne le timbre du métal frappé plutôt que celui d'une note.
const CLINK_PARTIAL_RATIOS = [1, 1.47, 2.09];
const CLINK_DECAY_SECONDS = 0.14;
const RATTLE_SECONDS = 0.4;
const RATTLE_GAIN = 0.1;

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

function playClink(time, baseHz, loudness) {
  // Le choc : un court claquement aigu avant que le métal ne sonne.
  createNoiseBurst(time, 0.015, { type: "highpass", frequency: 5000, gain: 0.4 * loudness, destination: sfxBus });
  const decay = CLINK_DECAY_SECONDS * randomBetween(0.6, 1.4);
  CLINK_PARTIAL_RATIOS.forEach((ratio, i) => {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = baseHz * ratio * randomBetween(0.99, 1.01);
    amp.gain.setValueAtTime(0.0001, time);
    amp.gain.exponentialRampToValueAtTime((0.22 * loudness) / (i + 1), time + 0.002);
    amp.gain.exponentialRampToValueAtTime(0.0001, time + decay / (i * 0.6 + 1));
    osc.connect(amp).connect(sfxBus);
    osc.start(time);
    osc.stop(time + decay + 0.05);
  });
}

/** Un tas de pièces d'or qui s'entrechoquent : une rafale de chocs métalliques sur un léger bruit de ferraille. */
export function playCoin() {
  if (!isReady()) return;
  const now = ctx.currentTime;
  const clinks = Math.round(randomBetween(CLINK_COUNT_MIN, CLINK_COUNT_MAX));
  for (let i = 0; i < clinks; i += 1) {
    const offset = i === 0 ? 0 : CLINK_SPREAD_SECONDS * Math.random() ** CLINK_SPREAD_CURVE;
    playClink(now + offset, randomBetween(CLINK_BASE_HZ_MIN, CLINK_BASE_HZ_MAX), randomBetween(0.35, 1));
  }
  createNoiseBurst(now, RATTLE_SECONDS, { type: "bandpass", frequency: 6500, gain: RATTLE_GAIN, destination: sfxBus });
}

/* ---------- orage ---------- */

const THUNDER_CRACK_GAIN = 1;
const THUNDER_RUMBLE_SECONDS = 2.6;
const THUNDER_RUMBLE_GAIN = 0.9;
const THUNDER_ROLL_DELAY_SECONDS = 0.05;

/** Un coup de tonnerre : craquement sec au moment de l'éclair, puis grondement qui roule et s'éloigne. */
function playThunderClap(time, strength) {
  createNoiseBurst(time, 0.18, { type: "highpass", frequency: 1500, gain: THUNDER_CRACK_GAIN * strength, destination: sfxBus });
  createNoiseBurst(time, 0.5, { type: "lowpass", frequency: 900, gain: 0.8 * strength, destination: sfxBus });

  const rumbleSeconds = THUNDER_RUMBLE_SECONDS * strength;
  const rumbleStart = time + THUNDER_ROLL_DELAY_SECONDS;
  const noise = ctx.createBufferSource();
  const filter = ctx.createBiquadFilter();
  const amp = ctx.createGain();
  noise.buffer = createNoiseBuffer(rumbleSeconds);
  filter.type = "lowpass";
  filter.Q.value = 2;
  filter.frequency.setValueAtTime(700, rumbleStart);
  filter.frequency.exponentialRampToValueAtTime(90, rumbleStart + rumbleSeconds);
  amp.gain.setValueAtTime(0.0001, rumbleStart);
  amp.gain.exponentialRampToValueAtTime(THUNDER_RUMBLE_GAIN * strength, rumbleStart + 0.08);
  // Le grondement « roule » : de légères remontées d'intensité avant de s'éteindre.
  amp.gain.exponentialRampToValueAtTime(0.4 * strength, rumbleStart + rumbleSeconds * 0.3);
  amp.gain.exponentialRampToValueAtTime(0.7 * strength, rumbleStart + rumbleSeconds * 0.45);
  amp.gain.exponentialRampToValueAtTime(0.0001, rumbleStart + rumbleSeconds);
  noise.connect(filter).connect(amp).connect(sfxBus);
  noise.start(rumbleStart);
}

/**
 * Tonnerre synchronisé avec les éclairs de l'écran : chaque éclair de LIGHTNING_FLASH_SECONDS
 * est accompagné d'un coup de tonnerre au même instant.
 */
function playThunder() {
  const now = ctx.currentTime;
  LIGHTNING_FLASH_SECONDS.forEach((offset, i) => {
    playThunderClap(now + offset, i === 0 ? 1 : 0.55);
  });
}

/* ---------- Yo-Ho-Ho ---------- */

const VOCAL_TRACT_SCALE = 0.86;
const VOICE_FORMANTS_O = [450, 800, 2600];
const VOICE_FORMANTS_Y = [300, 2200, 3000];
const FORMANT_Q = [5, 8, 10];
const FORMANT_GAIN = [1, 0.7, 0.25];
const HARMONIC_COUNT = 40;
const HARMONIC_ROLLOFF = 1.3;
const GROWL_HZ = 38;
const GROWL_DEPTH = 0.3;
const VOICE_DRIVE = 2.5;
const VOICE_REVERB_SEND = 0.3;
const VOICE_ATTACK_SECONDS = 0.08;
const BREATH_SECONDS = 0.14;
const BREATH_LEAD_SECONDS = 0.1;
const ASPIRATION_GAIN = 0.07;

let voiceWave = null;

/** Timbre de la glotte : des harmoniques qui décroissent plus vite qu'une dent de scie, donc plus rond. */
function getVoiceWave() {
  if (voiceWave) return voiceWave;
  const real = new Float32Array(HARMONIC_COUNT + 1);
  const imag = new Float32Array(HARMONIC_COUNT + 1);
  for (let n = 1; n <= HARMONIC_COUNT; n += 1) imag[n] = 1 / n ** HARMONIC_ROLLOFF;
  voiceWave = ctx.createPeriodicWave(real, imag);
  return voiceWave;
}

function createSaturationCurve() {
  const samples = 1024;
  const curve = new Float32Array(samples);
  for (let i = 0; i < samples; i += 1) {
    const x = (i / (samples - 1)) * 2 - 1;
    curve[i] = Math.tanh(VOICE_DRIVE * x);
  }
  return curve;
}

/**
 * Voix de corsaire très grave : source glottale, hauteur légèrement instable, grondement de gorge
 * (modulation d'amplitude), trois formants plus bas qu'une voix normale, un souffle et de la saturation.
 */
function sing({ hz, endHz, length, startsWithY, breath }) {
  const start = ctx.currentTime + (breath ? BREATH_LEAD_SECONDS : 0);
  if (breath) {
    createNoiseBurst(ctx.currentTime, BREATH_SECONDS, { type: "bandpass", frequency: 1400, gain: 0.3, destination: sfxBus });
  }

  const source = ctx.createOscillator();
  source.setPeriodicWave(getVoiceWave());
  source.frequency.setValueAtTime(hz, start);
  source.frequency.exponentialRampToValueAtTime(endHz, start + length);

  // Deux modulations lentes et incommensurables : la hauteur ne reste jamais parfaitement stable.
  const wobbles = [[5.3, 0.012], [2.1, 0.02]].map(([rate, depth]) => {
    const lfo = ctx.createOscillator();
    const lfoDepth = ctx.createGain();
    lfo.frequency.value = rate;
    lfoDepth.gain.value = hz * depth;
    lfo.connect(lfoDepth).connect(source.frequency);
    return lfo;
  });

  const voiceBus = ctx.createGain();
  voiceBus.gain.value = 1;
  source.connect(voiceBus);

  // Souffle continu dans la voix : c'est lui qui retire l'aspect « onde pure ».
  const aspiration = ctx.createBufferSource();
  const aspirationGain = ctx.createGain();
  aspiration.buffer = createNoiseBuffer(length);
  aspirationGain.gain.value = ASPIRATION_GAIN;
  aspiration.connect(aspirationGain).connect(voiceBus);

  const formantMix = ctx.createGain();
  VOICE_FORMANTS_O.forEach((target, i) => {
    const filter = ctx.createBiquadFilter();
    const formantGain = ctx.createGain();
    const from = (startsWithY ? VOICE_FORMANTS_Y[i] : target) * VOCAL_TRACT_SCALE;
    filter.type = "bandpass";
    filter.Q.value = FORMANT_Q[i];
    filter.frequency.setValueAtTime(from, start);
    filter.frequency.exponentialRampToValueAtTime(target * VOCAL_TRACT_SCALE, start + length * 0.4);
    formantGain.gain.value = FORMANT_GAIN[i];
    voiceBus.connect(filter).connect(formantGain).connect(formantMix);
  });

  const shaper = ctx.createWaveShaper();
  shaper.curve = createSaturationCurve();
  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = 3200;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(0.9, start + VOICE_ATTACK_SECONDS);
  amp.gain.setValueAtTime(0.9, start + length * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + length);

  // Grondement de gorge : l'amplitude vibre très vite, comme une voix rauque.
  const growl = ctx.createOscillator();
  const growlDepth = ctx.createGain();
  const growlGain = ctx.createGain();
  growl.frequency.value = GROWL_HZ;
  growlDepth.gain.value = GROWL_DEPTH;
  growlGain.gain.value = 1 - GROWL_DEPTH;
  growl.connect(growlDepth).connect(growlGain.gain);

  formantMix.connect(shaper).connect(tone).connect(growlGain).connect(amp);
  amp.connect(sfxBus);
  const reverbTap = ctx.createGain();
  reverbTap.gain.value = VOICE_REVERB_SEND;
  amp.connect(reverbTap).connect(reverbInput);

  const end = start + length + 0.05;
  [source, aspiration, growl, ...wobbles].forEach((node) => {
    node.start(start);
    if (node !== aspiration) node.stop(end);
  });
}

const VOICE_BY_STEP = {
  [YO_STEP]: { hz: 92, endHz: 84, length: 0.6, startsWithY: true, breath: false },
  [HO_STEP]: { hz: 78, endHz: 72, length: 0.6, startsWithY: false, breath: true },
  [HO_FINAL_STEP]: { hz: 66, endHz: 50, length: 0.95, startsWithY: false, breath: true },
};

/** Lance le son de l'étape de l'annonce : tonnerre, « Yo », « Ho », « Ho ! » ou coup de tambour. */
export function playYoHo(step) {
  if (!isReady()) return;
  if (step === STORM_STEP) {
    duckMusic(YO_HO_FINISH_MS / 1000);
    playThunder();
    return;
  }
  const voice = VOICE_BY_STEP[step];
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
