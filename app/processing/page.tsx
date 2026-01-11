"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { SegmentProcessingList } from "@/components/SegmentProcessingList";
import { useAudioProcessing } from "@/hooks/useAudioProcessing";
import { useTranscription } from "@/contexts/TranscriptionContext";
import { getCachedAudio, saveAudioCache } from "@/lib/audioCache";

function ProcessingPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const audioUrl = searchParams.get("url");

  const [isAnimating, setIsAnimating] = useState(false);
  const [currentAudioUrl, setCurrentAudioUrl] = useState<string | null>(null);
  const [loadedFromCache, setLoadedFromCache] = useState(false);
  const [segmentsPushedToQueue, setSegmentsPushedToQueue] = useState(false);
  const [lastPushedAudioHash, setLastPushedAudioHash] = useState<string | null>(
    null
  );

  const {
    isLoading: audioLoading,
    error: audioError,
    segments,
    processAudio,
    getSegmentPCM,
    progress,
    reset: resetAudioProcessing,
    audioHash,
  } = useAudioProcessing();

  const {
    isReady: workerReady,
    isProcessing: transcribing,
    currentSegment,
    transcripts,
    error: workerError,
    transcribeAllSegments,
    setAudioUrl,
    clearTranscripts,
    loadCachedTranscripts,
    queueLength,
    queueItems,
    clearQueue,
  } = useTranscription();

  useEffect(() => {
    if (!audioUrl) {
      router.push("/");
      return;
    }

    const decodedUrl = decodeURIComponent(audioUrl);

    // Check if audio URL has changed
    if (currentAudioUrl !== decodedUrl) {
      setCurrentAudioUrl(decodedUrl);
      setIsAnimating(false);
      setLoadedFromCache(false);

      // Clear queue for previous audio
      clearQueue();
      setSegmentsPushedToQueue(false);
      setLastPushedAudioHash(null);

      // Try to load from cache first
      const loadFromCache = async () => {
        const cached = await getCachedAudio(decodedUrl);

        if (cached && cached.segments.length > 0) {
          // Load cached data
          setLoadedFromCache(true);

          // Process audio to get audioHash and segments
          const result = await processAudio(decodedUrl);

          if (result?.audioHash) {
            // Set audio URL with hash (don't clear transcripts)
            setAudioUrl(decodedUrl, result.audioHash);
            // Load cached transcripts and queue items
            loadCachedTranscripts(
              cached.transcripts,
              result.audioHash,
              cached.queueItems || []
            );
          }
        } else {
          // No cache, start fresh
          clearTranscripts();
          resetAudioProcessing();
          const result = await processAudio(decodedUrl);

          if (result?.audioHash) {
            setAudioUrl(decodedUrl, result.audioHash);
          }
        }
      };

      loadFromCache();
    }
  }, [
    audioUrl,
    router,
    currentAudioUrl,
    clearTranscripts,
    resetAudioProcessing,
    setAudioUrl,
    processAudio,
    loadCachedTranscripts,
    clearQueue,
  ]);

  useEffect(() => {
    if (
      segments.length > 0 &&
      workerReady &&
      audioUrl &&
      audioHash &&
      !segmentsPushedToQueue &&
      lastPushedAudioHash !== audioHash
    ) {
      // Save segments to cache with current queue state
      const decodedUrl = decodeURIComponent(audioUrl);
      saveAudioCache(decodedUrl, segments, transcripts, queueItems);

      // Prepare all segments that need transcription (in order)
      const segmentsToTranscribe = [];
      for (let i = 0; i < segments.length; i++) {
        if (!transcripts.has(i)) {
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
        // All segments already transcribed
        setSegmentsPushedToQueue(true);
        setLastPushedAudioHash(audioHash);
      }
    }
  }, [
    segments,
    workerReady,
    audioUrl,
    audioHash,
    segmentsPushedToQueue,
    lastPushedAudioHash,
    transcripts,
    getSegmentPCM,
    transcribeAllSegments,
    queueItems,
  ]);

  useEffect(() => {
    // When all segments are transcribed, navigate to practice page immediately (no animation)
    if (
      segments.length > 0 &&
      transcripts.size === segments.length &&
      !transcribing
    ) {
      const timer = setTimeout(() => {
        router.push(`/practice?url=${encodeURIComponent(audioUrl || "")}`);
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [segments.length, transcripts.size, transcribing, router, audioUrl]);

  const completedSegments = transcripts.size;
  const totalSegments = segments.length;

  // Determine navigation eligibility
  const canNavigateToPractice = completedSegments >= 10;
  const needsAnimation =
    completedSegments >= 10 && completedSegments < totalSegments;
  const isFullyComplete = completedSegments === totalSegments;

  const handleGoToPractice = () => {
    // Rule 2.1: Block if < 10 segments
    if (completedSegments < 10) {
      return; // Do nothing
    }

    // Rule 2.2: Redirect immediately if all complete
    if (isFullyComplete) {
      router.push(`/practice?url=${encodeURIComponent(audioUrl || "")}`);
      return;
    }

    // Rule 2.3: Animate then redirect
    if (needsAnimation) {
      setIsAnimating(true);
      // Navigation will happen in onAnimationComplete
    }
  };

  const handleAnimationComplete = () => {
    if (isAnimating) {
      router.push(`/practice?url=${encodeURIComponent(audioUrl || "")}`);
    }
  };

  const error = audioError || workerError;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-none p-8 pb-4">
        <button
          onClick={() => router.push("/")}
          className="text-blue-600 hover:text-blue-700 flex items-center gap-2 mb-6"
        >
          ← Back to Home
        </button>

        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Processing Audio
          </h1>
          <p className="text-gray-600">
            Analyzing audio and generating transcriptions...
          </p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg mb-4">
            <p className="text-red-800 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {audioLoading && (
          <div className="p-6 bg-blue-50 rounded-lg border border-blue-200 mb-4">
            <div className="space-y-3">
              <p className="text-blue-800 font-medium">
                Loading and analyzing audio...
              </p>
              <div className="w-full bg-blue-200 rounded-full h-2 overflow-hidden">
                <div
                  className="bg-blue-600 h-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="text-blue-600 text-sm">{progress}%</p>
            </div>
          </div>
        )}

        {!audioLoading && segments.length > 0 && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg mb-4">
            <p className="text-green-800">
              ✓ Audio segmented into {segments.length} parts
              {loadedFromCache && transcripts.size > 0 && (
                <span className="ml-2 text-green-600">
                  ({transcripts.size} segments loaded from cache)
                </span>
              )}
            </p>
          </div>
        )}
      </div>

      {!audioLoading && segments.length > 0 && (
        <div className="flex-1 px-8 pb-8 overflow-hidden">
          <motion.div
            animate={
              isAnimating
                ? {
                    scale: 0.2,
                    opacity: 0,
                    y: -40,
                  }
                : {
                    scale: 1,
                    opacity: 1,
                    y: 0,
                  }
            }
            transition={{
              duration: 0.5,
              ease: "easeInOut",
            }}
            onAnimationComplete={handleAnimationComplete}
          >
            <SegmentProcessingList
              segments={segments}
              transcripts={transcripts}
              currentSegment={currentSegment}
              isProcessing={transcribing}
            />
          </motion.div>

          {transcribing && queueLength > 0 && (
            <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <p className="text-blue-800 text-sm">
                Transcribing segment{" "}
                {currentSegment !== null ? currentSegment + 1 : "..."}
                <span className="ml-2 text-blue-600">
                  ({queueLength} segments in queue)
                </span>
              </p>
            </div>
          )}

          {canNavigateToPractice && transcripts.size < segments.length && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg text-center">
              <p className="text-blue-800 mb-2">
                {transcripts.size} of {segments.length} segments ready
              </p>
              <button
                onClick={handleGoToPractice}
                disabled={completedSegments < 10}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Start Practice Now
              </button>
              <p className="text-blue-600 text-sm mt-2">
                More segments will be available as transcription continues
              </p>
            </div>
          )}

          {transcripts.size === segments.length && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
              <p className="text-green-800 font-medium">
                ✓ All segments transcribed! Redirecting to practice...
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProcessingPage() {
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
      <ProcessingPageContent />
    </Suspense>
  );
}
