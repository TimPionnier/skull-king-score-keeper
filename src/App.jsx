/**
 * Skull King — carnet de score (mobile-first)
 * React 18+ · Tailwind CSS v4 · Framer Motion · Lucide React
 *
 * Pensé d'abord pour le téléphone (testé en 390×844, iPhone 12 Pro) :
 *  - saisie en lignes compactes, pouces sur des boutons de 48 px
 *  - barre d'action fixe en bas (zone du pouce) + safe-areas iOS
 *  - bonus et personnalisation dans des « bottom sheets »
 *  - partie sauvegardée automatiquement (localStorage) et écran maintenu allumé
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import {
  Anchor, BarChart3, Check, ChevronDown, ChevronLeft, Coins, Compass, Crown, Flame, Gem, Ghost as GhostIcon,
  Minus, Plus, RotateCcw, Ship, Skull, SlidersHorizontal, Sparkles, Swords, Target, UserPlus, Waves, X, Fish, Bird, Layers, Palette, Bomb,
} from "lucide-react";

/* ═══════════════════════ Données & règles ═══════════════════════ */

const COLORS = ["#F2B544", "#E05168", "#2DD4BF", "#5AA9FF", "#A78BFA", "#FB8C3C", "#A3E635", "#F472B6"];
const COLOR_NAMES = ["or", "cramoisi", "émeraude", "azur", "améthyste", "corail", "algue", "rose"];
const ICONS = [Skull, Anchor, Compass, Ship, Swords, Gem, Fish, Bird];
const ICON_NAMES = ["crâne", "ancre", "boussole", "navire", "sabres", "joyau", "sirène", "perroquet"];
const DEFAULT_NAMES = ["Tim", "Guimi", "Louis", "Keryan", "Anne", "Calico", "Mary", "Barbe"];

const VARIANTS = [
  { id: "classic", name: "Classique", desc: "10 manches · 1 → 10", seq: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: "even", name: "Pas d'impair", desc: "5 manches · 2 → 10", seq: [2, 4, 6, 8, 10] },
  { id: "combat", name: "Prêt au combat", desc: "5 manches · 6 → 10", seq: [6, 7, 8, 9, 10] },
  { id: "eclair", name: "Attaque éclair", desc: "5 manches · 5 cartes", seq: [5, 5, 5, 5, 5] },
  { id: "barrage", name: "Tir de barrage", desc: "10 manches · 10 cartes", seq: Array(10).fill(10) },
  { id: "tourbillon", name: "Tourbillon", desc: "5 manches · 9 → 1", seq: [9, 7, 5, 3, 1] },
];

const newEntry = () => ({ bet: 0, tricks: 0, b14c: 0, b14n: false, mermaid: 0, pirate: 0, skc: false, loot: 0, wager: 0, cannon: false });
const freshEntries = (players) => Object.fromEntries(players.map((p) => [p.id, newEntry()]));
const signed = (n) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : "0");
const ptsColor = (n) => (n > 0 ? "text-[#2DD4BF]" : n < 0 ? "text-[#FF7A8E]" : "text-[#94A0B8]");
const ord = (n) => (n === 1 ? "1er" : `${n}e`);
const buzz = (ms = 8) => { try { navigator.vibrate?.(ms); } catch { /* iOS : pas de vibration */ } };

/** Séquence de cartes par manche, plafonnée par la taille de la pioche (7-8 joueurs). */
function roundSequence(settings, nPlayers) {
  const v = VARIANTS.find((x) => x.id === settings.variant) ?? VARIANTS[0];
  const deck = 70 + (settings.loot ? 2 : 0) + (settings.leviathans ? 2 : 0);
  const cap = Math.floor(deck / Math.max(nPlayers, 1));
  return v.seq.map((c) => Math.min(c, cap));
}

const rawBonus = (e, st) =>
  e.b14c * 10 + (e.b14n ? 20 : 0) + e.mermaid * 20 + e.pirate * 30 + (e.skc ? 40 : 0) + (st.loot ? e.loot * 20 : 0);

/** Barème officiel : Skull King (classique) ou Rascal (Chevrotine ou Boulet de canon, choisi par joueur à chaque manche) + mise du Flambeur. */
function scoreEntry(e, cards, st) {
  const diff = Math.abs(e.bet - e.tricks);
  const raw = rawBonus(e, st);
  let base = 0, bonus = 0, label = "", tone = "miss";
  if (st.scoring === "rascal") {
    if (e.cannon) {
      if (diff === 0) { base = 15 * cards; bonus = raw; label = "Boulet au but"; tone = "hit"; }
      else label = "Boulet à l’eau";
    } else {
      const f = diff === 0 ? 1 : diff === 1 ? 0.5 : 0;
      base = Math.round(10 * cards * f);
      bonus = Math.round(raw * f);
      label = diff === 0 ? "Coup direct" : diff === 1 ? "Frappe à revers" : "Échec cuisant";
      tone = diff === 0 ? "hit" : diff === 1 ? "half" : "miss";
    }
  } else if (diff === 0) {
    base = e.bet === 0 ? 10 * cards : 20 * e.bet; bonus = raw;
    label = e.bet === 0 ? "Zéro tenu !" : "Pari réussi"; tone = "hit";
  } else {
    base = e.bet === 0 ? -10 * cards : -10 * diff;
    label = `Raté de ${diff}`;
  }
  const wager = st.powers && e.wager ? (diff === 0 ? e.wager : -e.wager) : 0;
  return { base, bonus, raw, wager, total: base + bonus + wager, hit: diff === 0, diff, label, tone };
}

const TONE_TEXT = { hit: "text-[#5EEAD4]", half: "text-[#FCE7B8]", miss: "text-[#FF9AAA]", pending: "text-[#8390AA]" };
const TONE_DOT = { hit: "bg-[#2DD4BF]", half: "bg-[#F2B544]", miss: "bg-[#FF7A8E]", pending: "bg-[#3A4A6B]" };

const DEFAULT_PLAYERS = [
  { id: "p1", name: "Tim", color: 0, icon: 0 },
  { id: "p2", name: "Guimi", color: 1, icon: 3 },
  { id: "p3", name: "Louis", color: 2, icon: 6 },
  { id: "p4", name: "Keryan", color: 3, icon: 4 },
];
const DEFAULT_SETTINGS = { scoring: "sk", variant: "classic", loot: false, leviathans: false, powers: false };

/* ---------- Sauvegarde locale (survit au verrouillage du téléphone / rechargement) ---------- */
const STORE_KEY = "skull-king:v1";
function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY));
    return s && s.v === 1 ? s : null;
  } catch { return null; }
}

/* ═══════════════════════ Composants de base ═══════════════════════ */

const press = { whileTap: { scale: 0.92 }, transition: { type: "spring", stiffness: 600, damping: 30 } };
const FOCUS = "focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#F2B544]";

function Avatar({ player, size = 44 }) {
  const Icon = ICONS[player.icon];
  return (
    <span className="grid flex-none place-items-center rounded-full text-[#0A101C]" style={{ width: size, height: size, background: COLORS[player.color] }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} aria-hidden />
    </span>
  );
}

function Panel({ className = "", children, ...rest }) {
  return <div className={`rounded-[20px] border border-[#22304B] bg-[#111A2C] ${className}`} {...rest}>{children}</div>;
}

function Title({ as: Tag = "h2", className = "", children }) {
  return <Tag className={`font-['Pirata_One'] font-normal tracking-[.01em] ${className}`}>{children}</Tag>;
}

function CTA({ className = "", children, ...rest }) {
  return (
    <motion.button {...press} className={`flex items-center justify-center gap-2.5 rounded-[18px] bg-[#F2B544] font-extrabold text-[#1B1204] shadow-[0_5px_0_#A8741A] active:translate-y-[4px] active:shadow-[0_1px_0_#A8741A] disabled:bg-[#3A3220] disabled:text-[#B9A882] disabled:shadow-none ${FOCUS} ${className}`} {...rest}>
      {children}
    </motion.button>
  );
}

function Ghost({ className = "", children, ...rest }) {
  return (
    <motion.button {...press} className={`rounded-[14px] border border-[#2A3857] bg-[#16213A] text-[#E8ECF4] disabled:opacity-35 ${FOCUS} ${className}`} {...rest}>
      {children}
    </motion.button>
  );
}

function Toggle({ on, color = "#2DD4BF" }) {
  return (
    <span className="relative h-[30px] w-[52px] flex-none rounded-full transition-colors" style={{ background: on ? color : "#2A3857" }}>
      <motion.span className="absolute top-[3px] h-6 w-6 rounded-full" animate={{ left: on ? 25 : 3, backgroundColor: on ? "#0A101C" : "#8390AA" }} transition={{ type: "spring", stiffness: 600, damping: 32 }} />
    </span>
  );
}

/** Barre d'action fixe, dans la zone du pouce, au-dessus de l'indicateur d'accueil iOS. */
function BottomBar({ children }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#1A2540] bg-[#0A101C]/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md">
      <div className="mx-auto flex max-w-[640px] flex-col gap-2">{children}</div>
    </div>
  );
}

