/**
 * Géométrie du graphique « Cap des scores » : calculs purs (sans React) pour pouvoir les tester.
 */

export const MIN_SCORE_SPAN = 50;
export const TICK_STEP_UNIT = 50;
export const TARGET_TICK_COUNT = 4;

/** Scores cumulés par joueur : [0, total après la manche 1, total après la manche 2, ...]. */
export function cumulativeScores(players, results) {
  const series = Object.fromEntries(players.map((p) => [p.id, [0]]));
  results.forEach((round) => {
    players.forEach((p) => {
      const points = series[p.id];
      points.push(points[points.length - 1] + round.res[p.id].total);
    });
  });
  return series;
}

/** Graduations de l'axe des scores : multiples d'un même pas, qui encadrent toutes les valeurs. */
export function scoreAxis(values) {
  const lowest = Math.min(0, ...values);
  const highest = Math.max(0, ...values);
  const span = Math.max(highest - lowest, MIN_SCORE_SPAN);
  const step = Math.max(
    TICK_STEP_UNIT,
    Math.ceil(span / TARGET_TICK_COUNT / TICK_STEP_UNIT) * TICK_STEP_UNIT,
  );
  const min = Math.floor(lowest / step) * step;
  const max = Math.max(Math.ceil(highest / step) * step, min + step);
  const ticks = [];
  for (let tick = min; tick <= max; tick += step) ticks.push(tick);
  return { min, max, ticks };
}

/**
 * Échelles du graphique en pixels réels (pas d'étirement du SVG) : l'axe X va de la manche 0 à `roundCount`,
 * même quand seules quelques manches sont jouées, pour que la courbe progresse vers sa position finale.
 */
export function buildScale({ values, roundCount, width, height, padding }) {
  const axis = scoreAxis(values);
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const x = (round) =>
    padding.left + (round / Math.max(roundCount, 1)) * innerWidth;
  const y = (score) =>
    padding.top + ((axis.max - score) / (axis.max - axis.min)) * innerHeight;
  const roundTicks = Array.from(
    { length: roundCount + 1 },
    (_, round) => round,
  );
  return { x, y, axis, roundTicks, innerWidth, innerHeight };
}

export const toPoints = (scores, scale) =>
  scores.map((score, round) => ({
    round,
    score,
    px: scale.x(round),
    py: scale.y(score),
  }));

function distanceToSegment(point, from, to) {
  const dx = to.px - from.px;
  const dy = to.py - from.py;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(
          0,
          Math.min(
            1,
            ((point.px - from.px) * dx + (point.py - from.py) * dy) /
              lengthSquared,
          ),
        );
  return Math.hypot(
    point.px - (from.px + t * dx),
    point.py - (from.py + t * dy),
  );
}

/**
 * Courbe la plus proche du pointeur (à `maxDistance` pixels au plus) et manche dont le point est le plus proche en X.
 * À distance égale (courbes superposées), la dernière de `lines` l'emporte : c'est celle dessinée au premier plan.
 * @param lines [{ id, points: [{ round, px, py }] }]
 */
export function findNearestLine(lines, pointer, maxDistance) {
  let best = null;
  lines.forEach((line) => {
    const { points } = line;
    const distance =
      points.length === 1
        ? Math.hypot(pointer.px - points[0].px, pointer.py - points[0].py)
        : Math.min(
            ...points
              .slice(1)
              .map((to, i) => distanceToSegment(pointer, points[i], to)),
          );
    if (distance > maxDistance) return;
    if (best && distance > best.distance) return;
    best = { id: line.id, distance, points };
  });
  if (!best) return null;
  const nearest = best.points.reduce((closest, point) =>
    Math.abs(point.px - pointer.px) < Math.abs(closest.px - pointer.px)
      ? point
      : closest,
  );
  return { id: best.id, round: nearest.round, distance: best.distance };
}
