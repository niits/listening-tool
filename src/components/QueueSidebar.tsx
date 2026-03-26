"use client";

import { useState } from "react";
import type { QueueItem } from "../lib/types";

interface QueueSidebarProps {
  activeJob: QueueItem | null;
  queueItems: QueueItem[];
  onCancel: (segmentIndex: number, audioHash: string) => void;
  onClearAll: () => void;
}

function audioName(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    return parts[parts.length - 1] || url;
  } catch {
    return url;
  }
}

export default function QueueSidebar({
  activeJob,
  queueItems,
  onCancel,
  onClearAll,
}: QueueSidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const totalItems = (activeJob ? 1 : 0) + queueItems.length;
  if (totalItems === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-semibold text-gray-700 hover:text-gray-900"
        >
          <span>Queue</span>
          {collapsed && (
            <span className="bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
              {totalItems}
            </span>
          )}
          <span className="text-gray-400">{collapsed ? "▲" : "▼"}</span>
        </button>
        {!collapsed && queueItems.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Confirm clear dialog */}
      {confirmClear && (
        <div className="px-4 py-3 bg-red-50 text-sm text-red-700 border-b border-red-100">
          <p className="mb-2">Clear all queued segments?</p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onClearAll();
                setConfirmClear(false);
              }}
              className="px-3 py-1 bg-red-600 text-white rounded text-xs"
            >
              Clear
            </button>
            <button
              onClick={() => setConfirmClear(false)}
              className="px-3 py-1 bg-white border border-gray-300 rounded text-xs text-gray-600"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Body */}
      {!collapsed && (
        <div className="max-h-80 overflow-y-auto">
          {/* Active job */}
          {activeJob && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
              <span className="w-4 h-4 rounded-full border-2 border-blue-500 border-t-transparent animate-spin shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-medium text-blue-700 truncate">
                  {audioName(activeJob.audioUrl)}
                </p>
                <p className="text-xs text-blue-500">
                  Segment {activeJob.segmentIndex + 1}
                </p>
              </div>
            </div>
          )}

          {/* Queued items */}
          {queueItems.map((item) => (
            <div
              key={`${item.audioHash}-${item.segmentIndex}`}
              className="flex items-center gap-2 px-4 py-2 border-b border-gray-50 last:border-0"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs text-gray-700 truncate">
                  {audioName(item.audioUrl)}
                </p>
                <p className="text-xs text-gray-400">
                  Segment {item.segmentIndex + 1}
                </p>
              </div>
              <button
                onClick={() => onCancel(item.segmentIndex, item.audioHash)}
                className="text-gray-300 hover:text-red-500 text-xs shrink-0"
                title="Remove from queue"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