/** En-tête collant qui respecte l'encoche. */
function TopBar({ children }) {
  return (
    <div className="sticky top-0 z-10 -mx-4 border-b border-[#1A2540] bg-[#0A101C]/95 px-4 pb-3 pt-[max(12px,env(safe-area-inset-top))] backdrop-blur-md">
      {children}
    </div>
  );
}

/** Bottom sheet : glisse depuis le bas, se ferme en tirant la poignée vers le bas ou en touchant le fond. */
function Sheet({ open, onClose, label, children }) {
  const controls = useDragControls();
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="sheet" className="fixed inset-0 z-30 flex items-end justify-center sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-[rgba(4,7,14,.72)]" onClick={onClose} aria-hidden />
          <motion.div
            role="dialog" aria-modal="true" aria-label={label}
            initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 34, stiffness: 360 }}
            drag="y" dragListener={false} dragControls={controls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}
            className="relative flex max-h-[88dvh] w-full max-w-[560px] flex-col rounded-t-[28px] border border-b-0 border-[#2A3857] bg-[#101828] sm:rounded-[28px] sm:border-b"
          >
            <div onPointerDown={(e) => controls.start(e)} className="flex h-7 flex-none cursor-grab touch-none items-center justify-center">
              <span className="h-1.5 w-10 rounded-full bg-[#3A4A6B]" />
            </div>
            <div className="overflow-y-auto overscroll-contain px-4 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Rascal : choix du tir pour la manche, directement dans la ligne du joueur (vue des paris). */
function ShotPicker({ p, cannon, cards, onPick }) {
  const opt = (isCannon) => {
    const on = cannon === isCannon;
    const cls = on
      ? isCannon ? "bg-[#3A1420] text-[#FFC7D0] ring-1 ring-[#E05168]" : "bg-[#1A2540] text-[#E8ECF4] ring-1 ring-[#3A4A6B]"
      : "text-[#8390AA]";
    return (
      <motion.button key={String(isCannon)} {...press} role="radio" aria-checked={on} onClick={() => { buzz(); onPick(isCannon); }}
        className={`flex min-h-11 flex-col items-center justify-center rounded-[10px] px-1 py-1 leading-tight ${cls} ${FOCUS}`}>
        <span className="flex items-center gap-1 text-[14px] font-bold">{isCannon && <Bomb size={14} />}{isCannon ? "Boulet de canon" : "Chevrotine"}</span>
        <span className="text-[11.5px] tabular-nums opacity-85">{isCannon ? `${15 * cards} pts ou 0` : `jusqu'à ${10 * cards} · ±1 toléré`}</span>
      </motion.button>
    );
  };
  return (
    <div role="radiogroup" aria-label={`Tir de ${p.name} pour cette manche`} className="mt-2 grid grid-cols-2 gap-1 rounded-xl border border-[#1E2A43] bg-[#0B1322] p-1">
      {opt(false)}{opt(true)}
    </div>
  );
}

function ShotBadge() {
  return <span className="inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full bg-[#3A1420] px-2 py-px text-[11.5px] font-bold text-[#FFC7D0]"><Bomb size={11} /> Boulet</span>;
}

/** Stepper compact pour une ligne : − valeur + (cibles de 48 px). */
function Stepper({ value, onDec, onInc, decDisabled, incDisabled, who, plusColor = "gold" }) {
  const plus = plusColor === "teal" ? "bg-[#2DD4BF] text-[#062521]" : "bg-[#F2B544] text-[#1B1204]";
  return (
    <div className="flex flex-none items-center gap-1 rounded-2xl border border-[#1E2A43] bg-[#0B1322] p-1">
      <motion.button {...press} onClick={() => { buzz(); onDec(); }} disabled={decDisabled} aria-label={`Moins 1 · ${who}`}
        className={`grid h-12 w-12 place-items-center rounded-xl bg-[#1A2540] text-[#E8ECF4] disabled:opacity-30 ${FOCUS}`}>
        <Minus size={22} strokeWidth={2.8} />
      </motion.button>
      <div className="relative h-12 w-11 overflow-hidden" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.span key={value} initial={{ y: -18, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 18, opacity: 0 }} transition={{ type: "spring", stiffness: 600, damping: 32 }}
            className="absolute inset-0 grid place-items-center text-[30px] font-extrabold tabular-nums">
            {value}
          </motion.span>
        </AnimatePresence>
      </div>
      <motion.button {...press} onClick={() => { buzz(); onInc(); }} disabled={incDisabled} aria-label={`Plus 1 · ${who}`}
        className={`grid h-12 w-12 place-items-center rounded-xl ${plus} disabled:opacity-30 ${FOCUS}`}>
        <Plus size={22} strokeWidth={2.8} />
      </motion.button>
    </div>
  );
}

function SparkBurst() {
  const stars = [
    { x: -4, y: -12, s: 20, c: "#F2B544", d: 0 },
    { x: 16, y: 6, s: 13, c: "#2DD4BF", d: 0.12 },
    { x: -26, y: 4, s: 10, c: "#FFE08A", d: 0.24 },
  ];
  return (
    <span aria-hidden className="pointer-events-none absolute -top-1 right-6">
      {stars.map((st, i) => (
        <motion.span key={i} className="absolute" style={{ left: st.x, top: st.y, color: st.c }} initial={{ opacity: 0, scale: 0.2, rotate: 0 }} animate={{ opacity: [0, 1, 0], scale: [0.2, 1.25, 0.5], rotate: [0, 90, 180] }} transition={{ duration: 1, delay: st.d }}>
          <Sparkles size={st.s} fill="currentColor" strokeWidth={0} />
        </motion.span>
      ))}
    </span>
  );
}

const fadeScreen = { initial: { opacity: 0 }, animate: { opacity: 1, transition: { duration: 0.3 } }, exit: { opacity: 0, transition: { duration: 0.15 } } };
const phaseSlide = (dir) => ({
  initial: { opacity: 0, x: 60 * dir },
  animate: { opacity: 1, x: 0, transition: { duration: 0.4, ease: [0.2, 0.8, 0.2, 1] } },
  exit: { opacity: 0, x: -60 * dir, transition: { duration: 0.18 } },
});

/* ═══════════════════════ Application ═══════════════════════ */

