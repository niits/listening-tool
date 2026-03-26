"use client";

import { motion } from "motion/react";

export interface SegmentItem {
  index: number;
  start: number;
  end: number;
  status: "done" | "transcribing" | "pending" | "error";
  perfectScore?: boolean;
}

interface SegmentListProps {
  segments: SegmentItem[];
  currentIndex: number;
  onSelect: (index: number) => void;
  /**
   * "sidebar" — desktop vertical nav only (hidden on mobile)
   * "strip"   — mobile horizontal chip strip only (hidden on desktop)
   * omit      — render both (legacy behaviour)
   */
  variant?: "sidebar" | "strip";
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function SegmentList({
  segments,
  currentIndex,
  onSelect,
  variant,
}: SegmentListProps) {
  const showSidebar = !variant || variant === "sidebar";
  const showStrip = !variant || variant === "strip";

  return (
    <>
      {showSidebar && (
        <nav className="hidden md:flex md:w-48 lg:w-56 shrink-0 flex-col border-r border-gray-200 dark:border-gray-700 overflow-y-auto py-3">
          {segments.map((seg) => {
            const isActive = seg.index === currentIndex;
            return (
              <button
                key={seg.index}
                onClick={() => onSelect(seg.index)}
                disabled={seg.status === "error"}
                className={[
                  "w-full px-3 py-2.5 text-left flex items-center gap-2 transition-colors relative",
                  "border-l-2",
                  isActive
                    ? "border-blue-500"
                    : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-800/50",
                  seg.status === "error" ? "opacity-40 cursor-not-allowed" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {isActive && (
                  <motion.div
                    layoutId="active-segment-indicator"
                    className="absolute inset-0 bg-blue-50 dark:bg-blue-900/20"
                    transition={{ type: "spring", stiffness: 500, damping: 35 }}
                    style={{ zIndex: 0 }}
                  />
                )}
                <span className="w-5 text-right text-xs text-gray-400 shrink-0 relative z-10">
                  {seg.index + 1}
                </span>
                <span
                  className={[
                    "text-xs relative z-10 tabular-nums",
                    isActive
                      ? "text-blue-600 dark:text-blue-400 font-medium"
                      : "text-gray-500 dark:text-gray-400",
                  ].join(" ")}
                >
                  {formatTime(seg.start)}
                </span>
                {seg.perfectScore && (
                  <span className="ml-auto text-green-500 text-xs relative z-10">✓</span>
                )}
              </button>
            );
          })}
        </nav>
      )}

      {showStrip && (
        <div className="flex gap-1 px-3 py-1.5 overflow-x-auto md:hidden border-b border-gray-200 dark:border-gray-700 shrink-0 h-10 items-center">
          {segments.map((seg) => {
            const isActive = seg.index === currentIndex;
            return (
              <button
                key={seg.index}
                onClick={() => onSelect(seg.index)}
                className={[
                  "shrink-0 h-7 w-7 rounded-full text-xs font-medium transition-colors",
                  isActive
                    ? "bg-blue-500 text-white"
                    : seg.perfectScore
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
                  seg.status === "error" ? "opacity-40" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {seg.index + 1}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
