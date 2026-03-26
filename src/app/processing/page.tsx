"use client";

import React, { Suspense } from "react";
import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { hashUrl } from "../../lib/hashUrl";
import { loadAudio } from "../../lib/audioLoader";
import { splitOnSilence } from "../../lib/silenceSplitter";
import { resample, slicePcm } from "../../lib/pcmTools";
import {
  getAudioData,
  saveSegments,
  touchLastAccessed,
} from "../../lib/audioCache";
import { getAllTranscripts } from "../../lib/transcriptionCache";
import { useTranscription } from "../../contexts/TranscriptionContext";
import SegmentBar from "../../components/SegmentBar";
import type { AudioSegment, TranscribeJob } from "../../lib/types";

// Module-level helpers — outside the component to avoid React Compiler issues

function buildJobs(
  segs: AudioSegment[],
  pcm: Float32Array,
  sampleRate: number,
  audioHash: string,
  audioUrl: string
): TranscribeJob[] {
  return segs.map((seg) => {
    const sliced = slicePcm(pcm, sampleRate, seg.start, seg.end);
    const resampled = resample(sliced, sampleRate, 16000);
    return {
      segmentIndex: seg.segmentIndex,
      audioHash,
      audioUrl,
      pcmData: resampled,
      sampleRate: 16000,
    };
  });
}

function dispatchAll(
  segs: AudioSegment[],
  pcm: Float32Array,
  sampleRate: number,
  audioHash: string,
  audioUrl: string,
  hasBatchedRef: React.RefObject<boolean>,
  workerReady: boolean,
  batchTranscribe: (jobs: TranscribeJob[]) => void
) {
  if (hasBatchedRef.current || !workerReady) return;
  (hasBatchedRef as React.MutableRefObject<boolean>).current = true;
  batchTranscribe(buildJobs(segs, pcm, sampleRate, audioHash, audioUrl));
}

function dispatchRemaining(
  segs: AudioSegment[],
  doneIndexes: number[],
  pcm: Float32Array,
  sampleRate: number,
  audioHash: string,
  audioUrl: string,
  hasBatchedRef: React.RefObject<boolean>,
  workerReady: boolean,
  batchTranscribe: (jobs: TranscribeJob[]) => void
) {
  if (hasBatchedRef.current || !workerReady) return;
  (hasBatchedRef as React.MutableRefObject<boolean>).current = true;
  const doneSet = new Set(doneIndexes);
  batchTranscribe(
    buildJobs(
      segs.filter((s) => !doneSet.has(s.segmentIndex)),
      pcm,
      sampleRate,
      audioHash,
      audioUrl
    )
  );
}

type Stage =
  | "cache-check"
  | "loading"
  | "splitting"
  | "transcribing"
  | "done"
  | "error";

function audioName(url: string): string {
  try {
    const parts = new URL(url).pathname.split("/");
    return decodeURIComponent(parts[parts.length - 1] || url);
  } catch {
    return url;
  }
}

function getStatusMessage(
  stage: Stage,
  transcribedCount: number,
  totalCount: number
): string {
  switch (stage) {
    case "cache-check":
    case "loading":
      return "Loading audio…";
    case "splitting":
      return "Detecting speech segments…";
    case "transcribing":
      return totalCount > 0
        ? `Transcribing ${transcribedCount} / ${totalCount}…`
        : "Transcribing…";
    case "done":
      return "✓ Ready";
    case "error":
      return "Something went wrong.";
  }
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/** Placeholder mimicking the SegmentBar row layout before segments arrive */
function TimelinePlaceholder() {
  return (
    <div className="flex flex-col gap-1.5 w-full">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-stretch gap-2 shrink-0" style={{ height: 44 }}>
          <div className="w-8 shrink-0 flex items-center justify-end">
            <div className="h-2 w-4 rounded-sm bg-gray-100 dark:bg-gray-700/50" />
          </div>
          <div
            className="flex-1 rounded-[3px] bg-gray-100 dark:bg-gray-700/40 animate-pulse"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        </div>
      ))}
    </div>
  );
}

