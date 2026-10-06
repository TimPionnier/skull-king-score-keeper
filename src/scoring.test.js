import { describe, expect, it } from "vitest";
import { newEntry, rawBonus, roundSequence, scoreEntry, tricksComplete } from "./scoring.js";

const SK = { scoring: "sk", variant: "classic", loot: false, leviathans: false, powers: false };
const RASCAL = { ...SK, scoring: "rascal" };
const e = (patch) => ({ ...newEntry(), ...patch });
const total = (patch, cards, st = SK) => scoreEntry(e(patch), cards, st).total;

describe("Décompte Skull King — pari ≥ 1", () => {
  it("pari réussi : +20 par pli annoncé (livret p.14 : 3/3 → 60)", () => {
    expect(total({ bet: 3, tricks: 3 }, 5)).toBe(60);
  });
  it("pari raté : −10 par pli d'écart, en plus ou en moins (p.15 : 2 annoncés, 4 faits → −20)", () => {
    expect(total({ bet: 2, tricks: 4 }, 6)).toBe(-20);
    expect(total({ bet: 4, tricks: 1 }, 6)).toBe(-30);
  });
  it("pari raté : aucun bonus", () => {
    expect(total({ bet: 2, tricks: 3, pirate: 2, skc: true }, 6)).toBe(-10);
  });
  it("pari réussi : bonus ajoutés", () => {
    expect(total({ bet: 2, tricks: 2, pirate: 1 }, 6)).toBe(40 + 30);
  });
});

describe("Décompte Skull King — pari à zéro", () => {
  it("zéro tenu : +10 × cartes de la manche (p.15 : manche 7 → 70)", () => {
    expect(total({ bet: 0, tricks: 0 }, 7)).toBe(70);
  });
  it("zéro raté : −10 × cartes, quel que soit le nombre de plis (p.15 : manche 9, 2 plis → −90)", () => {
    expect(total({ bet: 0, tricks: 1 }, 9)).toBe(-90);
    expect(total({ bet: 0, tricks: 2 }, 9)).toBe(-90);
    expect(total({ bet: 0, tricks: 4 }, 9)).toBe(-90);
  });
  it("zéro tenu : des bonus saisis par erreur sont ignorés (aucun pli = aucune capture)", () => {
    expect(total({ bet: 0, tricks: 0, b14c: 2, skc: true }, 4)).toBe(40);
  });
});

describe("Barème des bonus (p.16)", () => {
  const b = (patch, st = SK) => rawBonus(e({ tricks: 1, ...patch }), st);
  it("14 de couleur : +10 chacun ; 14 noir : +20", () => {
    expect(b({ b14c: 3 })).toBe(30);
    expect(b({ b14n: true })).toBe(20);
  });
  it("Sirène capturée par un Pirate : +20 ; Pirate capturé par le Skull King : +30 ; Skull King capturé par une Sirène : +40", () => {
    expect(b({ mermaid: 1 })).toBe(20);
    expect(b({ pirate: 2 })).toBe(60);
    expect(b({ skc: true })).toBe(40);
  });
  it("exemple du livret : la Sirène prend le Skull King et le 14 jaune → +50", () => {
    expect(total({ bet: 1, tricks: 1, b14c: 1, skc: true }, 4)).toBe(20 + 50);
  });
  it("Butin : +20 par alliance, seulement si l'extension est active", () => {
    expect(b({ loot: 1 })).toBe(0);
    expect(b({ loot: 1 }, { ...SK, loot: true })).toBe(20);
  });
  it("aucun bonus de capture sans pli gagné", () => {
    expect(rawBonus(e({ tricks: 0, b14c: 1, pirate: 1, mermaid: 1, skc: true, b14n: true }), SK)).toBe(0);
  });
  it("alliance Butin possible sans pli : zéro tenu + alliance réussie (manche 3 → 30 + 20)", () => {
    const LOOT = { ...SK, loot: true };
    expect(rawBonus(e({ tricks: 0, loot: 1 }), LOOT)).toBe(20);
    expect(total({ bet: 0, tricks: 0, loot: 1, pirate: 1 }, 3, LOOT)).toBe(50);
    expect(total({ bet: 0, tricks: 1, loot: 1 }, 3, LOOT)).toBe(-30);
  });
});

describe("Mise du Flambeur (pouvoirs, p.26)", () => {
  const P = { ...SK, powers: true };
  it("gagnée si le pari est exact, perdue sinon", () => {
    expect(total({ bet: 1, tricks: 1, wager: 20 }, 3, P)).toBe(40);
    expect(total({ bet: 2, tricks: 1, wager: 10 }, 3, P)).toBe(-20);
  });
});

describe("Décompte Rascal (p.18-20)", () => {
  it("Chevrotine : coup direct / frappe à revers / échec cuisant (exemple B, 4 cartes → 40 / 20 / 0)", () => {
    expect(total({ bet: 1, tricks: 1 }, 4, RASCAL)).toBe(40);
    expect(total({ bet: 0, tricks: 1 }, 4, RASCAL)).toBe(20);
    expect(total({ bet: 4, tricks: 2 }, 4, RASCAL)).toBe(0);
  });
  it("Boulet de canon : 15 × cartes si exact, sinon 0 (6 cartes → 90 / 0)", () => {
    expect(total({ bet: 3, tricks: 3, cannon: true }, 6, RASCAL)).toBe(90);
    expect(total({ bet: 3, tricks: 2, cannon: true }, 6, RASCAL)).toBe(0);
  });
  it("frappe à revers : moitié des bonus", () => {
    expect(total({ bet: 2, tricks: 1, pirate: 1 }, 6, RASCAL)).toBe(30 + 15);
  });
});

describe("Cohérence de manche", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const en = (...t) => Object.fromEntries(players.map((p, i) => [p.id, e({ tricks: t[i] })]));
  it("la somme des plis doit égaler le nombre de cartes", () => {
    expect(tricksComplete(en(1, 1, 1), players, 3, SK)).toBe(true);
    expect(tricksComplete(en(1, 1, 0), players, 3, SK)).toBe(false);
    expect(tricksComplete(en(2, 1, 1), players, 3, SK)).toBe(false);
  });
  it("avec le Kraken, un pli peut être détruit (somme ≤ cartes)", () => {
    expect(tricksComplete(en(1, 1, 0), players, 3, { ...SK, leviathans: true })).toBe(true);
  });
  it("partie classique : 10 manches de 1 à 10 cartes ; plafond de pioche à 8 joueurs", () => {
    expect(roundSequence(SK, 3)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(roundSequence(SK, 8).at(-1)).toBe(8);
  });
});
