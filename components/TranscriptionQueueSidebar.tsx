"use client";

import { useState, useCallback } from "react";
import { useTranscription } from "@/contexts/TranscriptionContext";
import { TranscriptionQueueItem } from "@/lib/types";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Clock,
  X,
  Trash2,
} from "lucide-react";

function getDisplayName(item: TranscriptionQueueItem): string {
  if (item.audioUrl) {
    try {
      const pathname = new URL(item.audioUrl).pathname;
      const name = pathname.split("/").pop();
      if (name) return decodeURIComponent(name);
    } catch {
      // fall through
    }
  }
  return item.audioHash.slice(0, 8);
}

interface TranscriptionQueueSidebarProps {
  onToggle?: (collapsed: boolean) => void;
}

export function TranscriptionQueueSidebar({
  onToggle,
}: TranscriptionQueueSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { queueItems, queueLength, isProcessing, clearQueue, cancelJob } =
    useTranscription();

  const processingItem = queueItems.find(
    (item) => item.status === "processing"
  );
  const queuedItems = queueItems.filter((item) => item.status === "queued");

  const handleToggle = useCallback(() => {
    const newState = !isCollapsed;
    setIsCollapsed(newState);
    onToggle?.(newState);
  }, [isCollapsed, onToggle]);

  const handleClearAll = useCallback(() => {
    if (confirm("Bạn có chắc muốn huỷ tất cả các job trong hàng đợi?")) {
      clearQueue();
    }
  }, [clearQueue]);

  const handleCancelJob = useCallback(
    (item: TranscriptionQueueItem) => {
      if (confirm(`Bạn có chắc muốn huỷ job segment #${item.segmentIndex + 1}?`)) {
        cancelJob(item.audioHash, item.segmentIndex);
      }
    },
    [cancelJob]
  );

  if (queueLength === 0 && !isProcessing) {
    return null;
  }

  return (
    <div
      className={`h-screen bg-white border-l border-gray-200 shadow-lg transition-all duration-300 flex-shrink-0 ${
        isCollapsed ? "w-16" : "w-80"
      }`}
    >
      <div className="h-full flex flex-col">
        {/* Header with toggle */}
        <div className="flex-none p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {!isCollapsed && (
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />
                Transcription Queue
              </h3>
            )}
            <button
              onClick={handleToggle}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={isCollapsed ? "Mở rộng" : "Thu gọn"}
            >
              {isCollapsed ? (
                <ChevronLeft className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronRight className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
          {!isCollapsed && (
            <p className="text-sm text-gray-500 mt-2">
              {queuedItems.length} {queuedItems.length === 1 ? "job" : "jobs"}{" "}
              đang chờ
            </p>
          )}
        </div>

        {/* Sidebar content */}
        {!isCollapsed ? (
          <>
            {/* Queue list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {/* Currently processing */}
              {processingItem && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <div className="flex items-start gap-3">
                    <Loader2 className="w-5 h-5 text-blue-600 animate-spin flex-none mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">
                        Đang xử lý
                      </p>
                      <p className="text-xs text-blue-700 mt-0.5">
                        Segment #{processingItem.segmentIndex + 1}
                      </p>
                      <p className="text-xs text-blue-500 mt-0.5 truncate" title={getDisplayName(processingItem)}>
                        {getDisplayName(processingItem)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Queued items */}
              {queuedItems.length > 0 && (
                <>
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hàng đợi
                    </div>
                    {queuedItems.length > 1 && (
                      <button
                        onClick={handleClearAll}
                        className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-1 px-2 py-1 hover:bg-red-50 rounded transition-colors"
                        title="Huỷ tất cả"
                      >
                        <Trash2 className="w-3 h-3" />
                        Huỷ tất cả
                      </button>
                    )}
                  </div>
                  {queuedItems.map((item, index) => (
                    <div
                      key={`${item.audioHash}-${item.segmentIndex}-${index}`}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 group hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <Clock className="w-5 h-5 text-gray-400 flex-none mt-0.5" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-700">
                            Vị trí {index + 1}
                          </p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            Segment #{item.segmentIndex + 1}
                          </p>
                          <p className="text-xs text-gray-400 mt-0.5 truncate" title={getDisplayName(item)}>
                            {getDisplayName(item)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleCancelJob(item)}
                          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all"
                          title="Huỷ job này"
                        >
                          <X className="w-4 h-4 text-red-600" />
                        </button>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {queuedItems.length === 0 && !processingItem && (
                <div className="text-center py-8 text-gray-400">
                  <Clock className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Không có job nào</p>
                </div>
              )}
            </div>

            {/* Footer info */}
            <div className="flex-none p-4 border-t border-gray-200 bg-gray-50">
              <div className="text-xs text-gray-600 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                    Đang xử lý
                  </span>
                  <span className="font-medium">
                    {processingItem ? "1" : "0"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-gray-400 rounded-full"></span>
                    Chờ xử lý
                  </span>
                  <span className="font-medium">{queuedItems.length}</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Collapsed view */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-2">
            <div className="relative">
              <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
              {queuedItems.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-medium">
                  {queuedItems.length}
                </span>
              )}
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 font-medium">
                {processingItem ? "1" : "0"}
              </p>
              <p className="text-[10px] text-gray-400">Processing</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 font-medium">
                {queuedItems.length}
              </p>
              <p className="text-[10px] text-gray-400">Queued</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