function ProcessingContent() {
  const router = useRouter();
  const params = useSearchParams();
  const audioUrl = params.get("url") ?? "";

  const { workerReady, transcripts, batchTranscribe } = useTranscription();

  const [stage, setStage] = useState<Stage>("cache-check");
  const [errorMessage, setErrorMessage] = useState("");
  const [segments, setSegments] = useState<AudioSegment[]>([]);
  const [transcribedCount, setTranscribedCount] = useState(0);

  const fullPcmRef = useRef<Float32Array | null>(null);
  const sampleRateRef = useRef<number>(44100);
  const audioHashRef = useRef<string>("");
  const hasBatchedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { activeJob } = useTranscription();

  // Count transcribed segments
  useEffect(() => {
    if (segments.length === 0) return;
    const hash = audioHashRef.current;
    let count = 0;
    for (let i = 0; i < segments.length; i++) {
      if (transcripts.has(`${hash}-${i}`)) count++;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTranscribedCount(count);

    if (count >= segments.length && segments.length > 0) {
      setStage("done");
      if (!redirectTimerRef.current) {
        redirectTimerRef.current = setTimeout(() => {
          router.replace(`/practice?url=${encodeURIComponent(audioUrl)}`);
        }, 1500);
      }
    }
  }, [transcripts, segments, audioUrl, router]);

  const runPipeline = useCallback(async () => {
    if (!audioUrl) {
      setErrorMessage("No audio URL provided.");
      setStage("error");
      return;
    }

    const audioHash = hashUrl(audioUrl);
    audioHashRef.current = audioHash;

    setStage("cache-check");
    const cached = await getAudioData(audioHash);
    if (cached && cached.totalSegments > 0) {
      await touchLastAccessed(audioHash);
      const cachedTranscripts = await getAllTranscripts(audioHash);

      if (cached.transcribedCount >= cached.totalSegments) {
        router.replace(`/practice?url=${encodeURIComponent(audioUrl)}`);
        return;
      }

      setSegments(cached.segments);
      setTranscribedCount(cachedTranscripts.length);

      setStage("loading");
      let pcm: Float32Array;
      let sampleRate: number;
      try {
        const loaded = await loadAudio(audioUrl, () => {});
        pcm = loaded.pcm;
        sampleRate = loaded.sampleRate;
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : String(err));
        setStage("error");
        return;
      }
      fullPcmRef.current = pcm;
      sampleRateRef.current = sampleRate;

      setStage("transcribing");
      dispatchRemaining(
        cached.segments,
        cachedTranscripts.map((t) => t.segmentIndex),
        pcm,
        sampleRate,
        audioHash,
        audioUrl,
        hasBatchedRef,
        workerReady,
        batchTranscribe
      );
      return;
    }

    setStage("loading");
    let pcm: Float32Array;
    let sampleRate: number;
    try {
      const loaded = await loadAudio(audioUrl, () => {});
      pcm = loaded.pcm;
      sampleRate = loaded.sampleRate;
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage("error");
      return;
    }
    fullPcmRef.current = pcm;
    sampleRateRef.current = sampleRate;

    setStage("splitting");
    let segs: AudioSegment[];
    try {
      segs = await splitOnSilence(pcm, sampleRate, audioHash);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
      setStage("error");
      return;
    }
    setSegments(segs);
    await saveSegments(audioHash, segs, audioUrl);

    setStage("transcribing");
    dispatchAll(
      segs,
      pcm,
      sampleRate,
      audioHash,
      audioUrl,
      hasBatchedRef,
      workerReady,
      batchTranscribe
    );
  }, [audioUrl, router, workerReady, batchTranscribe]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runPipeline();
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, [runPipeline]);

  useEffect(() => {
    if (
      workerReady &&
      !hasBatchedRef.current &&
      segments.length > 0 &&
      fullPcmRef.current
    ) {
      dispatchAll(
        segments,
        fullPcmRef.current,
        sampleRateRef.current,
        audioHashRef.current,
        audioUrl,
        hasBatchedRef,
        workerReady,
        batchTranscribe
      );
    }
  }, [workerReady, segments, audioUrl, batchTranscribe]);

  function getSegmentStatus(seg: AudioSegment) {
    const key = `${audioHashRef.current}-${seg.segmentIndex}`;
    if (transcripts.has(key)) return "done" as const;
    if (
      activeJob?.segmentIndex === seg.segmentIndex &&
      activeJob.audioHash === audioHashRef.current
    )
      return "transcribing" as const;
    return "pending" as const;
  }

  const totalDuration = segments.reduce((sum, s) => sum + s.duration, 0);
  const statusMessage = getStatusMessage(stage, transcribedCount, segments.length);
  const canStartPractice = transcribedCount >= 1 && stage !== "done";
  const isDone = stage === "done";
  const progressPct = segments.length > 0 ? transcribedCount / segments.length : 0;

  return (
    <div className="h-screen flex flex-col bg-white dark:bg-gray-900">
      {/* Topbar */}
      <header className="h-14 shrink-0 border-b border-gray-200 dark:border-gray-700 px-4 flex items-center gap-3">
        <button
          onClick={() => router.push("/")}
          className="rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 text-sm px-3 py-1.5 transition-colors"
        >
          ← Back
        </button>
        <span className="text-sm text-gray-500 dark:text-gray-400 truncate min-w-0">
          {audioName(audioUrl)}
        </span>
      </header>

      {/* Body */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {stage === "error" ? (
          <div className="flex-1 flex items-center justify-center px-6">
            <div className="max-w-md w-full rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4">
              <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">Error</p>
              <p className="text-sm text-red-600 dark:text-red-300">{errorMessage}</p>
              <button
                onClick={() => router.push("/")}
                className="mt-3 text-sm text-red-700 dark:text-red-400 underline"
              >
                Back to home
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Status row */}
            <div className="shrink-0 px-6 pt-5 pb-3 flex flex-col gap-2.5">
              <div className="flex items-center justify-center gap-2">
                {!isDone && <Spinner />}
                <AnimatePresence mode="wait">
                  <motion.p
                    key={statusMessage}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className={[
                      "text-sm",
                      isDone
                        ? "text-green-600 dark:text-green-400 font-medium"
                        : "text-gray-500 dark:text-gray-400",
                    ].join(" ")}
                  >
                    {statusMessage}
                  </motion.p>
                </AnimatePresence>
              </div>

              {/* Progress bar — visible once segments are known */}
              {segments.length > 0 && (
                <div className="h-px bg-gray-100 dark:bg-gray-700/60 rounded-full overflow-hidden">
                  <motion.div
                    className={[
                      "h-full rounded-full",
                      isDone ? "bg-green-400 dark:bg-green-500" : "bg-blue-400 dark:bg-blue-500",
                    ].join(" ")}
                    animate={{ width: `${progressPct * 100}%` }}
                    transition={{ duration: 0.4, ease: "easeOut" }}
                  />
                </div>
              )}
            </div>

            {/*
              Visualization — flex-1 so it fills the remaining height naturally.
              overflow-y-auto handles long audio with many rows.
              Padding gives the chart breathing room.
            */}
            <div className="flex-1 min-h-0 overflow-y-auto px-6 pb-4">
              {segments.length > 0 ? (
                <SegmentBar
                  segments={segments}
                  getStatus={getSegmentStatus}
                  totalDuration={totalDuration}
                />
              ) : (
                <TimelinePlaceholder />
              )}
            </div>

            {/* Bottom controls */}
            <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-gray-800">
              {segments.length > 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500 tabular-nums">
                  {transcribedCount} / {segments.length} segments
                </p>
              ) : (
                <span />
              )}
              {canStartPractice ? (
                <button
                  onClick={() =>
                    router.push(`/practice?url=${encodeURIComponent(audioUrl)}`)
                  }
                  className="rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white text-sm font-medium px-6 py-2 transition-colors"
                >
                  Start Practicing →
                </button>
              ) : (
                <span />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center bg-white dark:bg-gray-900">
          <p className="text-sm text-gray-400">Loading…</p>
        </div>
      }
    >
      <ProcessingContent />
    </Suspense>
  );
}
