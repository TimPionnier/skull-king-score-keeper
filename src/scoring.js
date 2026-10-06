/**
 * Règles de score de Skull King (livret officiel FR, p. 14-20 et 25-26).
 * Module pur, sans React : importé par l'app et par les tests unitaires.
 */

export const VARIANTS = [
  { id: "classic", name: "Classique", desc: "10 manches · 1 → 10", seq: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { id: "even", name: "Pas d'impair", desc: "5 manches · 2 → 10", seq: [2, 4, 6, 8, 10] },
  { id: "combat", name: "Prêt au combat", desc: "5 manches · 6 → 10", seq: [6, 7, 8, 9, 10] },
  { id: "eclair", name: "Attaque éclair", desc: "5 manches · 5 cartes", seq: [5, 5, 5, 5, 5] },
  { id: "barrage", name: "Tir de barrage", desc: "10 manches · 10 cartes", seq: Array(10).fill(10) },
  { id: "tourbillon", name: "Tourbillon", desc: "5 manches · 9 → 1", seq: [9, 7, 5, 3, 1] },
];

/**
 * Bonus qui exigent d'avoir gagné au moins un pli : captures, 14 et mise du Flambeur (pouvoir de pirate).
 * L'alliance Butin n'en fait pas partie : celui qui pose le Butin s'allie au gagnant du pli, il peut donc n'en avoir aucun.
 */
export const TRICK_BONUS = { b14c: 0, b14n: false, mermaid: 0, pirate: 0, skc: false, wager: 0 };
export const newEntry = () => ({ bet: 0, tricks: 0, ...TRICK_BONUS, loot: 0, cannon: false });
export const freshEntries = (players) => Object.fromEntries(players.map((p) => [p.id, newEntry()]));

/** Séquence de cartes par manche, plafonnée par la taille de la pioche (7-8 joueurs). */
export function roundSequence(settings, nPlayers) {
  const v = VARIANTS.find((x) => x.id === settings.variant) ?? VARIANTS[0];
  const deck = 70 + (settings.loot ? 2 : 0) + (settings.leviathans ? 2 : 0);
  const cap = Math.floor(deck / Math.max(nPlayers, 1));
  return v.seq.map((c) => Math.min(c, cap));
}

/** Somme des bonus déclarés. Sans pli gagné, aucune carte n'a pu être capturée : seule l'alliance Butin peut compter. */
export const rawBonus = (e, st) =>
  (e.tricks > 0 ? e.b14c * 10 + (e.b14n ? 20 : 0) + e.mermaid * 20 + e.pirate * 30 + (e.skc ? 40 : 0) : 0) +
  (st.loot ? e.loot * 20 : 0);

/** Tous les plis sont attribués (le Kraken peut en détruire, d'où ≤ avec les Léviathans). */
export function tricksComplete(entries, players, cards, settings) {
  const sum = players.reduce((a, p) => a + (entries[p.id]?.tricks ?? 0), 0);
  return settings.leviathans ? sum <= cards : sum === cards;
}

/** Barème officiel : Skull King (classique) ou Rascal (Chevrotine ou Boulet de canon, choisi par joueur à chaque manche) + mise du Flambeur. */
export function scoreEntry(e, cards, st) {
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
    // Pari à zéro raté : −10 × cartes, quel que soit le nombre de plis. Sinon −10 par pli d'écart.
    base = e.bet === 0 ? -10 * cards : -10 * diff;
    label = `Raté de ${diff}`;
  }
  const wager = st.powers && e.wager && e.tricks > 0 ? (diff === 0 ? e.wager : -e.wager) : 0;
  return { base, bonus, raw, wager, total: base + bonus + wager, hit: diff === 0, diff, label, tone };
}
