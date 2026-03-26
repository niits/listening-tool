"use client";

import { Suspense } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { hashUrl } from "../../lib/hashUrl";
import { getAudioData, touchLastAccessed } from "../../lib/audioCache";
import { getAllTranscripts } from "../../lib/transcriptionCache";
import { db } from "../../lib/db";
import { loadAudio } from "../../lib/audioLoader";
import { scoreAnswer } from "../../lib/scoring";
import { useTranscription } from "../../contexts/TranscriptionContext";
import TokenDisplay from "../../components/TokenDisplay";
import SegmentList from "../../components/SegmentList";
import DarkModeToggle from "../../components/DarkModeToggle";
import type { AudioSegment, ScoreResult } from "../../lib/types";

// Directional slide variants for segment navigation
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -40 : 40, opacity: 0 }),
};

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin shrink-0 ${className}`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function PracticeContent() {
  const router = useRouter();
  const params = useSearchParams();
  const audioUrl = params.get("url") ?? "";

  const { transcripts: ctxTranscripts } = useTranscriptionSafe();

  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [transcriptMap, setTranscriptMap] = useState<Record<number, string>>({});
  const [totalSegments, setTotalSegments] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(0);
  const [userInput, setUserInput] = useState("");
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [playbackProgress, setPlaybackProgress] = useState(0);
  // Segments with perfect scores in the current session
  const [perfectSegments, setPerfectSegments] = useState<Set<number>>(new Set());

  // Audio playback refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<AudioBufferSourceNode | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);
  const audioHashRef = useRef<string>("");
  const rafRef = useRef<number | null>(null);
  const playStartCtxTimeRef = useRef<number>(0);
  const playStartSegTimeRef = useRef<number>(0);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive totalTranscribed from transcriptMap — always current, no stale closures
  const totalTranscribed = Object.keys(transcriptMap).length;

  // Load segments and transcripts from cache
  useEffect(() => {
    if (!audioUrl) return;

    const audioHash = hashUrl(audioUrl);
    audioHashRef.current = audioHash;

    (async () => {
      setIsLoading(true);
      await touchLastAccessed(audioHash);

      const data = await getAudioData(audioHash);
      if (!data || data.segments.length === 0) {
        router.replace(`/processing?url=${encodeURIComponent(audioUrl)}`);
        return;
      }

      const cachedTranscripts = await getAllTranscripts(audioHash);
      const map: Record<number, string> = {};
      for (const t of cachedTranscripts) {
        map[t.segmentIndex] = t.text;
      }

      setSegments(data.segments);
      setTranscriptMap(map);
      setTotalSegments(data.totalSegments);
      setIsLoading(false);

      // Load audio for playback
      loadAudio(audioUrl, () => {})
        .then(({ pcm, sampleRate }) => {
          const ctx = new AudioContext({ sampleRate });
          const buffer = ctx.createBuffer(1, pcm.length, sampleRate);
          buffer.copyToChannel(new Float32Array(pcm), 0);
          audioBufferRef.current = buffer;
          audioCtxRef.current = ctx;
          setAudioReady(true);
        })
        .catch(console.error);
    })();

    return () => {
      stopRaf();
      sourceRef.current?.stop();
      audioCtxRef.current?.close();
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [audioUrl, router]);

  // Merge live context transcripts with cached ones
  useEffect(() => {
    if (!audioHashRef.current) return;
    const hash = audioHashRef.current;
    setTranscriptMap((prev) => {
      const updated = { ...prev };
      let changed = false;
      ctxTranscripts.forEach((text, key) => {
        const [h, idx] = key.split("-");
        if (h === hash) {
          const i = parseInt(idx, 10);
          if (updated[i] !== text) {
            updated[i] = text;
            changed = true;
          }
        }
      });
      return changed ? updated : prev;
    });
  }, [ctxTranscripts]);

  // Auto-advance on perfect score
  useEffect(() => {
    if (!result) return;
    const extraCount = result.tokens.filter((t) => t.class === "extra").length;
    const isPerfect = result.score === 1.0 && extraCount === 0;
    if (!isPerfect) return;

    // Mark segment as perfect
    setPerfectSegments((prev) => new Set([...prev, currentIndex]));

    // Save session record
    const audioHash = audioHashRef.current;
    db.sessions
      .put({ timestamp: Date.now(), audioUrl, audioHash, inputs: [] })
      .catch(console.error);

    // Auto-advance if next segment is ready
    const nextSeg = segments[currentIndex + 1];
    const isLastSeg = currentIndex === segments.length - 1;
    if (isLastSeg || !nextSeg || transcriptMap[nextSeg.segmentIndex] === undefined) return;

    autoAdvanceRef.current = setTimeout(() => {
      goTo(currentIndex + 1, 1);
    }, 2000);

    return () => {
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    };
  }, [result]); // eslint-disable-line react-hooks/exhaustive-deps

  // RAF-based playback progress tracking
  function stopRaf() {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function startRaf(segIndex: number) {
    const tick = () => {
      if (!audioCtxRef.current || !segments[segIndex]) return;
      const seg = segments[segIndex];
      const elapsed = audioCtxRef.current.currentTime - playStartCtxTimeRef.current;
      const segTime = playStartSegTimeRef.current + elapsed;
      setPlaybackProgress(Math.min(segTime / seg.duration, 1));
      if (segTime < seg.duration) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }

  const playSegmentFrom = useCallback(
    (startOffset: number) => {
      if (!audioBufferRef.current || !audioCtxRef.current) return;
      const seg = segments[currentIndex];
      if (!seg) return;

      sourceRef.current?.stop();
      stopRaf();

      const ctx = audioCtxRef.current;
      const source = ctx.createBufferSource();
      source.buffer = audioBufferRef.current;
      source.connect(ctx.destination);
      const playDuration = seg.duration - startOffset;
      source.start(0, seg.start + startOffset, playDuration);
      sourceRef.current = source;
      playStartCtxTimeRef.current = ctx.currentTime;
      playStartSegTimeRef.current = startOffset;
      setIsPlaying(true);
      setPlaybackProgress(startOffset / seg.duration);
      startRaf(currentIndex);

      source.onended = () => {
        setIsPlaying(false);
        stopRaf();
        // Keep progress at end position instead of snapping to 0
        setPlaybackProgress(1);
      };
    },
    [segments, currentIndex] // eslint-disable-line react-hooks/exhaustive-deps
  );

  function togglePlay() {
    if (isPlaying) {
      sourceRef.current?.stop();
      stopRaf();
      setIsPlaying(false);
    } else {
      // If at end, restart from beginning
      const offset = playbackProgress >= 1 ? 0 : playbackProgress * (segments[currentIndex]?.duration ?? 0);
      playSegmentFrom(offset);
    }
  }

  function handleSeek(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seg = segments[currentIndex];
    if (!seg) return;
    playSegmentFrom(fraction * seg.duration);
  }

  // Navigate to a segment
  function goTo(index: number, dir: number) {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    sourceRef.current?.stop();
    stopRaf();
    setIsPlaying(false);
    setPlaybackProgress(0);
    setDirection(dir);
    setCurrentIndex(index);
    setUserInput("");
    setResult(null);
  }

  function goNext() { goTo(currentIndex + 1, 1); }
  function goPrev() { goTo(currentIndex - 1, -1); }

  async function handleCheck() {
    const seg = segments[currentIndex];
    if (!seg) return;
    setIsChecking(true);
    await new Promise<void>((r) => requestAnimationFrame(() => r()));
    const ref = transcriptMap[seg.segmentIndex] ?? "";
    const r = scoreAnswer(userInput, ref);
    setResult(r);
    setIsChecking(false);
  }

  function handleTryAgain() {
    if (autoAdvanceRef.current) {
      clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setUserInput("");
    setResult(null);
  }

  async function handleSaveAndExit() {
    const audioHash = audioHashRef.current;
    await db.sessions.put({ timestamp: Date.now(), audioUrl, audioHash, inputs: [] });
    router.push("/");
  }

  const seg = segments[currentIndex];
  const hasTranscript = seg ? transcriptMap[seg.segmentIndex] !== undefined : false;
  const isTranscribing = totalTranscribed < totalSegments;

  // Compute result stats
  const extraCount = result ? result.tokens.filter((t) => t.class === "extra").length : 0;
  const isPerfect = result !== null && result.score === 1.0 && extraCount === 0;
  const isLastSegment = currentIndex === segments.length - 1;

  const nextSeg = segments[currentIndex + 1];
  const nextReady = nextSeg !== undefined && transcriptMap[nextSeg.segmentIndex] !== undefined;

  // Current position and total duration for the player
  const currentTime = seg ? playbackProgress * seg.duration : 0;
  const totalTime = seg?.duration ?? 0;

  // Build segment items for SegmentList
  const segmentItems = segments.map((s) => ({
    index: s.segmentIndex,
    start: s.start,
    end: s.end,
    status: "pending" as const,
    perfectScore: perfectSegments.has(s.segmentIndex),
  }));

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading...</p>
      </div>
    );
  }

  if (segments.length === 0) {
    return (
      <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
        <div className="text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">No segments found.</p>
          <button onClick={() => router.push("/")} className="text-sm text-blue-600 dark:text-blue-400 underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900 overflow-hidden">
      {/* Topbar */}
      <header className="h-14 shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 md:px-6 flex items-center justify-between">
        <button
          onClick={handleSaveAndExit}
          className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm px-3 py-1.5 transition-colors"
        >
          ← Back
        </button>
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100 tabular-nums">
          {currentIndex + 1} / {segments.length}
        </span>
        <DarkModeToggle />
      </header>

      {/* Still-transcribing banner */}
      {isTranscribing && (
        <div className="shrink-0 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 flex items-center gap-2">
          <Spinner className="h-3 w-3 text-amber-600 dark:text-amber-400" />
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Transcription running ({totalTranscribed}/{totalSegments} ready)
          </p>
        </div>
      )}

      {/* Body: mobile strip at top, then sidebar + main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile-only horizontal strip */}
        <SegmentList
          segments={segmentItems}
          currentIndex={currentIndex}
          onSelect={(i) => goTo(i, i > currentIndex ? 1 : -1)}
          variant="strip"
        />

        {/* Desktop: sidebar + main content side by side */}
        <div className="flex-1 flex overflow-hidden">
          <SegmentList
            segments={segmentItems}
            currentIndex={currentIndex}
            onSelect={(i) => goTo(i, i > currentIndex ? 1 : -1)}
            variant="sidebar"
          />

          {/* Main content — animated on segment change */}
          <div className="flex-1 overflow-y-auto">
            <AnimatePresence custom={direction} mode="wait">
              <motion.div
                key={currentIndex}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="mx-auto w-full max-w-2xl px-5 py-6 space-y-4"
              >
                {!hasTranscript ? (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 text-center">
                    <div className="flex items-center justify-center gap-2 text-gray-400 dark:text-gray-500">
                      <Spinner />
                      <span className="text-sm">Transcribing this segment...</span>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Audio Player */}
                    <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 overflow-hidden">
                      {/* Segment time range header */}
                      <div className="px-4 pt-3 pb-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700/60">
                        <span className="text-xs text-gray-400 dark:text-gray-500 font-mono tabular-nums">
                          {seg ? `${formatTime(seg.start)} – ${formatTime(seg.end)}` : ""}
                        </span>
                        <span className="text-xs text-gray-300 dark:text-gray-600 font-mono tabular-nums">
                          {totalTime > 0 ? `${totalTime.toFixed(1)}s` : ""}
                        </span>
                      </div>

                      {/* Playback controls */}
                      <div className="px-4 py-3 flex items-center gap-3">
                        <button
                          onClick={togglePlay}
                          disabled={!audioReady}
                          className="h-9 w-9 rounded-full bg-blue-500 hover:bg-blue-600 text-white flex items-center justify-center shrink-0 transition-colors disabled:opacity-40"
                        >
                          {isPlaying ? (
                            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                              <rect x="6" y="4" width="4" height="16" />
                              <rect x="14" y="4" width="4" height="16" />
                            </svg>
                          ) : (
                            <svg className="h-4 w-4 ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                              <polygon points="5,3 19,12 5,21" />
                            </svg>
                          )}
                        </button>

                        {/* Seek bar — expanded hit area via -my / py trick */}
                        <div
                          className="flex-1 flex items-center cursor-pointer -my-2 py-2"
                          onClick={handleSeek}
                        >
                          <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full relative pointer-events-none">
                            <motion.div
                              className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
                              style={{ width: `${playbackProgress * 100}%` }}
                              transition={{ duration: 0 }}
                            />
                            {/* Scrubber thumb */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-blue-500 shadow-sm -translate-x-1/2"
                              style={{ left: `${playbackProgress * 100}%` }}
                            />
                          </div>
                        </div>

                        {/* current / total */}
                        <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0 font-mono tabular-nums whitespace-nowrap">
                          {formatTime(currentTime)} / {formatTime(totalTime)}
                        </span>
                      </div>
                    </div>

                    {/* Input / Result — animated swap */}
                    <AnimatePresence mode="wait">
                      {result ? (
                        <motion.div
                          key="result"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -10 }}
                          transition={{ duration: 0.25, ease: "easeOut" }}
                        >
                          {isPerfect ? (
                            <motion.div
                              initial={{ scale: 0.97, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              transition={{ type: "spring", stiffness: 400, damping: 20 }}
                              className="rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 overflow-hidden"
                            >
                              <div className="px-5 py-4 flex items-center gap-3">
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={{ type: "spring", stiffness: 500, damping: 15, delay: 0.1 }}
                                  className="h-8 w-8 rounded-full bg-green-500 flex items-center justify-center shrink-0"
                                >
                                  <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                    <path d="M5 13l4 4L19 7" />
                                  </svg>
                                </motion.div>
                                <div>
                                  <p className="text-sm font-semibold text-green-700 dark:text-green-300">Perfect!</p>
                                  <p className="text-xs text-green-600/70 dark:text-green-400/70">100% match</p>
                                </div>
                              </div>
                              <div className="px-5 py-4 border-t border-green-100 dark:border-green-800/60 bg-white/40 dark:bg-green-950/20">
                                <div className="flex flex-wrap gap-x-2 gap-y-2 font-mono text-base leading-relaxed">
                                  {result.tokens.map((tok, i) => (
                                    <motion.span
                                      key={i}
                                      initial={{ opacity: 0 }}
                                      animate={{ opacity: 1 }}
                                      transition={{ delay: 0.15 + i * 0.025, duration: 0.2 }}
                                      className="text-green-600 dark:text-green-400"
                                    >
                                      {tok.text}
                                    </motion.span>
                                  ))}
                                </div>
                              </div>
                              {(isLastSegment || nextReady) && (
                                <div className="px-5 py-2.5 border-t border-green-100 dark:border-green-800/60 bg-green-50/50 dark:bg-green-900/10">
                                  <p className="text-xs text-green-600/60 dark:text-green-400/60">
                                    {isLastSegment ? "All done!" : "Moving to next in 2s… or press Next →"}
                                  </p>
                                </div>
                              )}
                            </motion.div>
                          ) : (
                            <div className="rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
                              {/* Score header */}
                              <div className="px-5 py-3.5 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/30">
                                <span className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Result</span>
                                <div className="flex items-center gap-3">
                                  <div className="w-28 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                    <motion.div
                                      className="h-full rounded-full"
                                      style={{ backgroundColor: result.score >= 0.8 ? "#22c55e" : result.score >= 0.5 ? "#f59e0b" : "#ef4444" }}
                                      initial={{ width: 0 }}
                                      animate={{ width: `${result.score * 100}%` }}
                                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                                    />
                                  </div>
                                  <motion.span
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100"
                                  >
                                    {Math.round(result.score * 100)}%
                                  </motion.span>
                                </div>
                              </div>
                              {/* Token diff */}
                              <div className="px-5 py-4">
                                <TokenDisplay tokens={result.tokens} />
                              </div>
                              {/* Legend */}
                              <div className="px-5 py-2.5 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 flex flex-wrap gap-x-4 gap-y-1">
                                <span className="text-xs text-green-600 dark:text-green-400">correct</span>
                                <span className="text-xs text-red-500 line-through">incorrect</span>
                                <span className="text-xs text-gray-400 underline">missing</span>
                                <span className="text-xs text-amber-500 italic">extra</span>
                              </div>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <motion.div
                          key="input"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -8 }}
                          transition={{ duration: 0.2 }}
                        >
                          <div className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 overflow-hidden focus-within:border-blue-400 dark:focus-within:border-blue-500 transition-colors">
                            <textarea
                              value={userInput}
                              onChange={(e) => setUserInput(e.target.value)}
                              className="w-full px-5 py-4 text-base bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:outline-none min-h-[120px] placeholder:text-gray-300 dark:placeholder:text-gray-600"
                              placeholder="Type what you hear…"
                              onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleCheck();
                              }}
                            />
                            <div className="flex items-center justify-between px-5 py-2.5 bg-gray-50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700">
                              <span className="text-xs text-gray-400 dark:text-gray-500">Ctrl+Enter to check</span>
                              {userInput.trim() && (
                                <span className="text-xs text-gray-300 dark:text-gray-600 font-mono">
                                  {userInput.trim().split(/\s+/).length} words
                                </span>
                              )}
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer action bar */}
      <footer className="h-14 shrink-0 border-t border-gray-200 dark:border-gray-700 px-4 md:px-6 flex items-center justify-between bg-white dark:bg-gray-900">
        {segments.length > 1 ? (
          <button
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-4 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
        ) : (
          <div />
        )}

        {result ? (
          <button
            onClick={handleTryAgain}
            className="rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm px-4 py-1.5 transition-colors"
          >
            Try Again
          </button>
        ) : (
          <button
            onClick={handleCheck}
            disabled={isChecking || !hasTranscript}
            className="min-w-[130px] flex items-center justify-center gap-2 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium px-6 py-1.5 transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {isChecking ? (
              <>
                <Spinner />
                Checking...
              </>
            ) : (
              "Check Answer"
            )}
          </button>
        )}

        {segments.length > 1 ? (
          <button
            onClick={goNext}
            disabled={currentIndex === segments.length - 1 || !nextReady}
            className={[
              "rounded-lg border text-sm px-4 py-1.5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed",
              isPerfect
                ? "border-green-400 text-green-600 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-900/20"
                : "border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300",
            ].join(" ")}
          >
            Next →
          </button>
        ) : (
          <div />
        )}
      </footer>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <p className="text-sm text-gray-400">Loading...</p>
        </div>
      }
    >
      <PracticeContent />
    </Suspense>
  );
}

// Safe hook that returns defaults if context is not available yet
function useTranscriptionSafe() {
  try {
    const ctx = useTranscription();
    return { transcripts: ctx.transcripts };
  } catch {
    return { transcripts: new Map<string, string>() };
  }
}
