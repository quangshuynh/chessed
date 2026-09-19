"use client";

import { memo, useMemo, useRef, useState } from "react";

import {
  selectGraphPositionIndex,
  toEvaluationGraphGaps,
  toEvaluationGraphSegments,
  type EvaluationGraph,
  type EvaluationGraphPoint,
} from "@/lib/review/evaluation-graph";

import { formatGraphPointValue } from "./review-format";
import styles from "./evaluation-graph.module.css";

/**
 * Internal SVG units. The plot scales to its container, so these only fix the
 * aspect ratio; strokes opt out of scaling so they stay crisp at any width.
 */
const VIEW_WIDTH = 600;
const VIEW_HEIGHT = 190;

export interface EvaluationGraphViewProps {
  graph: EvaluationGraph;
  /** Canonical selected position index shared with the board and move list. */
  selectedIndex: number;
  onSelectPosition: (positionIndex: number) => void;
}

function xFor(positionIndex: number, lastIndex: number): number {
  if (lastIndex <= 0) return VIEW_WIDTH / 2;
  return (positionIndex / lastIndex) * VIEW_WIDTH;
}

function yFor(displayValue: number, boundPawns: number): number {
  const ratio = Math.max(-1, Math.min(1, displayValue / boundPawns));
  return (VIEW_HEIGHT / 2) * (1 - ratio);
}

function describePoint(point: EvaluationGraphPoint): string {
  return `${point.label}, ${formatGraphPointValue(point)}`;
}

function pointState(point: EvaluationGraphPoint | undefined): string {
  if (!point) return "unavailable";
  if (point.evaluation) return "engine";
  return point.terminal ? "terminal" : "unavailable";
}

