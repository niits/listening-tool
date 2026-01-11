"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { WorkerResponse, TranscriptSegment } from "@/lib/types";
import { cacheTranscript, getCachedTranscript } from "@/lib/transcriptionCache";

export interface TranscriptionState {
  isReady: boolean;
  isProcessing: boolean;
  currentSegment: number | null;
  transcripts: Map<number, string>;
  error: string | null;
}

export function useTranscriptionWorker(modelUrl: string, audioUrl: string) {
  const [state, setState] = useState<TranscriptionState>({
    isReady: false,
    isProcessing: false,
    currentSegment: null,
    transcripts: new Map(),
    error: null,
  });

  const workerRef = useRef<Worker | null>(null);
  const audioUrlRef = useRef(audioUrl);

  /**
   * Initialize worker
   */
  useEffect(() => {
    audioUrlRef.current = audioUrl;

    // Create worker
    const worker = new Worker(
      new URL("../workers/stt-worker.ts", import.meta.url),
      {
        type: "module",
      }
    );

    workerRef.current = worker;

    // Set up message handler
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const message = event.data;

      switch (message.type) {
        case "ready":
          setState((prev) => ({ ...prev, isReady: true, error: null }));
          break;

        case "segment-start":
          setState((prev) => ({
            ...prev,
            isProcessing: true,
            currentSegment: message.segmentIndex,
          }));
          break;

        case "segment-done":
          setState((prev) => {
            const newTranscripts = new Map(prev.transcripts);
            newTranscripts.set(message.segmentIndex, message.text);

            return {
              ...prev,
              isProcessing: false,
              currentSegment: null,
              transcripts: newTranscripts,
            };
          });

          // Cache the transcript
          cacheTranscript(
            audioUrlRef.current,
            message.segmentIndex,
            message.text
          );
          break;

        case "error":
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentSegment: null,
            error: message.message,
          }));
          break;
      }
    };

    worker.onerror = (error) => {
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        error: error.message || "Worker error",
      }));
    };

    // Initialize the worker with model URL
    worker.postMessage({ type: "init", modelUrl });

    // Cleanup on unmount
    return () => {
      worker.terminate();
    };
  }, [modelUrl, audioUrl]);

  /**
   * Transcribe a segment
   */
  const transcribeSegment = useCallback(
    async (
      segmentIndex: number,
      pcmData: Float32Array,
      sampleRate: number
    ): Promise<string> => {
      if (!workerRef.current || !state.isReady) {
        throw new Error("Worker not ready");
      }

      // Check cache first
      const cached = await getCachedTranscript(
        audioUrlRef.current,
        segmentIndex
      );
      if (cached) {
        setState((prev) => {
          const newTranscripts = new Map(prev.transcripts);
          newTranscripts.set(segmentIndex, cached);
          return { ...prev, transcripts: newTranscripts };
        });
        return cached;
      }

      // If already processing, wait
      if (state.isProcessing) {
        throw new Error("Already processing a segment");
      }

      return new Promise((resolve, reject) => {
        const handler = (event: MessageEvent<WorkerResponse>) => {
          const message = event.data;

          if (
            message.type === "segment-done" &&
            message.segmentIndex === segmentIndex
          ) {
            workerRef.current?.removeEventListener("message", handler);
            resolve(message.text);
          } else if (message.type === "error") {
            workerRef.current?.removeEventListener("message", handler);
            reject(new Error(message.message));
          }
        };

        workerRef.current?.addEventListener("message", handler);

        // Send transcription request
        workerRef.current?.postMessage({
          type: "transcribe",
          segmentIndex,
          pcmData,
          sampleRate,
        });
      });
    },
    [state.isReady, state.isProcessing]
  );

  /**
   * Transcribe all segments sequentially
   */
  const transcribeAllSegments = useCallback(
    async (
      segments: { pcmData: Float32Array; sampleRate: number }[]
    ): Promise<void> => {
      for (let i = 0; i < segments.length; i++) {
        const { pcmData, sampleRate } = segments[i];
        await transcribeSegment(i, pcmData, sampleRate);
      }
    },
    [transcribeSegment]
  );

  /**
   * Get transcript for a segment
   */
  const getTranscript = useCallback(
    (segmentIndex: number): string | null => {
      return state.transcripts.get(segmentIndex) ?? null;
    },
    [state.transcripts]
  );

  /**
   * Clear all transcripts
   */
  const clearTranscripts = useCallback(() => {
    setState((prev) => ({
      ...prev,
      transcripts: new Map(),
    }));
  }, []);

  return {
    ...state,
    transcribeSegment,
    transcribeAllSegments,
    getTranscript,
    clearTranscripts,
  };
}
