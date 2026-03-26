"use client";

import { motion } from "motion/react";
import type { AudioSegment } from "../lib/types";

export type SegmentStatus = "done" | "transcribing" | "pending" | "error";

interface SegmentBarProps {
  segments: AudioSegment[];
  getStatus: (seg: AudioSegment) => SegmentStatus;
  totalDuration: number;
}

/** Target seconds per row — rows may be slightly longer if a segment straddles the boundary */
const TARGET_ROW = 60;

/** Row height scales down as segment count grows — keeps the chart readable at all sizes */
function rowHeightPx(numRows: number): number {
  if (numRows <= 3) return 56;
  if (numRows <= 6) return 44;
  if (numRows <= 12) return 36;
  if (numRows <= 24) return 28;
  return 20;
}

const STATUS_COLOR: Record<SegmentStatus, string> = {
  pending: "#d1d5db",
  transcribing: "#fbbf24",
  done: "#22c55e",
  error: "#fca5a5",
};

function formatMin(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return sec === 0 ? `${m}m` : `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SegmentBar({
  segments,
  getStatus,
}: SegmentBarProps) {
  if (segments.length === 0) return null;

  // Use the actual audio timeline end (includes silence gaps), not sum of durations
  const timelineEnd = Math.max(...segments.map((s) => s.end));
  const numRows = Math.max(1, Math.ceil(timelineEnd / TARGET_ROW));
  const rowH = rowHeightPx(numRows);

  const rows = Array.from({ length: numRows }, (_, i) => {
    const rowStart = i * TARGET_ROW;
    const rowSegs = segments.filter(
      (s) => s.start >= rowStart && s.start < rowStart + TARGET_ROW
    );
    // Allow row to extend past 1 min if a segment's end crosses the boundary
    const lastEnd =
      rowSegs.length > 0
        ? Math.max(...rowSegs.map((s) => s.end))
        : rowStart + TARGET_ROW;
    const rowEnd = Math.max(rowStart + TARGET_ROW, lastEnd);
    return { rowStart, rowEnd, segs: rowSegs };
  });

  return (
    <div className="flex flex-col gap-1.5 w-full">
      {rows.map(({ rowStart, rowEnd, segs }, rowIdx) => {
        const rowDuration = rowEnd - rowStart;
        return (
          <div
            key={rowIdx}
            className="flex items-stretch gap-2 shrink-0"
            style={{ height: rowH }}
          >
            {/* Minute label */}
            <div className="w-8 shrink-0 flex items-center justify-end">
              <span className="text-[10px] text-gray-300 dark:text-gray-600 font-mono tabular-nums leading-none">
                {formatMin(rowStart)}
              </span>
            </div>

            {/* Timeline track — background shows full row span including silences */}
            <div className="flex-1 relative rounded-[3px] overflow-hidden bg-gray-100 dark:bg-gray-700/40">
              {segs.map((seg, i) => {
                const status = getStatus(seg);
                const leftPct = ((seg.start - rowStart) / rowDuration) * 100;
                const widthPct = (seg.duration / rowDuration) * 100;
                return (
                  <motion.div
                    key={seg.segmentIndex}
                    initial={{ opacity: 0 }}
                    animate={{
                      opacity: 1,
                      backgroundColor: STATUS_COLOR[status],
                    }}
                    transition={{
                      opacity: {
                        delay: rowIdx * 0.03 + i * 0.01,
                        duration: 0.3,
                      },
                      backgroundColor: { duration: 0.5, ease: "easeInOut" },
                    }}
                    className={[
                      "absolute inset-y-0 rounded-[2px]",
                      status === "transcribing" ? "animate-pulse" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                    }}
                    title={`Segment ${seg.segmentIndex + 1}: ${seg.start.toFixed(1)}s – ${seg.end.toFixed(1)}s`}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
