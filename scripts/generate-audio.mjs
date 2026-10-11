/**
 * Génère les sons de l'app avec l'API ElevenLabs. À lancer à la main : les fichiers produits sont commités,
 * l'app n'appelle jamais l'API. La clé est lue dans .env.local (ignoré par git) et n'est jamais affichée.
 *
 *   node scripts/generate-audio.mjs voices   candidats de voix pour « Yo / Ho / Ho ! » -> audio-candidates/
 *   node scripts/generate-audio.mjs sfx      pièces d'or et tonnerre -> audio-candidates/
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const API = "https://api.elevenlabs.io/v1";
const OUTPUT_DIR = "audio-candidates";
const ENV_CANDIDATES = [".env.local", "../../../.env.local"];
const AUDIO_FORMAT = "mp3_44100_128";

// Voix prêtes à l'emploi de la bibliothèque ElevenLabs : vieux marins, vétérans, voix rauques.
const VOICES = {
  harry: "SOYHLrjzK2X1ezoPC6cr",
  patrick: "ODq5zmih8GrVes37Dizd",
  sam: "yoZ06aMxZJJ28mfd3POQ",
  josh: "TxGEqnHWrfWFTfGW9XjX",
  thomas: "GBv7mTt0atIp3Br8iCZE",
  dave: "CYw3kZ02Hs0563khs1Fj",
};
const VOICES_FREE = { callum: "N2lVS1w4EtoT3dr4eOWO" };
// Déjà essayées : callum, bill, arnold (gratuites). fin et clyde exigent un abonnement payant.
// La phrase est dite d'une traite. Le modèle v3 comprend les indications de jeu entre crochets.
const PHRASE_V2 = "Yo ho ho!";
const PHRASE_V3 = "[gruff, deep pirate voice, laughing heartily] Yo ho ho!";
const MODELS = {
  v2: { id: "eleven_multilingual_v2", text: PHRASE_V2 },
  v3: { id: "eleven_v3", text: PHRASE_V3 },
};
const VOICE_SETTINGS = { stability: 0.3, similarity_boost: 0.8, style: 0.7, use_speaker_boost: true };
const DESIGNED_VOICE_DESCRIPTION =
  "A very deep, rough and gravelly old male pirate captain, weathered by decades at sea, booming and raspy, British West Country accent";

const SOUND_EFFECTS = {
  coins: { text: "A handful of gold coins clinking and falling onto a pile of metal coins, bright metallic jingle", duration: 1.2 },
  thunder: { text: "A single sharp thunder crack followed by a deep rolling rumble, stormy night at sea", duration: 4 },
};

function loadKey() {
  const file = ENV_CANDIDATES.map((candidate) => path.resolve(candidate)).find((candidate) => existsSync(candidate));
  if (!file) throw new Error("Fichier .env.local introuvable");
  const line = readFileSync(file, "utf8").split("\n").find((entry) => entry.startsWith("ELEVENLABS_API_KEY="));
  const key = line?.slice("ELEVENLABS_API_KEY=".length).trim();
  if (!key) throw new Error("ELEVENLABS_API_KEY absente de .env.local");
  return key;
}

async function post(endpoint, body) {
  const response = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: { "xi-api-key": loadKey(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${endpoint} -> HTTP ${response.status} ${(await response.text()).slice(0, 300)}`);
  return Buffer.from(await response.arrayBuffer());
}

function save(name, buffer) {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const file = path.join(OUTPUT_DIR, name);
  writeFileSync(file, buffer);
  console.log(`ecrit : ${file} (${buffer.length} octets)`);
}

async function generateVoices() {
  for (const [voiceName, voiceId] of Object.entries(VOICES)) {
    for (const [modelName, { id, text }] of Object.entries(MODELS)) {
      try {
        const audio = await post(`/text-to-speech/${voiceId}?output_format=${AUDIO_FORMAT}`, {
          text,
          model_id: id,
          voice_settings: VOICE_SETTINGS,
        });
        save(`yoho-${voiceName}-${modelName}.mp3`, audio);
      } catch (error) {
        console.error(`ignore ${voiceName}/${modelName} : ${error.message}`);
      }
    }
  }
}

const CHOSEN_VOICE_ID = VOICES_FREE.callum;
const PIRATE_STYLE = "[gruff, deep pirate voice]";
const SPOKEN_WORDS = { yo: "Yo!", ho: "Ho!" };
const TAKES_PER_WORD = 3;

/** Un mot à la fois, pour le rythme « 1, 2, 3 » : plusieurs prises de chaque mot, on garde la meilleure à l'écoute. */
async function generateWords() {
  for (const [word, text] of Object.entries(SPOKEN_WORDS)) {
    for (let take = 1; take <= TAKES_PER_WORD; take += 1) {
      const audio = await post(`/text-to-speech/${CHOSEN_VOICE_ID}?output_format=${AUDIO_FORMAT}`, {
        text: `${PIRATE_STYLE} ${text}`,
        model_id: MODELS.v3.id,
        voice_settings: VOICE_SETTINGS,
      });
      save(`word-${word}-${take}.mp3`, audio);
    }
  }
}

/** Voice Design : ElevenLabs invente une voix à partir d'une description. Demande une permission de plus sur la clé. */
async function generateDesignedVoices() {
  const result = await post("/text-to-voice/design", {
    voice_description: DESIGNED_VOICE_DESCRIPTION,
    // Le service impose au moins 100 caractères : la phrase voulue ouvre le texte.
    text: "Yo ho ho! Yo ho ho and a bottle of rum! Raise the black flag, me hearties, for the sea is ours tonight!",
    auto_generate_text: false,
  });
  const { previews } = JSON.parse(result.toString("utf8"));
  previews.forEach((preview, i) => save(`yoho-designed-${i + 1}.mp3`, Buffer.from(preview.audio_base_64, "base64")));
}

async function generateSoundEffects() {
  for (const [name, { text, duration }] of Object.entries(SOUND_EFFECTS)) {
    const audio = await post(`/sound-generation?output_format=${AUDIO_FORMAT}`, {
      text,
      duration_seconds: duration,
      prompt_influence: 0.6,
    });
    save(`sfx-${name}.mp3`, audio);
  }
}

const commands = { words: generateWords, voices: generateVoices, design: generateDesignedVoices, sfx: generateSoundEffects };
const command = commands[process.argv[2]];
if (!command) {
  console.error(`Commande inconnue. Utilisation : node scripts/generate-audio.mjs ${Object.keys(commands).join("|")}`);
  process.exit(1);
}
command().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
