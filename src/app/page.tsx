"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listAllAudio, deleteAudioData } from "../lib/audioCache";
import { deleteTranscriptsForAudio } from "../lib/transcriptionCache";
import DarkModeToggle from "../components/DarkModeToggle";
import type { AudioData } from "../lib/types";

function audioName(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || url);
  } catch {
    return url;
  }
}

function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin shrink-0 ${className}`}
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cachedAudios, setCachedAudios] = useState<AudioData[]>([]);
  const [deletingHash, setDeletingHash] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const list = await listAllAudio();
    setCachedAudios(list);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadList();
  }, [loadList]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      setUrlError("URL must start with http:// or https://");
      return;
    }
    setUrlError("");
    setIsSubmitting(true);
    router.push(`/processing?url=${encodeURIComponent(trimmed)}`);
  }

  function handleAudioClick(audio: AudioData) {
    const isFullyDone =
      audio.transcribedCount > 0 &&
      audio.transcribedCount >= audio.totalSegments;
    if (isFullyDone) {
      router.push(`/practice?url=${encodeURIComponent(audio.audioUrl)}`);
    } else {
      router.push(`/processing?url=${encodeURIComponent(audio.audioUrl)}`);
    }
  }

  async function handleDelete(e: React.MouseEvent, audioHash: string) {
    e.stopPropagation();
    setDeletingHash(audioHash);
    await deleteAudioData(audioHash);
    await deleteTranscriptsForAudio(audioHash);
    setDeletingHash(null);
    loadList();
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Topbar */}
      <header className="h-14 shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Listening Practice
        </h1>
        <DarkModeToggle />
      </header>

      {/* Scrollable content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto w-full px-4 md:px-8 lg:px-10 py-8 space-y-8">
          {/* URL input */}
          <form onSubmit={handleSubmit} className="flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setUrlError("");
              }}
              placeholder="https://..."
              className="flex-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:text-gray-100 placeholder:text-gray-400"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-w-[148px] flex items-center justify-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium px-5 py-2 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Spinner />
                  Loading...
                </>
              ) : (
                "Start Practicing →"
              )}
            </button>
          </form>
          {urlError && <p className="text-xs text-red-500 -mt-6">{urlError}</p>}

          {/* Saved audio section */}
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">
              Saved Audio
            </p>

            {cachedAudios.length > 0 ? (
              <div className="space-y-2">
                {cachedAudios.map((audio) => {
                  const pct =
                    audio.totalSegments > 0
                      ? Math.round(
                          (audio.transcribedCount / audio.totalSegments) * 100
                        )
                      : 0;
                  const isDeleting = deletingHash === audio.audioHash;

                  return (
                    <div
                      key={audio.audioHash}
                      onClick={() => handleAudioClick(audio)}
                      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 cursor-pointer hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {audioName(audio.audioUrl)}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {audio.totalSegments} segments ·{" "}
                            {relativeTime(audio.lastAccessed)}
                          </p>
                        </div>
                        <button
                          onClick={(e) => handleDelete(e, audio.audioHash)}
                          disabled={isDeleting}
                          className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-red-500 text-lg px-2 py-0.5 transition-colors shrink-0 disabled:opacity-50 leading-none"
                          title="Delete"
                        >
                          {isDeleting ? <Spinner /> : "×"}
                        </button>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-500 rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-gray-400 shrink-0">
                          {audio.transcribedCount}/{audio.totalSegments}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  No audio saved yet. Paste a URL above to get started.
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