function EvaluationGraphViewComponent({
  graph,
  selectedIndex,
  onSelectPosition,
}: EvaluationGraphViewProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const lastIndex = graph.points.length - 1;
  const zeroY = VIEW_HEIGHT / 2;

  const segments = useMemo(() => {
    return toEvaluationGraphSegments(graph).map((segment) => {
      const coordinates = segment.points.map((point) => ({
        x: xFor(point.positionIndex, graph.points.length - 1),
        y: yFor(point.displayValue, graph.boundPawns),
      }));
      const line = coordinates
        .map(
          (point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`,
        )
        .join(" ");
      const first = coordinates[0];
      const last = coordinates[coordinates.length - 1];
      return {
        key: segment.points[0].positionIndex,
        line,
        // White's share of the plot is everything below the evaluation line,
        // so an even position reads as an even split. A lone plottable point
        // has no run to fill, only a marker.
        whiteArea:
          coordinates.length > 1
            ? `M${first.x} ${VIEW_HEIGHT} ${line.slice(1)} L${last.x} ${VIEW_HEIGHT} Z`
            : null,
        single: coordinates.length === 1 ? first : null,
      };
    });
  }, [graph]);

  // Unknown stretches are drawn as explicit neutral bands rather than being
  // left dark, which would otherwise read as a Black advantage.
  const gaps = useMemo(() => {
    const last = graph.points.length - 1;
    return toEvaluationGraphGaps(graph).map((gap) => {
      const left = gap.startIndex === 0 ? 0 : xFor(gap.startIndex - 1, last);
      const right =
        gap.endIndex === last ? VIEW_WIDTH : xFor(gap.endIndex + 1, last);
      return {
        key: gap.startIndex,
        x: left,
        width: Math.max(right - left, 1),
      };
    });
  }, [graph]);

  const selectedPoint = graph.points[selectedIndex] ?? graph.points[0];
  const hoveredPoint =
    hoveredIndex === null ? null : (graph.points[hoveredIndex] ?? null);
  const readoutPoint = hoveredPoint ?? selectedPoint;
  const selectedX = xFor(selectedPoint?.positionIndex ?? 0, lastIndex);
  const selectedY =
    typeof selectedPoint?.displayValue === "number"
      ? yFor(selectedPoint.displayValue, graph.boundPawns)
      : null;

  function positionIndexAt(clientX: number): number | null {
    const bounds = surfaceRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return null;
    return selectGraphPositionIndex(
      graph,
      (clientX - bounds.left) / bounds.width,
    );
  }

  return (
    <div className={styles.graph} data-evaluation-graph>
      <div className={styles.readout}>
        <span className={styles.readoutLabel}>
          {hoveredPoint ? "Hovered" : "Selected"}
        </span>
        <span className={styles.readoutMove} data-graph-readout-move>
          {readoutPoint?.label ?? "—"}
        </span>
        <span
          className={styles.readoutValue}
          data-graph-readout-value
          data-graph-state={pointState(readoutPoint)}
        >
          {readoutPoint ? formatGraphPointValue(readoutPoint) : "—"}
        </span>
      </div>
      <div
        ref={surfaceRef}
        className={styles.surface}
        role="slider"
        tabIndex={0}
        aria-label={`Game evaluation graph. Values above zero favor White and below zero favor Black, bounded at ${graph.boundPawns.toFixed(2)} pawns. Left and right arrow keys move through the game.`}
        aria-valuemin={0}
        aria-valuemax={lastIndex}
        aria-valuenow={selectedPoint?.positionIndex ?? 0}
        aria-valuetext={selectedPoint ? describePoint(selectedPoint) : "—"}
        aria-orientation="horizontal"
        data-selected-position={selectedPoint?.positionIndex ?? 0}
        onClick={(event) => {
          const index = positionIndexAt(event.clientX);
          if (index !== null) onSelectPosition(index);
        }}
        onKeyDown={(event) => {
          // Left/Right are already handled once by canonical page navigation.
          if (event.key === "Home") onSelectPosition(0);
          else if (event.key === "End") onSelectPosition(lastIndex);
          else return;
          event.preventDefault();
        }}
        onPointerMove={(event) => {
          if (event.pointerType !== "mouse") return;
          setHoveredIndex(positionIndexAt(event.clientX));
        }}
        onPointerLeave={() => setHoveredIndex(null)}
        onPointerCancel={() => setHoveredIndex(null)}
      >
        <svg
          className={styles.plot}
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          aria-hidden="true"
          focusable="false"
        >
          <rect
            x={0}
            y={0}
            width={VIEW_WIDTH}
            height={VIEW_HEIGHT}
            className={styles.blackTerritory}
          />
          {segments.map((segment) =>
            segment.whiteArea ? (
              <path
                key={`area-${segment.key}`}
                d={segment.whiteArea}
                className={styles.whiteTerritory}
              />
            ) : null,
          )}
          {gaps.map((gap) => (
            <rect
              key={`gap-${gap.key}`}
              x={gap.x}
              y={0}
              width={gap.width}
              height={VIEW_HEIGHT}
              className={styles.gap}
            />
          ))}
          <line
            x1={0}
            y1={zeroY}
            x2={VIEW_WIDTH}
            y2={zeroY}
            className={styles.zeroLine}
          />
          {segments.map((segment) => (
            <path
              key={`line-${segment.key}`}
              d={segment.line}
              className={styles.line}
            />
          ))}
          {segments.map((segment) =>
            segment.single ? (
              <circle
                key={`single-${segment.key}`}
                cx={segment.single.x}
                cy={segment.single.y}
                r={4}
                className={styles.singlePoint}
              />
            ) : null,
          )}
          {hoveredPoint && hoveredPoint !== selectedPoint && (
            <line
              x1={xFor(hoveredPoint.positionIndex, lastIndex)}
              y1={0}
              x2={xFor(hoveredPoint.positionIndex, lastIndex)}
              y2={VIEW_HEIGHT}
              className={styles.hoverLine}
            />
          )}
          <line
            x1={selectedX}
            y1={0}
            x2={selectedX}
            y2={VIEW_HEIGHT}
            className={styles.selectedLine}
          />
          {selectedY !== null && (
            <circle
              cx={selectedX}
              cy={selectedY}
              r={5}
              className={styles.selectedPoint}
            />
          )}
        </svg>
      </div>
      <p className={styles.caption}>
        White advantage above the dashed equality line, Black advantage below.
        Evaluations are White-relative and are not win probability.
        {graph.unavailablePointCount > 0
          ? ` ${graph.unavailablePointCount} position${graph.unavailablePointCount === 1 ? "" : "s"} without engine evidence ${graph.unavailablePointCount === 1 ? "is" : "are"} left unplotted.`
          : ""}
      </p>
    </div>
  );
}

export const EvaluationGraphView = memo(EvaluationGraphViewComponent);
