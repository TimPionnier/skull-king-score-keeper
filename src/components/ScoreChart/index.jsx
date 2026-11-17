import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  buildScale,
  cumulativeScores,
  findNearestLine,
  toPoints,
} from "../../chartGeometry.js";

const CHART_HEIGHT = 240;
const DEFAULT_WIDTH = 560;
const PADDING = { top: 14, right: 16, bottom: 28, left: 40 };
const HIT_DISTANCE_PX = 18;
const TOOLTIP_OFFSET_PX = 12;
const DIMMED_OPACITY = 0.3;

function useElementWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width) || DEFAULT_WIDTH),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * Courbes des scores cumulés. Survol ou clic sur une courbe : elle passe au premier plan,
 * les autres s'estompent et une bulle donne le nom du joueur et son total à la manche visée.
 */
export function ScoreChart({ players, results, roundCount, colors }) {
  const [containerRef, width] = useElementWidth();
  const [hover, setHover] = useState(null);
  const [pinnedId, setPinnedId] = useState(null);

  const cumulative = useMemo(
    () => cumulativeScores(players, results),
    [players, results],
  );
  const scale = useMemo(
    () =>
      buildScale({
        values: Object.values(cumulative).flat(),
        roundCount,
        width,
        height: CHART_HEIGHT,
        padding: PADDING,
      }),
    [cumulative, roundCount, width],
  );
  const lines = useMemo(
    () =>
      players.map((p) => ({
        id: p.id,
        player: p,
        points: toPoints(cumulative[p.id], scale),
      })),
    [players, cumulative, scale],
  );

  const activeId = hover?.id ?? pinnedId;
  // L'élément actif est dessiné en dernier : en SVG, c'est le premier plan.
  const drawOrder = activeId
    ? [
        ...lines.filter((l) => l.id !== activeId),
        ...lines.filter((l) => l.id === activeId),
      ]
    : lines;
  const activeLine = lines.find((l) => l.id === activeId);
  const activeRound = hover?.id === activeId ? hover.round : results.length;
  const activePoint =
    activeLine?.points[Math.min(activeRound, activeLine.points.length - 1)];

  const pointerFromEvent = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    return { px: event.clientX - box.left, py: event.clientY - box.top };
  };
  const onPointerMove = (event) => {
    const found = findNearestLine(
      drawOrder,
      pointerFromEvent(event),
      HIT_DISTANCE_PX,
    );
    setHover(found ? { id: found.id, round: found.round } : null);
  };
  const onPointerDown = (event) => {
    const found = findNearestLine(
      drawOrder,
      pointerFromEvent(event),
      HIT_DISTANCE_PX,
    );
    setPinnedId(found ? (found.id === pinnedId ? null : found.id) : null);
    setHover(found ? { id: found.id, round: found.round } : null);
  };
  const togglePinned = (id) =>
    setPinnedId((current) => (current === id ? null : id));

  const tooltipOnRight = activePoint ? activePoint.px < width / 2 : true;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-x-1 gap-y-1">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-pressed={pinnedId === p.id}
            onClick={() => togglePinned(p.id)}
            className={`inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-semibold text-[#C3CCDD] outline-none focus-visible:ring-2 focus-visible:ring-[#F2B544] ${pinnedId === p.id ? "bg-[#1A2540]" : ""}`}
          >
            <span
              className="h-1 w-3 rounded"
              style={{ background: colors[p.color] }}
            />
            {p.name}
          </button>
        ))}
      </div>

      <div
        ref={containerRef}
        className="relative"
        style={{ height: CHART_HEIGHT }}
      >
        <svg
          width={width}
          height={CHART_HEIGHT}
          role="img"
          aria-label="Évolution des scores cumulés par manche"
          data-testid="score-chart"
          className="block touch-pan-y select-none"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
          onPointerLeave={() => setHover(null)}
        >
          {scale.axis.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PADDING.left}
                x2={width - PADDING.right}
                y1={scale.y(tick)}
                y2={scale.y(tick)}
                stroke={tick === 0 ? "#3A4A6B" : "#1A2540"}
                strokeDasharray={tick === 0 ? undefined : "4 6"}
              />
              <text
                x={PADDING.left - 6}
                y={scale.y(tick)}
                textAnchor="end"
                dominantBaseline="middle"
                className="fill-[#6F7C96] text-[11px] tabular-nums"
              >
                {tick}
              </text>
            </g>
          ))}
          {scale.roundTicks.map((round) => (
            <text
              key={round}
              x={scale.x(round)}
              y={CHART_HEIGHT - PADDING.bottom + 18}
              textAnchor="middle"
              className="fill-[#6F7C96] text-[11px] tabular-nums"
            >
              {round}
            </text>
          ))}
          {activePoint && (
            <line
              x1={activePoint.px}
              x2={activePoint.px}
              y1={PADDING.top}
              y2={CHART_HEIGHT - PADDING.bottom}
              stroke="#3A4A6B"
              strokeDasharray="3 4"
            />
          )}
          {drawOrder.map((line) => {
            const isActive = line.id === activeId;
            const opacity = activeId && !isActive ? DIMMED_OPACITY : 1;
            const color = colors[line.player.color];
            return (
              <g
                key={line.id}
                opacity={opacity}
                data-player={line.player.name}
                data-active={isActive}
              >
                <motion.polyline
                  fill="none"
                  stroke={color}
                  strokeWidth={isActive ? 4 : 2.5}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={line.points
                    .map((pt) => `${pt.px},${pt.py}`)
                    .join(" ")}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
                {line.points.map((pt) => (
                  <circle
                    key={pt.round}
                    cx={pt.px}
                    cy={pt.py}
                    r={isActive ? 4 : 2.5}
                    fill={color}
                  />
                ))}
              </g>
            );
          })}
        </svg>
        {activeLine && activePoint && (
          <div
            role="status"
            data-testid="score-chart-tooltip"
            className="pointer-events-none absolute z-10 whitespace-nowrap rounded-lg border border-[#2A3857] bg-[#0A101C] px-2.5 py-1.5 text-[12.5px] shadow-lg"
            style={{
              top: Math.max(activePoint.py - 18, 0),
              ...(tooltipOnRight
                ? { left: activePoint.px + TOOLTIP_OFFSET_PX }
                : { right: width - activePoint.px + TOOLTIP_OFFSET_PX }),
            }}
          >
            <span
              className="font-extrabold"
              style={{ color: colors[activeLine.player.color] }}
            >
              {activeLine.player.name}
            </span>
            <span className="tabular-nums text-[#F2F5FB]">
              {" "}
              · {activePoint.score} pts
            </span>
            <span className="tabular-nums text-[#94A0B8]">
              {activePoint.round === 0
                ? " · départ"
                : ` · manche ${activePoint.round}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
