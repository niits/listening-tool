"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CachedAudioData,
  getAllCachedAudio,
  deleteCachedAudio,
} from "@/lib/audioCache";

export function CachedAudioList() {
  const router = useRouter();
  const [cachedAudios, setCachedAudios] = useState<CachedAudioData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadCachedAudios();
  }, []);

  const loadCachedAudios = async () => {
    setIsLoading(true);
    try {
      const audios = await getAllCachedAudio();
      setCachedAudios(audios);
    } catch (error) {
      console.error("Failed to load cached audios:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAudioClick = (audio: CachedAudioData) => {
    const encodedUrl = encodeURIComponent(audio.audioUrl);

    // If fully transcribed, go to practice
    if (audio.transcribedCount === audio.totalSegments) {
      router.push(`/practice?url=${encodedUrl}`);
    } else {
      // Otherwise go to processing to continue
      router.push(`/processing?url=${encodedUrl}`);
    }
  };

  const handleDelete = async (e: React.MouseEvent, audioUrl: string) => {
    e.stopPropagation();

    if (!confirm("Delete this cached audio?")) return;

    try {
      await deleteCachedAudio(audioUrl);
      await loadCachedAudios();
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    // Less than 1 hour
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000);
      return minutes === 0 ? "Just now" : `${minutes}m ago`;
    }

    // Less than 1 day
    if (diff < 86400000) {
      const hours = Math.floor(diff / 3600000);
      return `${hours}h ago`;
    }

    // Less than 7 days
    if (diff < 604800000) {
      const days = Math.floor(diff / 86400000);
      return `${days}d ago`;
    }

    return date.toLocaleDateString();
  };

  const getFileName = (url: string) => {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const filename = pathname.split("/").pop() || url;
      return decodeURIComponent(filename);
    } catch {
      return url;
    }
  };

  if (isLoading) {
    return (
      <div className="w-full p-6 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-600 text-center">Loading cached audios...</p>
      </div>
    );
  }

  if (cachedAudios.length === 0) {
    return (
      <div className="w-full p-6 bg-gray-50 rounded-lg border border-gray-200">
        <p className="text-gray-600 text-center">No cached audios yet</p>
        <p className="text-gray-500 text-sm text-center mt-2">
          Process an audio file to see it here
        </p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <h2 className="text-2xl font-bold text-gray-800">Recent Audio Files</h2>
      <div className="space-y-3">
        {cachedAudios.map((audio) => {
          const progressPercent =
            (audio.transcribedCount / audio.totalSegments) * 100;
          const isComplete = audio.transcribedCount === audio.totalSegments;

          return (
            <div
              key={audio.audioHash}
              onClick={() => handleAudioClick(audio)}
              className="p-4 bg-white rounded-lg border border-gray-200 hover:border-blue-400 hover:shadow-md transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">
                    {getFileName(audio.audioUrl)}
                  </h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {audio.totalSegments} segments ·{" "}
                    {formatDate(audio.lastAccessed)}
                  </p>

                  <div className="mt-3 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-600">
                        {audio.transcribedCount} / {audio.totalSegments}{" "}
                        transcribed
                      </span>
                      <span
                        className={`font-medium ${isComplete ? "text-green-600" : "text-blue-600"}`}
                      >
                        {progressPercent.toFixed(0)}%
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full transition-all ${
                          isComplete ? "bg-green-500" : "bg-blue-500"
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {isComplete && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
                      <span>✓</span>
                      <span>Ready to practice</span>
                    </div>
                  )}

                  {!isComplete && audio.transcribedCount >= 10 && (
                    <div className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">
                      <span>▶</span>
                      <span>Can start practicing</span>
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => handleDelete(e, audio.audioUrl)}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Delete"
                >
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
