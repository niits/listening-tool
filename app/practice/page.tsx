"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PracticeSegment } from "@/components/PracticeSegment";
import { useAudioProcessing } from "@/hooks/useAudioProcessing";
import { useTranscription } from "@/contexts/TranscriptionContext";
import { UserAttempt, SessionHistory } from "@/lib/types";
import { saveSession } from "@/lib/transcriptionCache";
import { getCachedAudio } from "@/lib/audioCache";

function PracticePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioUrl = searchParams.get("url");

  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const [userAttempts, setUserAttempts] = useState<UserAttempt[]>([]);
  const [processingStarted, setProcessingStarted] = useState(false);
  const [cachedTranscripts, setCachedTranscripts] = useState<
    Map<number, string>
  >(new Map());
  const [loadingCache, setLoadingCache] = useState(true);
  const [segmentsPushedToQueue, setSegmentsPushedToQueue] = useState(false);
  const [lastPushedAudioHash, setLastPushedAudioHash] = useState<string | null>(
    null
  );
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const { segments, processAudio, getSegmentPCM, audioHash } =
    useAudioProcessing();
  const {
    transcripts,
    transcribeAllSegments,
    isReady: workerReady,
    setAudioUrl,
    queueLength,
    loadCachedTranscripts,
  } = useTranscription();

  useEffect(() => {
    if (!audioUrl) {
      router.push("/");
      return;
    }

    // Set the audio URL for caching
    if (audioHash) {
      setAudioUrl(decodeURIComponent(audioUrl), audioHash);
    }

    if (!processingStarted) {
      setProcessingStarted(true);

      // Re-process audio to get segments
      processAudio(decodeURIComponent(audioUrl)).catch((error) => {
        console.error("Failed to process audio:", error);
        // If processing fails, redirect back to processing page
        router.push(`/processing?url=${encodeURIComponent(audioUrl)}`);
      });
    }

    // Create audio element
    const audio = new Audio(decodeURIComponent(audioUrl));
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = "";
    };
  }, [
    audioUrl,
    processAudio,
    router,
    processingStarted,
    setAudioUrl,
    audioHash,
  ]);

  // Load cached transcripts when segments are available
  useEffect(() => {
    if (!audioUrl || segments.length === 0 || !audioHash) return;

    const loadCache = async () => {
      setLoadingCache(true);

      // Load from audioCache instead of individual transcripts
      const cached = await getCachedAudio(decodeURIComponent(audioUrl));

      if (cached && cached.transcripts.size > 0) {
        setCachedTranscripts(cached.transcripts);
        // Load cached transcripts and queue items into TranscriptionContext
        loadCachedTranscripts(
          cached.transcripts,
          audioHash,
          cached.queueItems || []
        );
      }

      setLoadingCache(false);
    };

    loadCache();
  }, [audioUrl, segments.length, audioHash, loadCachedTranscripts]);

  // Continue transcribing segments in the background
  useEffect(() => {
    if (
      segments.length > 0 &&
      workerReady &&
      audioUrl &&
      audioHash &&
      !loadingCache &&
      !segmentsPushedToQueue &&
      lastPushedAudioHash !== audioHash
    ) {
      // Prepare all segments that need transcription (in order)
      const segmentsToTranscribe = [];
      for (let i = 0; i < segments.length; i++) {
        // Check both cached and worker transcripts
        if (!cachedTranscripts.has(i) && !transcripts.has(i)) {
          const pcmData = getSegmentPCM(i, 16000);
          if (pcmData) {
            segmentsToTranscribe.push({
              segmentIndex: i,
              pcmData,
              sampleRate: 16000,
            });
          }
        }
      }

      // Send all segments to worker queue at once (only once)
      if (segmentsToTranscribe.length > 0) {
        transcribeAllSegments(segmentsToTranscribe);
        setSegmentsPushedToQueue(true);
        setLastPushedAudioHash(audioHash);
      } else if (segmentsToTranscribe.length === 0) {
        // All segments already cached, mark as pushed to avoid waiting
        setSegmentsPushedToQueue(true);
        setLastPushedAudioHash(audioHash);
      }
    }
  }, [
    segments,
    workerReady,
    audioUrl,
    audioHash,
    loadingCache,
    cachedTranscripts,
    transcripts,
    getSegmentPCM,
    transcribeAllSegments,
    segmentsPushedToQueue,
    lastPushedAudioHash,
  ]);

  // Sync transcripts from worker to cachedTranscripts
  useEffect(() => {
    setCachedTranscripts((prev) => {
      const updated = new Map(prev);
      transcripts.forEach((text, index) => {
        updated.set(index, text);
      });
      return updated;
    });
  }, [transcripts]);

  const handleSegmentComplete = (userInput: string, score: number) => {
    const attempt: UserAttempt = {
      segmentIndex: currentSegmentIndex,
      userInput,
      score,
      timestamp: Date.now(),
    };

    setUserAttempts((prev) => [...prev, attempt]);
  };

  const handleNext = () => {
    if (currentSegmentIndex < segments.length - 1) {
      setCurrentSegmentIndex((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (currentSegmentIndex > 0) {
      setCurrentSegmentIndex((prev) => prev - 1);
    }
  };

  const hasNextAvailable = currentSegmentIndex < segments.length - 1;
  const hasPrevAvailable = currentSegmentIndex > 0;
  const nextSegmentAvailable =
    hasNextAvailable && cachedTranscripts.has(currentSegmentIndex + 1);
  const prevSegmentAvailable =
    hasPrevAvailable && cachedTranscripts.has(currentSegmentIndex - 1);

  const handleSaveAndExit = async () => {
    if (!audioUrl) return;

    const session: SessionHistory = {
      audioUrl: decodeURIComponent(audioUrl),
      segments,
      inputs: userAttempts,
      timestamp: Date.now(),
    };

    await saveSession(session);
    router.push("/");
  };

  if (loadingCache || segments.length === 0 || cachedTranscripts.size === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-gray-600">
            {loadingCache
              ? "Loading transcripts..."
              : "Loading practice session..."}
          </p>
          <button
            onClick={() =>
              router.push(
                `/processing?url=${encodeURIComponent(audioUrl || "")}`
              )
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Go to Processing
          </button>
        </div>
      </main>
    );
  }

  const currentSegment = segments[currentSegmentIndex];
  const currentTranscript = cachedTranscripts.get(currentSegmentIndex);
  const isCurrentSegmentAvailable = !!currentTranscript;

  if (!currentSegment) {
    return (
      <main className="min-h-screen flex items-center justify-center p-8">
        <div className="text-center space-y-4">
          <p className="text-gray-600">Segment not available</p>
          <button
            onClick={() =>
              router.push(
                `/processing?url=${encodeURIComponent(audioUrl || "")}`
              )
            }
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Re-process Audio
          </button>
        </div>
      </main>
    );
  }

  const completedCount = userAttempts.filter(
    (a) => a.segmentIndex <= currentSegmentIndex
  ).length;
  const averageScore =
    userAttempts.length > 0
      ? userAttempts.reduce((sum, a) => sum + a.score, 0) / userAttempts.length
      : 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-8">
      <div className="max-w-6xl mx-auto space-y-8 w-full">
        <div className="flex items-center justify-between">
          <button
            onClick={handleSaveAndExit}
            className="text-blue-600 hover:text-blue-700 flex items-center gap-2"
          >
            ← Save & Exit
          </button>
          <div className="text-sm text-gray-600">
            Progress: {completedCount} / {segments.length} segments
            {userAttempts.length > 0 && (
              <span className="ml-4">
                Average: {Math.round(averageScore * 100)}%
              </span>
            )}
          </div>
        </div>

        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Practice Session
          </h1>
          <p className="text-gray-600">
            Listen to each segment and type what you hear
          </p>
        </div>

        {cachedTranscripts.size < segments.length && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-amber-800 text-sm font-medium">
              ⚠ Transcription in progress: {cachedTranscripts.size}/
              {segments.length} segments available
              {queueLength > 0 && (
                <span className="ml-2">({queueLength} in queue)</span>
              )}
            </p>
            <div className="mt-2 w-full bg-amber-200 rounded-full h-1.5 overflow-hidden">
              <div
                className="bg-amber-600 h-full transition-all duration-300"
                style={{
                  width: `${(cachedTranscripts.size / segments.length) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {isCurrentSegmentAvailable ? (
          <div className="flex justify-center">
            <PracticeSegment
              segmentIndex={currentSegmentIndex}
              startTime={currentSegment.start}
              endTime={currentSegment.end}
              referenceTranscript={currentTranscript!}
              audioElement={audioRef.current}
              onComplete={handleSegmentComplete}
            />
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="w-full max-w-4xl p-6 bg-gray-100 rounded-lg border border-gray-300">
              <div className="text-center space-y-4">
                <p className="text-gray-600 text-lg">
                  Segment {currentSegmentIndex + 1} is being transcribed...
                </p>
                <div className="animate-pulse flex justify-center">
                  <div className="h-2 bg-gray-400 rounded w-1/2"></div>
                </div>
                <p className="text-gray-500 text-sm">
                  Please wait or navigate to an available segment
                </p>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={!hasPrevAvailable || !prevSegmentAvailable}
            className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title={
              !prevSegmentAvailable && hasPrevAvailable
                ? "Previous segment not transcribed yet"
                : ""
            }
          >
            ← Previous
          </button>

          <span className="text-gray-600">
            Segment {currentSegmentIndex + 1} of {segments.length}
            {!isCurrentSegmentAvailable && " (transcribing...)"}
          </span>

          <button
            onClick={handleNext}
            disabled={!hasNextAvailable || !nextSegmentAvailable}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            title={
              !nextSegmentAvailable && hasNextAvailable
                ? "Next segment not transcribed yet"
                : ""
            }
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Loading...</p>
          </div>
        </main>
      }
    >
      <PracticePageContent />
    </Suspense>
  );
}
