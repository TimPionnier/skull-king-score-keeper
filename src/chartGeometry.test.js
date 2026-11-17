import { describe, expect, it } from "vitest";
import {
  buildScale,
  cumulativeScores,
  findNearestLine,
  scoreAxis,
  toPoints,
} from "./chartGeometry.js";

const players = [{ id: "a" }, { id: "b" }];
const round = (a, b) => ({ res: { a: { total: a }, b: { total: b } } });

describe("cumulativeScores", () => {
  it("commence à 0 et additionne manche après manche, avec les scores négatifs", () => {
    const series = cumulativeScores(players, [
      round(20, -10),
      round(-30, 40),
      round(0, 10),
    ]);
    expect(series.a).toEqual([0, 20, -10, -10]);
    expect(series.b).toEqual([0, -10, 30, 40]);
  });
  it("sans manche jouée, chaque joueur n'a que le point d'origine", () => {
    expect(cumulativeScores(players, [])).toEqual({ a: [0], b: [0] });
  });
});

describe("scoreAxis", () => {
  it("encadre toutes les valeurs avec des graduations régulières", () => {
    const { min, max, ticks } = scoreAxis([0, 20, 130]);
    expect(min).toBeLessThanOrEqual(0);
    expect(max).toBeGreaterThanOrEqual(130);
    const steps = ticks.slice(1).map((tick, i) => tick - ticks[i]);
    expect(new Set(steps).size).toBe(1);
    expect(ticks).toContain(0);
  });
  it("garde une amplitude minimale quand les scores sont proches de zéro", () => {
    const { min, max } = scoreAxis([0, 10]);
    expect(max - min).toBeGreaterThanOrEqual(50);
  });
  it("inclut les scores négatifs et reste aligné sur le zéro", () => {
    const { min, max, ticks } = scoreAxis([0, -120, 30]);
    expect(min).toBeLessThanOrEqual(-120);
    expect(max).toBeGreaterThanOrEqual(30);
    expect(ticks).toContain(0);
  });
  it("laisse de la marge sous le score maximal : aucune valeur sur le bord haut non gradué", () => {
    const { max } = scoreAxis([0, 101]);
    expect(max).toBeGreaterThan(101);
  });
});

describe("buildScale", () => {
  const padding = { top: 10, right: 20, bottom: 30, left: 40 };
  const scale = buildScale({
    values: [0, 100, -50],
    roundCount: 10,
    width: 640,
    height: 240,
    padding,
  });

  it("place la manche 0 au bord gauche de la zone et la dernière manche au bord droit", () => {
    expect(scale.x(0)).toBe(40);
    expect(scale.x(10)).toBe(620);
    expect(scale.x(5)).toBe(330);
  });
  it("place le score maximal en haut et le minimal en bas de la zone de tracé", () => {
    expect(scale.y(scale.axis.max)).toBe(10);
    expect(scale.y(scale.axis.min)).toBe(210);
  });
  it("est strictement décroissante : un meilleur score est plus haut", () => {
    expect(scale.y(100)).toBeLessThan(scale.y(0));
    expect(scale.y(0)).toBeLessThan(scale.y(-50));
  });
  it("une graduation de l'axe tombe exactement sur chaque score gradué", () => {
    const [low, high] = [scale.axis.ticks[0], scale.axis.ticks.at(-1)];
    expect(scale.y(low)).toBe(210);
    expect(scale.y(high)).toBe(10);
  });
  it("génère une graduation par manche, de 0 à roundCount", () => {
    expect(scale.roundTicks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });
  it("un point de données et l'étiquette de sa manche partagent la même abscisse", () => {
    const [, second] = toPoints([0, 50], scale);
    expect(second.px).toBe(scale.x(second.round));
    expect(second.py).toBe(scale.y(50));
  });
});

describe("findNearestLine", () => {
  const line = (id, coords) => ({
    id,
    points: coords.map(([px, py], round) => ({ round, px, py })),
  });
  const lines = [
    line("a", [
      [0, 100],
      [100, 100],
      [200, 100],
    ]),
    line("b", [
      [0, 100],
      [100, 20],
      [200, 100],
    ]),
  ];

  it("choisit la courbe sous le pointeur, y compris entre deux points", () => {
    expect(findNearestLine(lines, { px: 150, py: 100 }, 10)?.id).toBe("a");
    expect(findNearestLine(lines, { px: 50, py: 60 }, 10)?.id).toBe("b");
  });
  it("renvoie la manche dont le point est le plus proche en abscisse", () => {
    expect(findNearestLine(lines, { px: 130, py: 100 }, 10)?.round).toBe(1);
    expect(findNearestLine(lines, { px: 190, py: 100 }, 10)?.round).toBe(2);
  });
  it("ne renvoie rien au-delà de la distance maximale", () => {
    expect(findNearestLine(lines, { px: 100, py: 60 }, 10)).toBeNull();
  });
  it("à courbes superposées, la dernière (premier plan) l'emporte", () => {
    expect(findNearestLine(lines, { px: 0, py: 100 }, 10)?.id).toBe("b");
  });
  it("fonctionne avec un seul point (aucune manche jouée)", () => {
    const single = [line("a", [[0, 100]])];
    expect(findNearestLine(single, { px: 3, py: 104 }, 10)?.id).toBe("a");
    expect(findNearestLine(single, { px: 50, py: 100 }, 10)).toBeNull();
  });
});
