"use client";

interface ScoreBarProps {
  score: number; // 0–1
}

export default function ScoreBar({ score }: ScoreBarProps) {
  const pct = Math.round(score * 100);
  const color =
    pct >= 90 ? "bg-green-500" : pct >= 60 ? "bg-yellow-500" : "bg-red-500";

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-sm font-semibold w-12 text-right">{pct}%</span>
    </div>
  );
}