export default function SkullKingApp() {
  useEffect(() => {
    if (document.getElementById("sk-fonts")) return;
    const l = document.createElement("link");
    l.id = "sk-fonts"; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=Pirata+One&display=swap";
    document.head.appendChild(l);
  }, []);

  const [saved] = useState(loadSaved);
  const [screen, setScreen] = useState(saved?.screen ?? "setup"); // setup | game | board | end
  const [players, setPlayers] = useState(saved?.players ?? DEFAULT_PLAYERS);
  const [settings, setSettings] = useState(saved?.settings ?? DEFAULT_SETTINGS);
  const [rounds, setRounds] = useState(saved?.rounds ?? []);
  const [phase, setPhase] = useState(saved?.phase ?? "bet");
  const [entries, setEntries] = useState(() => saved?.entries ?? freshEntries(players));
  const [gameActive, setGameActive] = useState(saved?.gameActive ?? false);
  const [finished, setFinished] = useState(saved?.finished ?? false);
  const [bonusFor, setBonusFor] = useState(null);
  const [countdown, setCountdown] = useState(0);
  const [transition, setTransition] = useState(null);
  const nextId = useRef(1 + Math.max(4, ...players.map((p) => Number(p.id.slice(1)) || 0)));
  const timers = useRef([]);
  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clearTimers, []);

  // Sauvegarde automatique
  useEffect(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 1, screen, players, settings, rounds, phase, entries, gameActive, finished })); } catch { /* stockage indisponible */ }
  }, [screen, players, settings, rounds, phase, entries, gameActive, finished]);

  // Garder l'écran allumé pendant la partie
  useEffect(() => {
    if (screen !== "game" || !("wakeLock" in navigator)) return;
    let lock = null, alive = true;
    const req = async () => { try { lock = await navigator.wakeLock.request("screen"); } catch { /* refusé */ } };
    const onVis = () => { if (alive && document.visibilityState === "visible") req(); };
    req();
    document.addEventListener("visibilitychange", onVis);
    return () => { alive = false; document.removeEventListener("visibilitychange", onVis); lock?.release?.().catch(() => {}); };
  }, [screen]);

  // Revenir en haut à chaque changement d'écran (et ne pas restaurer un ancien défilement au rechargement)
  useEffect(() => { if ("scrollRestoration" in history) history.scrollRestoration = "manual"; }, []);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [screen, phase]);

  const seq = useMemo(() => roundSequence(settings, players.length), [settings, players.length]);
  const roundIndex = rounds.length;
  const idx = Math.min(roundIndex, seq.length - 1);
  const cards = seq[idx];

  const results = useMemo(
    () => rounds.map((r) => ({ ...r, res: Object.fromEntries(Object.entries(r.entries).map(([pid, e]) => [pid, scoreEntry(e, r.cards, settings)])) })),
    [rounds, settings],
  );
  const totals = useMemo(() => {
    const t = Object.fromEntries(players.map((p) => [p.id, 0]));
    results.forEach((r) => players.forEach((p) => { t[p.id] += r.res[p.id]?.total ?? 0; }));
    return t;
  }, [results, players]);
  const hits = useMemo(() => {
    const h = Object.fromEntries(players.map((p) => [p.id, 0]));
    results.forEach((r) => players.forEach((p) => { if (r.res[p.id]?.hit) h[p.id]++; }));
    return h;
  }, [results, players]);
  const ranking = useMemo(() => {
    const arr = players.map((p) => ({ p, total: totals[p.id] })).sort((a, b) => b.total - a.total);
    let rank = 0, prev = null;
    arr.forEach((x, i) => { if (x.total !== prev) { rank = i + 1; prev = x.total; } x.rank = rank; });
    return arr;
  }, [players, totals]);
  const rankOf = Object.fromEntries(ranking.map((x) => [x.p.id, x.rank]));
  const crewUnchanged = players.length === Object.keys(entries).length && players.every((p) => entries[p.id]);

  /* ---------- actions ---------- */
  const updPlayer = (id, patch) => setPlayers((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const addPlayer = () => setPlayers((ps) => {
    if (ps.length >= 8) return ps;
    const color = [...Array(8).keys()].find((i) => !ps.some((p) => p.color === i)) ?? 0;
    const name = DEFAULT_NAMES.find((n) => !ps.some((p) => p.name === n)) ?? "";
    const id = `p${nextId.current++}`;
    return [...ps, { id, name, color, icon: (nextId.current + 1) % 8 }];
  });
  const removePlayer = (id) => setPlayers((ps) => (ps.length <= 2 ? ps : ps.filter((p) => p.id !== id)));
  const setSetting = (patch) => setSettings((s) => ({ ...s, ...patch }));

  const launch = () => {
    clearTimers();
    const named = players.map((p, i) => ({ ...p, name: p.name.trim() || `Pirate ${i + 1}` }));
    setPlayers(named);
    setRounds([]); setPhase("bet"); setEntries(freshEntries(named)); setBonusFor(null);
    setTransition(null); setFinished(false); setGameActive(true); setCountdown(0);
    setScreen("game");
  };
  const setEntry = (pid, patch) => setEntries((en) => ({ ...en, [pid]: { ...en[pid], ...patch } }));

  const startYoHo = () => {
    clearTimers();
    setCountdown(1);
    [2, 3, 4].forEach((n, i) => timers.current.push(setTimeout(() => { setCountdown(n); buzz(n === 4 ? 30 : 15); }, 650 * (i + 1))));
    timers.current.push(setTimeout(finishCountdown, 650 * 3 + 1700));
  };
  const finishCountdown = () => { clearTimers(); setCountdown(0); setPhase("tricks"); };

  const validateRound = () => {
    const last = roundIndex + 1 >= seq.length;
    buzz(25);
    setRounds((rs) => [...rs, { cards, entries }]);
    setEntries(freshEntries(players)); setBonusFor(null); setPhase("bet");
    setTransition({ last }); setFinished(last); setGameActive(!last);
  };
  const undoRound = () => {
    const prev = rounds[rounds.length - 1];
    if (!prev) return;
    setRounds((rs) => rs.slice(0, -1));
    setEntries(prev.entries); setPhase("tricks"); setTransition(null); setFinished(false); setGameActive(true);
  };
  const closeTransition = () => { setTransition(null); setScreen(finished ? "end" : "game"); };
  const newCrew = () => {
    clearTimers(); setPlayers(DEFAULT_PLAYERS); setSettings(DEFAULT_SETTINGS); setRounds([]); setEntries(freshEntries(DEFAULT_PLAYERS));
    setGameActive(false); setFinished(false); setPhase("bet"); setScreen("setup");
  };

  const bonusPlayer = players.find((p) => p.id === bonusFor);

  return (
    <div className="relative min-h-[100dvh] overflow-x-clip bg-[#0A101C] font-['Outfit',system-ui,sans-serif] text-[#E8ECF4] antialiased">
      <AnimatePresence mode="wait">
        {screen === "setup" && (
          <SetupScreen key="setup" {...{ players, settings, seq, updPlayer, addPlayer, removePlayer, setSetting, launch }}
            canResume={gameActive && crewUnchanged} crewChangedDuringGame={gameActive && !crewUnchanged} onResume={() => setScreen("game")} />
        )}
        {screen === "game" && (
          <GameScreen key="game"
            {...{ players, settings, seq, idx, cards, roundIndex, phase, setPhase, entries, setEntry, totals, rankOf, startYoHo, validateRound }}
            onBonus={setBonusFor} onBoard={() => setScreen("board")} onSetup={() => setScreen("setup")} />
        )}
        {screen === "board" && (
          <BoardScreen key="board" {...{ players, settings, seq, results, ranking, hits, totals, finished }} onBack={() => setScreen(finished ? "end" : "game")} />
        )}
        {screen === "end" && (
          <EndScreen key="end" {...{ players, results, ranking, hits }} onRematch={launch} onBoard={() => setScreen("board")} onNewCrew={newCrew} />
        )}
      </AnimatePresence>

      <Sheet open={!!bonusPlayer} onClose={() => setBonusFor(null)} label="Bonus de la manche">
        {bonusPlayer && (
          <BonusSheet p={bonusPlayer} e={entries[bonusPlayer.id]} cards={cards} settings={settings} total={totals[bonusPlayer.id]}
            setEntry={(patch) => setEntry(bonusPlayer.id, patch)} onClose={() => setBonusFor(null)} />
        )}
      </Sheet>

      <Sheet open={!!transition && results.length > 0} onClose={closeTransition} label="Résultats de la manche">
        {transition && results.length > 0 && (
          <RoundSummary {...{ players, results, totals, seq }} isRascal={settings.scoring === "rascal"} last={transition.last} onNext={closeTransition} onUndo={undoRound} />
        )}
      </Sheet>

      <AnimatePresence>
        {countdown > 0 && <CountdownOverlay key="cd" step={countdown} players={players} entries={entries} isRascal={settings.scoring === "rascal"} onSkip={finishCountdown} />}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════ 1. Configuration ═══════════════════════ */

function SetupScreen({ players, settings, seq, canResume, crewChangedDuringGame, updPlayer, addPlayer, removePlayer, setSetting, launch, onResume }) {
  const [editing, setEditing] = useState(null);
  const sel = "border-[#F2B544] bg-[#2A2112] text-[#FCE7B8]";
  const off = "border-[#1E2A43] bg-[#0E1626] text-[#C3CCDD]";
  const variant = VARIANTS.find((v) => v.id === settings.variant) ?? VARIANTS[0];
  const capped = variant.seq.some((c, i) => c !== seq[i]);
  const ext = [
    { key: "loot", title: "Cartes Butin", desc: "Alliance : +20 chacun si les deux réussissent.", Icon: Coins, accent: "#F2B544" },
    { key: "leviathans", title: "Kraken & Baleine", desc: "Un pli peut être détruit.", Icon: Waves, accent: "#2DD4BF" },
    { key: "powers", title: "Pouvoirs des pirates", desc: "Mise de Rascal le Flambeur : 0, 10 ou 20.", Icon: Flame, accent: "#E05168" },
  ];
  const editP = players.find((p) => p.id === editing);

  return (
    <motion.div {...fadeScreen} className="mx-auto flex max-w-[640px] flex-col gap-5 px-4 pb-44 pt-[max(20px,env(safe-area-inset-top))]">
      <header className="flex items-center gap-3.5 pt-2">
        <motion.div animate={{ y: [0, -4, 0] }} transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          className="grid h-14 w-14 flex-none place-items-center rounded-full border-2 border-[#D6455B] bg-[#1A1020] text-[#F2B544]">
          <Crown size={28} strokeWidth={1.9} />
        </motion.div>
        <div className="min-w-0">
          <Title as="h1" className="m-0 text-[44px] leading-[.95] text-[#F2B544]">Skull King</Title>
          <p className="m-0 text-[15px] text-[#9AA6BF]">Le carnet de bord du capitaine</p>
        </div>
      </header>

      {canResume && (
        <div className="flex items-center gap-3 rounded-2xl border border-[#6E2235] bg-[#2A1220] p-3.5">
          <span className="flex-1 text-[14px] font-semibold leading-snug text-[#FFB3BF]">Partie en cours. « Lancer » remettra les scores à zéro.</span>
          <Ghost onClick={onResume} className="h-11 flex-none px-3.5 text-[15px] font-bold">Reprendre</Ghost>
        </div>
      )}
      {crewChangedDuringGame && (
        <p className="m-0 rounded-2xl border border-[#6E2235] bg-[#2A1220] p-3.5 text-[14px] font-semibold text-[#FFB3BF]">L'équipage a changé : relancez une nouvelle partie.</p>
      )}

      {/* Équipage */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <Title className="m-0 text-[28px]">L'équipage</Title>
          <span className="text-sm font-semibold tabular-nums text-[#94A0B8]">{players.length} / 8</span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          <AnimatePresence initial={false}>
            {players.map((p, i) => (
              <motion.li key={p.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                <div className="flex items-center gap-2.5 rounded-[18px] border border-[#1E2A43] bg-[#111A2C] p-2">
                  <motion.button {...press} onClick={() => setEditing(p.id)} aria-label={`Personnaliser ${p.name || `le pirate ${i + 1}`} (emblème ${ICON_NAMES[p.icon]}, couleur ${COLOR_NAMES[p.color]})`}
                    className={`relative flex-none rounded-full ${FOCUS}`}>
                    <Avatar player={p} size={48} />
                    <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-[#111A2C] bg-[#E8ECF4] text-[#0A101C]"><Palette size={11} strokeWidth={2.5} /></span>
                  </motion.button>
                  <label className="min-w-0 flex-1">
                    <span className="sr-only">Nom du pirate {i + 1}</span>
                    <input value={p.name} maxLength={16} placeholder={`Pirate ${i + 1}`} enterKeyHint="next" autoCapitalize="words" autoComplete="off"
                      onChange={(e) => updPlayer(p.id, { name: e.target.value })}
                      className="h-12 w-full rounded-[14px] border border-transparent bg-[#0B1322] px-3.5 text-[17px] font-semibold text-[#E8ECF4] placeholder:text-[#6F7C96] focus:border-[#F2B544] focus:outline-none" />
                  </label>
                  {players.length > 2 && (
                    <motion.button {...press} onClick={() => removePlayer(p.id)} aria-label={`Retirer ${p.name || "ce pirate"}`}
                      className={`grid h-12 w-11 flex-none place-items-center rounded-xl text-[#8390AA] active:text-[#FF8A9B] ${FOCUS}`}>
                      <X size={20} strokeWidth={2.4} />
                    </motion.button>
                  )}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        {players.length < 8 && (
          <Ghost onClick={addPlayer} className="flex h-12 items-center justify-center gap-2 border-dashed bg-transparent text-[15px] font-bold text-[#F2B544]">
            <UserPlus size={19} strokeWidth={2.2} /> Recruter un pirate
          </Ghost>
        )}
        <p className="m-0 text-[13px] text-[#8390AA]">Touchez un avatar pour changer son emblème et sa couleur. Le 1er de la liste distribue la manche 1.</p>
      </section>

      {/* Décompte */}
      <section className="flex flex-col gap-2.5">
        <Title className="m-0 text-[28px]">Décompte</Title>
        <div className="grid grid-cols-2 gap-2">
          {[
            { id: "sk", title: "Skull King", sub: "Audacieux", desc: "+20 par pli annoncé, −10 par pli d’écart." },
            { id: "rascal", title: "Rascal", sub: "Calculateur", desc: "10 pts par carte : tout, moitié ou rien." },
          ].map((o) => (
            <motion.button key={o.id} {...press} onClick={() => setSetting({ scoring: o.id })} aria-pressed={settings.scoring === o.id}
              className={`flex flex-col gap-1 rounded-2xl border-2 p-3 text-left ${settings.scoring === o.id ? sel : off} ${FOCUS}`}>
              <span className="text-[17px] font-extrabold leading-tight">{o.title}</span>
              <span className="text-[12px] font-semibold uppercase tracking-wide opacity-70">{o.sub}</span>
              <span className="text-[13px] leading-snug opacity-90">{o.desc}</span>
            </motion.button>
          ))}
        </div>
        <AnimatePresence initial={false}>
          {settings.scoring === "rascal" && (
            <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="m-0 flex items-start gap-2.5 overflow-hidden rounded-2xl border border-[#6E2235] bg-[#1F1018] p-3 text-[13.5px] leading-snug text-[#FFC7D0]">
              <Bomb size={18} className="mt-px flex-none text-[#E05168]" />
              <span>À chaque manche, chaque pirate choisit dès l'annonce : <b>Chevrotine</b> (10 pts/carte, 1 d'écart toléré) ou <b>Boulet de canon</b> (15 pts/carte, aucune erreur permise).</span>
            </motion.p>
          )}
        </AnimatePresence>
      </section>

      {/* Manches */}
      <section className="flex flex-col gap-2.5">
        <Title className="m-0 text-[28px]">Manches</Title>
        <div className="grid grid-cols-2 gap-2">
          {VARIANTS.map((v) => (
            <motion.button key={v.id} {...press} onClick={() => setSetting({ variant: v.id })} aria-pressed={settings.variant === v.id}
              className={`flex min-h-[60px] flex-col justify-center gap-0.5 rounded-[14px] border-2 px-3 py-2 text-left ${settings.variant === v.id ? sel : off} ${FOCUS}`}>
              <span className="text-[15px] font-extrabold leading-tight">{v.name}</span>
              <span className="text-[12.5px] opacity-80">{v.desc}</span>
            </motion.button>
          ))}
        </div>
        {capped && <p className="m-0 text-[13px] text-[#F2B544]">À {players.length} joueurs, la pioche limite chaque main à {Math.max(...seq)} cartes.</p>}
      </section>

      {/* Extensions */}
      <section className="flex flex-col gap-2.5">
        <Title className="m-0 text-[28px]">Extensions</Title>
        <div className="flex flex-col gap-2">
          {ext.map(({ key, title, desc, Icon, accent }) => {
            const on = settings[key];
            return (
              <motion.button key={key} {...press} onClick={() => setSetting({ [key]: !on })} aria-pressed={on}
                className={`flex items-center gap-3 rounded-2xl border p-3 text-left ${FOCUS}`} style={{ background: on ? "#121D33" : "#0E1626", borderColor: on ? accent : "#1E2A43" }}>
                <span className="grid h-10 w-10 flex-none place-items-center rounded-xl bg-[#0A101C]" style={{ color: accent }}><Icon size={20} /></span>
                <span className="flex min-w-0 flex-1 flex-col"><span className="text-[15px] font-bold">{title}</span><span className="text-[13px] leading-snug text-[#94A0B8]">{desc}</span></span>
                <Toggle on={on} color={accent} />
              </motion.button>
            );
          })}
        </div>
      </section>

      <BottomBar>
        <span className="text-center text-[13px] font-semibold tabular-nums text-[#94A0B8]">
          {players.length} pirates · {seq.length} manches · {settings.scoring === "sk" ? "Skull King" : "Rascal"}
        </span>
        <CTA onClick={launch} className="h-14 w-full text-[19px]"><Ship size={24} strokeWidth={2.2} /> Hisser les voiles !</CTA>
      </BottomBar>

      <Sheet open={!!editP} onClose={() => setEditing(null)} label="Personnaliser le pirate">
        {editP && (
          <div className="flex flex-col gap-5 pt-1">
            <div className="flex items-center gap-3">
              <Avatar player={editP} size={56} />
              <Title className="m-0 text-[30px] leading-none">{editP.name || "Pirate"}</Title>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold uppercase tracking-wider text-[#94A0B8]">Emblème</span>
              <div className="grid grid-cols-4 gap-2">
                {ICONS.map((Icon, ii) => (
                  <motion.button key={ii} {...press} onClick={() => updPlayer(editP.id, { icon: ii })} aria-pressed={editP.icon === ii} aria-label={`Emblème ${ICON_NAMES[ii]}`}
                    className={`grid h-16 place-items-center rounded-2xl border-2 ${editP.icon === ii ? "border-[#F2B544] bg-[#2A2112] text-[#F2B544]" : "border-[#1E2A43] bg-[#0E1626] text-[#C3CCDD]"} ${FOCUS}`}>
                    <Icon size={28} />
                  </motion.button>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-[13px] font-bold uppercase tracking-wider text-[#94A0B8]">Couleur</span>
              <div className="grid grid-cols-8 gap-2">
                {COLORS.map((c, ci) => (
                  <motion.button key={c} {...press} onClick={() => updPlayer(editP.id, { color: ci })} aria-pressed={editP.color === ci} aria-label={`Couleur ${COLOR_NAMES[ci]}`}
                    className={`grid aspect-square place-items-center rounded-full ${FOCUS}`} style={{ background: c, boxShadow: editP.color === ci ? `0 0 0 3px #101828, 0 0 0 5px ${c}` : "none" }}>
                    {editP.color === ci && <Check size={18} strokeWidth={3} className="text-[#0A101C]" />}
                  </motion.button>
                ))}
              </div>
            </div>
            <CTA onClick={() => setEditing(null)} className="h-14 text-lg">Terminé</CTA>
          </div>
        )}
      </Sheet>
    </motion.div>
  );
}

/* ═══════════════════════ 2. Jeu (saisie par manche) ═══════════════════════ */

function GameScreen({ players, settings, seq, idx, cards, roundIndex, phase, setPhase, entries, setEntry, totals, rankOf, startYoHo, validateRound, onBonus, onBoard, onSetup }) {
  const n = players.length;
  const isRascal = settings.scoring === "rascal";
  const dealerIdx = idx % n, starterIdx = (idx + 1) % n;
  const betSum = players.reduce((a, p) => a + entries[p.id].bet, 0);
  const trickSum = players.reduce((a, p) => a + entries[p.id].tricks, 0);
  const trickOk = settings.leviathans ? trickSum <= cards : trickSum === cards;
  const free = cards - trickSum;

  const mood = betSum > cards ? ["Ça va saigner", "bg-[#3A1420] text-[#FF9AAA]"]
    : betSum < cards ? ["Plis orphelins", "bg-[#0D2423] text-[#5EEAD4]"] : ["Équilibre parfait", "bg-[#2A2112] text-[#FCE7B8]"];
  const sumColor = trickSum > cards ? "#FF7A8E" : trickOk ? "#2DD4BF" : "#F2B544";
  const validateLabel = trickSum > cards ? `${trickSum - cards} pli${trickSum - cards > 1 ? "s" : ""} en trop`
    : trickOk ? "Valider la manche" : `Encore ${free} pli${free > 1 ? "s" : ""} à attribuer`;

  return (
    <motion.div {...fadeScreen} className="mx-auto max-w-[760px] px-4 pb-40">
      <TopBar>
        <div className="flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={idx} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
                <Title as="h1" className="m-0 whitespace-nowrap text-[32px] leading-none text-[#F2B544] tabular-nums">
                  Manche {idx + 1}<span className="text-[20px] text-[#6F7C96]"> / {seq.length}</span>
                </Title>
              </motion.div>
            </AnimatePresence>
            <span className="inline-flex flex-none items-center gap-1 rounded-full bg-[#1A2540] px-2.5 py-1 text-[13px] font-bold">
              <Layers size={14} className="text-[#2DD4BF]" /> {cards}
              <span className="sr-only"> carte{cards > 1 ? "s" : ""}</span>
            </span>
          </div>
          <Ghost onClick={onBoard} aria-label="Classement" className="grid h-11 w-11 flex-none place-items-center"><BarChart3 size={20} /></Ghost>
          <Ghost onClick={onSetup} aria-label="Réglages" className="grid h-11 w-11 flex-none place-items-center"><SlidersHorizontal size={20} /></Ghost>
        </div>
        <div className="mt-2.5 flex gap-1" aria-hidden>
          {seq.map((c, i) => (
            <motion.div key={i} className="h-1.5 flex-1 rounded-full" animate={{ backgroundColor: i < roundIndex ? "#F2B544" : i === roundIndex ? "#2DD4BF" : "#1E2A43" }} />
          ))}
        </div>
        <div role="tablist" aria-label="Étape de la manche" className="mt-3 grid grid-cols-2 gap-1 rounded-[14px] border border-[#22304B] bg-[#111A2C] p-1">
          {[["bet", "1 · Paris"], ["tricks", "2 · Plis & bonus"]].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={phase === k} onClick={() => setPhase(k)}
              className={`relative h-10 rounded-[10px] text-[14px] font-bold ${phase === k ? "text-[#1B1204]" : "text-[#8390AA]"} ${FOCUS}`}>
              {phase === k && <motion.span layoutId="phase-pill" className="absolute inset-0 rounded-[10px] bg-[#F2B544]" transition={{ type: "spring", stiffness: 500, damping: 35 }} />}
              <span className="relative">{l}</span>
            </button>
          ))}
        </div>
      </TopBar>

      <AnimatePresence mode="wait" initial={false}>
        {phase === "bet" ? (
          <motion.div key={`bet-${idx}`} {...phaseSlide(-1)} className="flex flex-col gap-2.5 pt-3.5">
            <div className="flex items-center justify-between gap-2 px-1">
              <span className="text-[15px] font-semibold tabular-nums">Paris : <b className="text-lg text-[#F2B544]">{betSum}</b> <span className="text-[#94A0B8]">/ {cards} pli{cards > 1 ? "s" : ""}</span></span>
              <span className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${mood[1]}`}>{mood[0]}</span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {players.map((p, i) => {
                const e = entries[p.id];
                const tag = i === dealerIdx ? "Donne" : i === starterIdx ? "Ouvre" : null;
                return (
                  <motion.div key={p.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}>
                    <Panel className="p-2.5 pl-3 transition-colors" style={{ borderColor: isRascal && e.cannon ? "#8E2A40" : e.bet > 0 ? "#3A4A6B" : undefined, background: isRascal && e.cannon ? "#1A1220" : undefined }}>
                     <div className="flex items-center gap-3">
                      <Avatar player={p} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[17px] font-extrabold">{p.name}</span>
                          {tag && <span className={`flex-none rounded-full px-1.5 py-px text-[10.5px] font-bold uppercase tracking-wide ${tag === "Donne" ? "bg-[#1A2540] text-[#C3CCDD]" : "bg-[#2A2112] text-[#FCE7B8]"}`}>{tag}</span>}
                        </div>
                        <div className="text-[13px] tabular-nums text-[#94A0B8]">{totals[p.id]} pts · {ord(rankOf[p.id])}</div>
                      </div>
                      <Stepper value={e.bet} who={`pari de ${p.name}`}
                        onDec={() => setEntry(p.id, { bet: Math.max(0, e.bet - 1) })} onInc={() => setEntry(p.id, { bet: Math.min(cards, e.bet + 1) })}
                        decDisabled={e.bet <= 0} incDisabled={e.bet >= cards} />
                     </div>
                     {isRascal && <ShotPicker p={p} cannon={e.cannon} cards={cards} onPick={(cannon) => setEntry(p.id, { cannon })} />}
                    </Panel>
                  </motion.div>
                );
              })}
            </div>
            <p className="m-0 px-1 text-center text-[13px] text-[#6F7C96]">{players[dealerIdx].name} distribue · {players[starterIdx].name} ouvre le premier pli</p>
          </motion.div>
        ) : (
          <motion.div key={`tricks-${idx}`} {...phaseSlide(1)} className="flex flex-col gap-2.5 pt-3.5">
            <div className="flex flex-col gap-1.5 px-1">
              <div className="flex items-center justify-between">
                <span className="text-[15px] font-semibold tabular-nums">Plis : <b className="text-lg" style={{ color: sumColor }}>{trickSum}</b> <span className="text-[#94A0B8]">/ {cards}</span></span>
                {settings.leviathans && free > 0 && <span className="text-[12.5px] font-semibold text-[#5EEAD4]">{free} détruit{free > 1 ? "s" : ""} par le Kraken ?</span>}
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[#111A2C]">
                <motion.div className="h-full rounded-full" animate={{ width: `${Math.min(100, (trickSum / Math.max(cards, 1)) * 100)}%`, backgroundColor: sumColor }} />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {players.map((p, i) => (
                <TrickRow key={p.id} i={i} p={p} e={entries[p.id]} cards={cards} settings={settings} total={totals[p.id]} free={free} complete={trickOk}
                  onBonus={() => onBonus(p.id)} setEntry={(patch) => setEntry(p.id, patch)} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BottomBar>
        {phase === "bet" ? (
          <CTA onClick={startYoHo} className="h-14 w-full">
            <span className="font-['Pirata_One'] text-[28px] font-normal leading-none">Yo-Ho-Ho !</span>
            <span className="text-[14px] font-bold opacity-75">révéler les paris</span>
          </CTA>
        ) : (
          <div className="flex gap-2">
            <Ghost onClick={() => setPhase("bet")} aria-label="Revenir aux paris" className="grid h-14 w-14 flex-none place-items-center"><ChevronLeft size={24} /></Ghost>
            <CTA onClick={validateRound} disabled={!trickOk} className="h-14 flex-1 text-[17px]">
              {trickOk && <Check size={21} strokeWidth={2.8} />} {validateLabel}
            </CTA>
          </div>
        )}
      </BottomBar>
    </motion.div>
  );
}

function TrickRow({ i, p, e, cards, settings, total, free, complete, onBonus, setEntry }) {
  const sc = scoreEntry(e, cards, settings);
  // Tant que tous les plis ne sont pas attribués, le résultat est provisoire : pas de célébration.
  const hit = complete && sc.hit;
  const tone = complete ? sc.tone : "pending";
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0, transition: { delay: i * 0.04 } }}>
      <Panel className="relative p-2.5 pl-3 transition-colors" style={{ borderColor: hit ? "#1F6F66" : settings.scoring === "rascal" && e.cannon ? "#8E2A40" : undefined, background: hit ? "#0F1E2A" : undefined }}>
        <AnimatePresence>{hit && <SparkBurst key={`${e.bet}-${e.tricks}`} />}</AnimatePresence>
        <div className="flex items-center gap-3">
          <Avatar player={p} size={40} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[17px] font-extrabold">{p.name}</div>
            <div className="flex items-center gap-1.5 text-[13px] text-[#94A0B8]">
              <span className="whitespace-nowrap">Pari <b className="tabular-nums text-[#F2B544]">{e.bet}</b></span>
              {settings.scoring === "rascal" && e.cannon && <ShotBadge />}
            </div>
          </div>
          <Stepper value={e.tricks} who={`plis de ${p.name}`} plusColor="teal"
            onDec={() => setEntry({ tricks: Math.max(0, e.tricks - 1) })} onInc={() => setEntry({ tricks: Math.min(cards, e.tricks + 1) })}
            decDisabled={e.tricks <= 0} incDisabled={e.tricks >= cards || free <= 0} />
        </div>
        <div className="mt-2 flex items-center gap-2 border-t border-[#1E2A43] pt-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px]">
            <span className={`h-2 w-2 flex-none rounded-full ${TONE_DOT[tone]}`} />
            <motion.span key={complete ? sc.label : "pending"} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`truncate font-bold ${TONE_TEXT[tone]}`}>{complete ? sc.label : "En attente"}</motion.span>
          </div>
          <motion.button {...press} onClick={onBonus} aria-label={`Bonus de ${p.name}`}
            className={`flex h-10 flex-none items-center gap-1 rounded-xl px-2.5 text-[14px] font-bold ${sc.raw > 0 ? "bg-[#0D2E2A] text-[#5EEAD4]" : "bg-[#16213A] text-[#C3CCDD]"} ${FOCUS}`}>
            <Sparkles size={15} /> {sc.raw > 0 ? `+${sc.raw}` : "Bonus"}
          </motion.button>
          <div className="flex w-[84px] flex-none items-baseline justify-end gap-1 tabular-nums">
            <motion.span key={sc.total} initial={{ scale: 1.35 }} animate={{ scale: 1 }} className={`text-[21px] font-extrabold ${complete ? ptsColor(sc.total) : "text-[#6F7C96]"}`}>{signed(sc.total)}</motion.span>
          </div>
        </div>
      </Panel>
    </motion.div>
  );
}

function BonusSheet({ p, e, cards, settings, total, setEntry, onClose }) {
  const sc = scoreEntry(e, cards, settings);
  const seg = (on, danger) => (on ? (danger ? "border-[#E05168] bg-[#3A1420] text-[#FFB3BF]" : "border-[#F2B544] bg-[#2A2112] text-[#FCE7B8]") : "border-[#1E2A43] bg-[#0E1626] text-[#C3CCDD]");
  const rows = [
    ["b14c", "14 de couleur", "+10 chacun · vert, violet, jaune", 3],
    ["mermaid", "Sirène capturée par un Pirate", "+20 chacune", 2],
    ["pirate", "Pirate capturé par le Skull King", "+30 chacun (Tigresse incluse)", 6],
    ...(settings.loot ? [["loot", "Alliance Butin réussie", "+20 chacune", 2]] : []),
  ];
  const toggles = [["b14n", "14 noir (Drapeau pirate)", "+20"], ["skc", "Skull King capturé par une Sirène", "+40"]];
  return (
    <div className="flex flex-col gap-4 pt-1">
      <div className="flex items-center gap-3">
        <Avatar player={p} size={48} />
        <div className="min-w-0 flex-1">
          <Title className="m-0 truncate text-[28px] leading-none">{p.name}</Title>
          <div className="text-[13px] tabular-nums text-[#94A0B8]">Pari {e.bet} · {e.tricks} pli{e.tricks > 1 ? "s" : ""} · <span className={TONE_TEXT[sc.tone]}>{sc.label}</span></div>
        </div>
        <div className="text-right tabular-nums">
          <div className={`text-[24px] font-extrabold leading-none ${ptsColor(sc.total)}`}>{signed(sc.total)}</div>
          <div className="text-[12px] text-[#6F7C96]">→ {total + sc.total}</div>
        </div>
      </div>
      {sc.raw > 0 && sc.bonus < sc.raw && (
        <p className="m-0 rounded-xl bg-[#2A1220] px-3 py-2 text-[13px] font-semibold text-[#FF9AAA]">
          {sc.bonus === 0 ? "Pari manqué : ces bonus ne comptent pas cette manche." : "Frappe à revers : la moitié des bonus est comptée."}
        </p>
      )}
      <div className="flex flex-col divide-y divide-[#1E2A43] rounded-2xl border border-[#1E2A43] bg-[#0B1322]">
        {rows.map(([key, label, sub, max]) => (
          <div key={key} className="flex items-center gap-2.5 px-3 py-2.5">
            <div className="min-w-0 flex-1"><div className="text-[15px] font-bold leading-tight">{label}</div><div className="text-[12.5px] text-[#8FB3AE]">{sub}</div></div>
            <Stepper value={e[key]} who={label} plusColor="teal"
              onDec={() => setEntry({ [key]: Math.max(0, e[key] - 1) })} onInc={() => setEntry({ [key]: Math.min(max, e[key] + 1) })}
              decDisabled={e[key] <= 0} incDisabled={e[key] >= max} />
          </div>
        ))}
        {toggles.map(([key, label, sub]) => (
          <button key={key} onClick={() => { buzz(); setEntry({ [key]: !e[key] }); }} aria-pressed={e[key]} className={`flex min-h-[60px] items-center gap-2.5 px-3 py-2 text-left ${FOCUS}`}>
            <span className="min-w-0 flex-1"><span className="block text-[15px] font-bold leading-tight">{label}</span><span className="block text-[12.5px] text-[#8FB3AE]">{sub}</span></span>
            <Toggle on={e[key]} />
          </button>
        ))}
      </div>
      {settings.powers && (
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-bold uppercase tracking-wider text-[#94A0B8]">Mise du Flambeur <span className="normal-case tracking-normal text-[#6F7C96]">(gagnée si exact, perdue sinon)</span></span>
          <div className="grid grid-cols-3 gap-2">
            {[0, 10, 20].map((w) => (
              <button key={w} onClick={() => setEntry({ wager: w })} aria-pressed={e.wager === w} className={`h-12 rounded-xl border-2 text-[15px] font-extrabold ${seg(e.wager === w)}`}>{w === 0 ? "Aucune" : `${w} pts`}</button>
            ))}
          </div>
        </div>
      )}
      <CTA onClick={onClose} className="h-14 text-lg">Terminé</CTA>
    </div>
  );
}

/* ---------- Overlays ---------- */

function CountdownOverlay({ step, players, entries, isRascal, onSkip }) {
  const words = { 1: ["Yo", "#E8ECF4"], 2: ["Ho", "#F2B544"], 3: ["Ho !", "#E05168"] };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onSkip}
      role="dialog" aria-modal="true" aria-label="Révélation des paris"
      className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-6 bg-[rgba(6,10,18,.95)] px-4 pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)] text-center">
      <AnimatePresence mode="wait">
        {step < 4 ? (
          <motion.span key={step} initial={{ opacity: 0, scale: 0.3, rotate: -10 }} animate={{ opacity: 1, scale: [0.3, 1.18, 1], rotate: [-10, 3, 0] }} exit={{ opacity: 0, scale: 1.4 }} transition={{ duration: 0.45 }}
            className="font-['Pirata_One'] text-[112px] leading-none" style={{ color: words[step][1] }}>{words[step][0]}</motion.span>
        ) : (
          <motion.div key="reveal" initial={{ opacity: 0, scale: 0.7 }} animate={{ opacity: 1, scale: 1 }} className="flex w-full max-w-[420px] flex-col items-center gap-4">
            <span className="font-['Pirata_One'] text-[46px] leading-none text-[#F2B544]">Paris révélés !</span>
            <div className="grid w-full grid-cols-2 gap-2">
              {players.map((p, i) => (
                <motion.div key={p.id} initial={{ opacity: 0, y: 20, rotateX: 90 }} animate={{ opacity: 1, y: 0, rotateX: 0 }} transition={{ delay: i * 0.07 }}
                  className="flex items-center gap-2 rounded-2xl border bg-[#111A2C] p-2" style={{ borderColor: COLORS[p.color] }}>
                  <Avatar player={p} size={30} />
                  <span className="min-w-0 flex-1 truncate text-left text-[15px] font-bold">{p.name}</span>
                  {isRascal && entries[p.id].cannon && <Bomb size={16} className="flex-none text-[#E05168]" aria-label="Boulet de canon" />}
                  <b className="pr-1 text-[24px] tabular-nums text-[#F2B544]">{entries[p.id].bet}</b>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <span className="text-[14px] text-[#6F7C96]">Frappez trois fois sur la table ! · touchez pour passer</span>
    </motion.div>
  );
}

function RoundSummary({ players, results, totals, seq, isRascal, last, onNext, onUndo }) {
  const r = results[results.length - 1];
  const nextCards = seq[results.length];
  return (
    <div className="flex flex-col gap-3.5 pt-1">
      <div className="flex items-baseline justify-between gap-2">
        <Title className="m-0 text-[30px] leading-none text-[#F2B544]">Manche {results.length} terminée</Title>
        <span className="flex-none text-[13px] text-[#94A0B8]">{r.cards} carte{r.cards > 1 ? "s" : ""}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[...players].sort((a, b) => r.res[b.id].total - r.res[a.id].total).map((p, i) => {
          const x = r.res[p.id], e = r.entries[p.id];
          const parts = [`${e.bet} annoncé${e.bet > 1 ? "s" : ""} · ${e.tricks} fait${e.tricks > 1 ? "s" : ""}`];
          if (isRascal && e.cannon) parts.unshift("Boulet");
          if (x.bonus) parts.push(`bonus ${signed(x.bonus)}`);
          if (x.wager) parts.push(`Flambeur ${signed(x.wager)}`);
          return (
            <motion.div key={p.id} initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0, transition: { delay: 0.12 + i * 0.06 } }}
              className="flex items-center gap-2.5 rounded-[14px] border bg-[#0B1322] p-2.5" style={{ borderColor: x.hit ? "#1F6F66" : "#1E2A43" }}>
              <Avatar player={p} size={34} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1 font-extrabold">
                  <span className="truncate">{p.name}</span>
                  {x.hit && <motion.span initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1], rotate: 180 }} transition={{ delay: 0.3 + i * 0.06, duration: 0.6 }} className="text-[#F2B544]"><Sparkles size={15} fill="currentColor" strokeWidth={0} /></motion.span>}
                </div>
                <div className="truncate text-[12.5px] tabular-nums text-[#94A0B8]">{parts.join(" · ")}</div>
              </div>
              <div className="text-right tabular-nums">
                <div className={`text-[20px] font-extrabold leading-tight ${ptsColor(x.total)}`}>{signed(x.total)}</div>
                <div className="text-[12px] text-[#6F7C96]">= {totals[p.id]}</div>
              </div>
            </motion.div>
          );
        })}
      </div>
      <CTA onClick={onNext} className="h-14 text-[17px]">
        {last ? <><Crown size={20} /> Voir le podium</> : `Manche ${results.length + 1} · ${nextCards} carte${nextCards > 1 ? "s" : ""}`}
      </CTA>
      <button onClick={onUndo} className="flex h-11 items-center justify-center gap-1.5 text-[14px] font-semibold text-[#94A0B8]"><RotateCcw size={15} /> Corriger cette manche</button>
    </div>
  );
}

/* ═══════════════════════ 3. Classement ═══════════════════════ */

function BoardScreen({ players, settings, seq, results, ranking, hits, totals, finished, onBack }) {
  const [showTable, setShowTable] = useState(false);
  const last = results[results.length - 1];
  const medal = { 1: "bg-[#F2B544] text-[#1B1204]", 2: "bg-[#C9D2E3] text-[#141B2A]", 3: "bg-[#C27A43] text-[#1B0F05]" };

  const W = 600, H = 200, padT = 12, padB = 12;
  const cum = Object.fromEntries(players.map((p) => [p.id, [0]]));
  results.forEach((r) => players.forEach((p) => { const a = cum[p.id]; a.push(a[a.length - 1] + r.res[p.id].total); }));
  const all = Object.values(cum).flat();
  const minY = Math.min(0, ...all);
  let maxY = Math.max(...all);
  if (maxY - minY < 50) maxY = minY + 50;
  const y = (v) => padT + ((maxY - v) / (maxY - minY)) * (H - padT - padB);
  const x = (i) => (i / Math.max(seq.length, 1)) * W;
  const step = Math.max(50, Math.ceil((maxY - minY) / 4 / 50) * 50);
  const grid = [];
  for (let g = Math.ceil(minY / step) * step; g <= maxY; g += step) grid.push(g);

  return (
    <motion.div {...fadeScreen} className="mx-auto flex max-w-[760px] flex-col gap-4 px-4 pb-32">
      <TopBar>
        <div className="flex items-center gap-2">
          <Ghost onClick={onBack} aria-label="Retour" className="grid h-11 w-11 flex-none place-items-center"><ChevronLeft size={22} /></Ghost>
          <div className="min-w-0">
            <Title as="h1" className="m-0 text-[32px] leading-none text-[#F2B544]">Classement</Title>
            <span className="text-[13px] tabular-nums text-[#94A0B8]">{results.length} / {seq.length} manches · {settings.scoring === "sk" ? "Skull King" : "Rascal"}</span>
          </div>
        </div>
      </TopBar>

      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {ranking.map((r, i) => {
          const lr = last?.res[r.p.id];
          return (
            <motion.li key={r.p.id} initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0, transition: { delay: i * 0.05 } }}>
              <Panel className="flex items-center gap-3 p-2.5 pr-3.5" style={{ borderColor: r.rank === 1 ? "#6B5220" : undefined }}>
                <span className={`grid h-10 w-10 flex-none place-items-center rounded-xl font-['Pirata_One'] text-[22px] ${medal[r.rank] ?? "bg-[#1A2540] text-[#C3CCDD]"}`}>{r.rank}</span>
                <Avatar player={r.p} size={36} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1 text-[16px] font-extrabold"><span className="truncate">{r.p.name}</span>{r.rank === 1 && results.length > 0 && <Crown size={16} className="flex-none text-[#F2B544]" aria-label="En tête" />}</div>
                  <div className="text-[12.5px] tabular-nums text-[#94A0B8]">{results.length ? `${hits[r.p.id]}/${results.length} paris réussis` : "Aucune manche"}</div>
                </div>
                <div className="text-right tabular-nums">
                  <div className="text-[24px] font-extrabold leading-none">{r.total}</div>
                  {lr && <div className={`text-[12.5px] font-bold ${ptsColor(lr.total)}`}>{signed(lr.total)}</div>}
                </div>
              </Panel>
            </motion.li>
          );
        })}
      </ol>

      <Panel className="flex flex-col gap-2.5 p-3.5">
        <Title className="m-0 text-[24px]">Cap des scores</Title>
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {players.map((p) => <span key={p.id} className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[#C3CCDD]"><span className="h-1 w-3 rounded" style={{ background: COLORS[p.color] }} />{p.name}</span>)}
        </div>
        <div className="relative h-[200px]">
          <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Évolution des scores cumulés par manche" className="block">
            {grid.map((g) => <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke={g === 0 ? "#3A4A6B" : "#1A2540"} strokeDasharray={g === 0 ? "0" : "4 6"} vectorEffect="non-scaling-stroke" />)}
            {players.map((p) => (
              <motion.polyline key={p.id} fill="none" stroke={COLORS[p.color]} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke"
                points={cum[p.id].map((v, i) => `${x(i)},${y(v)}`).join(" ")} initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: "easeOut" }} />
            ))}
          </svg>
          {grid.map((g) => <span key={g} className="absolute left-1 -translate-y-full text-[11px] tabular-nums text-[#6F7C96]" style={{ top: `${(y(g) / H) * 100}%` }}>{g}</span>)}
        </div>
        <div className="flex justify-between">
          {[0, ...seq.map((_, i) => i + 1)].map((n) => <span key={n} className="w-4 text-center text-[11px] tabular-nums text-[#6F7C96]">{n}</span>)}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <button onClick={() => setShowTable((v) => !v)} aria-expanded={showTable} className={`flex min-h-14 w-full items-center justify-between px-3.5 ${FOCUS}`}>
          <Title as="span" className="text-[24px]">Manche par manche</Title>
          <motion.span animate={{ rotate: showTable ? 180 : 0 }}><ChevronDown size={22} /></motion.span>
        </button>
        <AnimatePresence initial={false}>
          {showTable && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-[#1E2A43]">
              <div className="overflow-x-auto overscroll-x-contain">
                <table className="w-full border-collapse text-[14px] tabular-nums">
                  <thead>
                    <tr>
                      <th className="sticky left-0 bg-[#111A2C] px-3 py-2 text-left text-[12px] font-semibold text-[#94A0B8]">M.</th>
                      {players.map((p) => <th key={p.id} className="max-w-[90px] truncate whitespace-nowrap px-2.5 py-2 text-right text-[13px] font-extrabold" style={{ color: COLORS[p.color] }}>{p.name}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <tr key={i} className="border-t border-[#1E2A43]">
                        <td className="sticky left-0 bg-[#111A2C] px-3 py-2 font-bold">{i + 1}<span className="ml-1 text-[11px] font-medium text-[#6F7C96]">{r.cards}c</span></td>
                        {players.map((p) => (
                          <td key={p.id} className="whitespace-nowrap px-2.5 py-2 text-right">
                            <b className={ptsColor(r.res[p.id].total)}>{signed(r.res[p.id].total)}</b>
                            <div className="text-[11px] text-[#6F7C96]">{settings.scoring === "rascal" && r.entries[p.id].cannon && <Bomb size={10} className="mr-0.5 inline align-[-1px] text-[#E05168]" aria-label="Boulet" />}{r.entries[p.id].bet}/{r.entries[p.id].tricks}</div>
                          </td>
                        ))}
                      </tr>
                    ))}
                    <tr className="border-t-2 border-[#3A4A6B]">
                      <td className="sticky left-0 bg-[#111A2C] px-3 py-2.5 font-extrabold text-[#F2B544]">Σ</td>
                      {players.map((p) => <td key={p.id} className="px-2.5 py-2.5 text-right text-[16px] font-extrabold text-[#F2B544]">{totals[p.id]}</td>)}
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="m-0 px-3.5 pb-3 pt-1 text-[12px] text-[#6F7C96]">Sous chaque score : pari / plis réalisés.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </Panel>

      <BottomBar>
        <CTA onClick={onBack} className="h-14 w-full text-[17px]"><ChevronLeft size={20} strokeWidth={2.6} /> {finished ? "Retour au podium" : "Retour à la manche"}</CTA>
      </BottomBar>
    </motion.div>
  );
}

/* ═══════════════════════ 4. Fin de partie ═══════════════════════ */

function FallingTreasure() {
  const pieces = useMemo(() => {
    const cc = ["#F2B544", "#E05168", "#2DD4BF", "#FFE08A", "#5AA9FF"];
    return Array.from({ length: 40 }, (_, k) => {
      const coin = k % 3 === 0;
      const size = coin ? 14 + Math.random() * 8 : 6 + Math.random() * 6;
      return { k, coin, size, left: Math.random() * 100, dur: 4 + Math.random() * 5, delay: Math.random() * 4, color: coin ? "#F2B544" : cc[k % cc.length] };
    });
  }, []);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {pieces.map((p) => (
        <motion.span key={p.k} className="absolute top-0" initial={{ y: "-12vh", rotate: 0 }} animate={{ y: "115vh", rotate: 720 }} transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "linear" }}
          style={{ left: `${p.left}%`, width: p.size, height: p.coin ? p.size : p.size * 1.8, background: p.color, borderRadius: p.coin ? "50%" : 2, boxShadow: p.coin ? "inset 0 0 0 3px #C98A1B" : "none" }} />
      ))}
    </div>
  );
}

function EndScreen({ players, results, ranking, hits, onRematch, onBoard, onNewCrew }) {
  const winners = ranking.filter((x) => x.rank === 1);
  const winner = ranking[0];
  const podium = [ranking[1], ranking[0], ranking[2]].filter(Boolean);
  const col = { 1: ["h-[132px]", "bg-[#F2B544] text-[#1B1204]"], 2: ["h-[96px]", "bg-[#C9D2E3] text-[#141B2A]"], 3: ["h-[70px]", "bg-[#C27A43] text-[#1B0F05]"] };

  const awards = useMemo(() => {
    const best = (fn) => players.reduce((b, p) => { const v = fn(p); return b === null || v > b.v ? { p, v } : b; }, null);
    const out = [];
    if (!results.length) return out;
    const acc = best((p) => hits[p.id]);
    out.push({ title: "Pari parfait", who: acc.p.name, detail: `${acc.v}/${results.length} paris exacts`, Icon: Target, accent: "#2DD4BF" });
    const bon = best((p) => results.reduce((a, r) => a + r.res[p.id].bonus, 0));
    if (bon.v > 0) out.push({ title: "Chasseur de trésors", who: bon.p.name, detail: `+${bon.v} pts de bonus`, Icon: Gem, accent: "#A78BFA" });
    const zero = best((p) => results.filter((r) => r.entries[p.id].bet === 0 && r.entries[p.id].tricks === 0).length);
    if (zero.v > 0) out.push({ title: "Fantôme des abysses", who: zero.p.name, detail: `${zero.v} zéro${zero.v > 1 ? "s" : ""} tenu${zero.v > 1 ? "s" : ""}`, Icon: GhostIcon, accent: "#5AA9FF" });
    let worst = { v: 0 };
    results.forEach((r, i) => players.forEach((p) => { if (r.res[p.id].total < worst.v) worst = { v: r.res[p.id].total, p, i }; }));
    if (worst.p) out.push({ title: "Naufrage du siècle", who: worst.p.name, detail: `${signed(worst.v)} en manche ${worst.i + 1}`, Icon: Skull, accent: "#E05168" });
    return out;
  }, [players, results, hits]);

  return (
    <motion.div {...fadeScreen} className="relative">
      <FallingTreasure />
      <div className="relative z-[1] mx-auto flex max-w-[640px] flex-col items-center gap-6 px-4 pb-36 pt-[max(28px,env(safe-area-inset-top))]">
        <div className="flex w-full flex-col items-center gap-1 text-center">
          <span className="text-[12px] font-bold uppercase tracking-[.25em] text-[#2DD4BF]">Capitaine des Sept Mers</span>
          <motion.h1 initial={{ scale: 0.3, rotate: -10, opacity: 0 }} animate={{ scale: [0.3, 1.15, 1], rotate: [-10, 3, 0], opacity: 1 }} transition={{ duration: 0.6, delay: 0.2 }}
            className="m-0 max-w-full break-words font-['Pirata_One'] text-[clamp(40px,14vw,72px)] font-normal leading-none text-[#F2B544]">
            {winners.map((w) => w.p.name).join(" & ")}
          </motion.h1>
          <span className="text-[15px] tabular-nums text-[#C3CCDD]">{winner.total} pts · {hits[winner.p.id]}/{results.length} paris réussis</span>
        </div>

        <div className="grid w-full grid-cols-3 items-end gap-2">
          {podium.map((x) => {
            const pos = ranking.indexOf(x) + 1;
            return (
              <div key={x.p.id} className="flex min-w-0 flex-col items-center gap-1.5">
                {pos === 1 && <motion.span animate={{ y: [0, -5, 0] }} transition={{ duration: 3, repeat: Infinity }}><Crown size={28} className="fill-[#F2B544] text-[#F2B544]" /></motion.span>}
                <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.6 + (pos === 1 ? 0.4 : 0), type: "spring" }} className="rounded-full" style={{ boxShadow: `0 0 0 3px #0A101C, 0 0 0 5px ${COLORS[x.p.color]}` }}>
                  <Avatar player={x.p} size={pos === 1 ? 68 : 52} />
                </motion.span>
                <span className="max-w-full truncate text-[15px] font-extrabold">{x.p.name}</span>
                <span className="text-[13px] font-bold tabular-nums text-[#C3CCDD]">{x.total} pts</span>
                <motion.div initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.9, delay: pos === 1 ? 0.5 : 0.2, ease: [0.2, 0.8, 0.2, 1] }}
                  className={`flex w-full origin-bottom justify-center rounded-b-md rounded-t-2xl pt-2 ${col[pos][0]} ${col[pos][1]}`}>
                  <span className="font-['Pirata_One'] text-[38px] leading-none">{x.rank}</span>
                </motion.div>
              </div>
            );
          })}
        </div>

        {ranking.length > 3 && (
          <div className="flex w-full flex-col gap-1.5">
            {ranking.slice(3).map((x) => (
              <Panel key={x.p.id} className="flex items-center gap-3 px-3 py-2">
                <span className="w-6 font-['Pirata_One'] text-[20px] text-[#94A0B8]">{x.rank}</span>
                <Avatar player={x.p} size={30} />
                <span className="min-w-0 flex-1 truncate font-bold">{x.p.name}</span>
                <span className="font-extrabold tabular-nums">{x.total} pts</span>
              </Panel>
            ))}
          </div>
        )}

        {awards.length > 0 && (
          <section className="flex w-full flex-col gap-2.5">
            <Title className="m-0 text-center text-[26px]">Distinctions</Title>
            <div className="grid grid-cols-2 gap-2">
              {awards.map(({ title, who, detail, Icon, accent }, i) => (
                <motion.div key={title} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0, transition: { delay: 1 + i * 0.1 } }}>
                  <Panel className="flex h-full flex-col gap-1.5 p-3" style={{ borderColor: `${accent}55` }}>
                    <span className="flex items-center gap-1.5" style={{ color: accent }}><Icon size={18} /><span className="font-['Pirata_One'] text-[19px] leading-tight">{title}</span></span>
                    <span className="truncate text-[16px] font-extrabold">{who}</span>
                    <span className="text-[12.5px] tabular-nums text-[#94A0B8]">{detail}</span>
                  </Panel>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        <div className="grid w-full grid-cols-2 gap-2">
          <Ghost onClick={onBoard} className="h-12 text-[15px] font-bold">Détail des scores</Ghost>
          <Ghost onClick={onNewCrew} className="h-12 text-[15px] font-bold">Nouvel équipage</Ghost>
        </div>
      </div>
      <BottomBar>
        <CTA onClick={onRematch} className="h-14 w-full text-lg"><RotateCcw size={21} strokeWidth={2.4} /> Revanche !</CTA>
      </BottomBar>
    </motion.div>
  );
}
