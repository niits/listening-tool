"use client";

import { useMemo, useCallback } from "react";
import { AudioSegment } from "@/lib/types";

interface SegmentProcessingListProps {
  segments: AudioSegment[];
  transcripts: Map<number, string>;
  currentSegment: number | null;
  isProcessing: boolean;
}

export function SegmentProcessingList({
  segments,
  transcripts,
  currentSegment,
  isProcessing,
}: SegmentProcessingListProps) {
  const getSegmentStatus = useCallback(
    (index: number): string => {
      if (transcripts.has(index)) return "complete";
      if (currentSegment === index && isProcessing) return "processing";
      return "pending";
    },
    [transcripts, currentSegment, isProcessing]
  );

  // Calculate segment durations
  const { segmentDurations, maxDuration } = useMemo(() => {
    const durations = segments.map((seg) => seg.end - seg.start);
    const max = Math.max(...durations);
    return { segmentDurations: durations, maxDuration: max };
  }, [segments]);

  // Arrange segments into rows
  const rows = useMemo(() => {
    const arrangedRows: number[][] = [];
    const maxRowWidth = maxDuration * 1.5; // Allow some flexibility

    let currentRow: number[] = [];
    let currentRowWidth = 0;

    // Process all segments in order
    for (let idx = 0; idx < segments.length; idx++) {
      const duration = segmentDurations[idx];

      // If this is the longest segment, give it its own row
      if (duration === maxDuration) {
        if (currentRow.length > 0) {
          arrangedRows.push(currentRow);
          currentRow = [];
          currentRowWidth = 0;
        }
        arrangedRows.push([idx]);
        continue;
      }

      // Try to fit in current row
      if (currentRowWidth + duration <= maxRowWidth) {
        currentRow.push(idx);
        currentRowWidth += duration;
      } else {
        if (currentRow.length > 0) {
          arrangedRows.push(currentRow);
        }
        currentRow = [idx];
        currentRowWidth = duration;
      }
    }

    if (currentRow.length > 0) {
      arrangedRows.push(currentRow);
    }

    return arrangedRows;
  }, [segments.length, segmentDurations, maxDuration]);

  return (
    <div className="w-full">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        Audio Segments ({segments.length})
      </h2>
      <div className="max-h-[60vh] overflow-y-auto pr-2 space-y-3">
        {rows.map((row, rowIndex) => (
          <div key={rowIndex} className="flex items-stretch gap-2">
            {row.map((segmentIndex) => {
              const segment = segments[segmentIndex];
              const duration = segment.end - segment.start;
              const status = getSegmentStatus(segmentIndex);
              const widthPercent = (duration / maxDuration) * 100;

              return (
                <div
                  key={segmentIndex}
                  className={`h-4 rounded transition-all duration-500 flex items-center justify-center text-xs font-medium ${
                    status === "complete"
                      ? "bg-green-500 text-white"
                      : status === "processing"
                        ? "bg-blue-500 text-white animate-pulse"
                        : "bg-gray-300 text-gray-600"
                  }`}
                  style={{ width: `${widthPercent}%`, minWidth: "40px" }}
                  title={`Segment #${segmentIndex + 1} (${duration.toFixed(1)}s)`}
                >
                  <span className="text-[10px]">#{segmentIndex + 1}</span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {isProcessing && (
        <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-blue-800 text-sm">
            Transcribing segment{" "}
            {currentSegment !== null ? currentSegment + 1 : "..."}
          </p>
        </div>
      )}
    </div>
  );
}
