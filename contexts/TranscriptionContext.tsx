"use client";

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import {
  WorkerResponse,
  AudioSegment,
  TranscriptionQueueItem,
} from "@/lib/types";
import { updateAudioTranscripts, updateQueueItems } from "@/lib/audioCache";

export interface TranscriptionState {
  isReady: boolean;
  isProcessing: boolean;
  currentSegment: number | null;
  transcripts: Map<number, string>;
  error: string | null;
  currentAudioHash: string | null;
  queueLength: number;
  queueItems: TranscriptionQueueItem[];
}

interface TranscriptionContextType extends TranscriptionState {
  transcribeSegment: (
    segmentIndex: number,
    pcmData: Float32Array,
    sampleRate: number,
    audioUrl: string
  ) => Promise<string>;
  transcribeAllSegments: (
    segments: Array<{
      segmentIndex: number;
      pcmData: Float32Array;
      sampleRate: number;
    }>
  ) => void;
  getTranscript: (segmentIndex: number) => string | null;
  clearTranscripts: () => void;
  setAudioUrl: (url: string, audioHash: string) => void;
  loadCachedTranscripts: (
    transcripts: Map<number, string>,
    audioHash: string,
    queueItems?: TranscriptionQueueItem[]
  ) => void;
  clearQueue: () => void;
  cancelJob: (segmentIndex: number) => void;
}

const TranscriptionContext = createContext<
  TranscriptionContextType | undefined
>(undefined);

const MODEL_URL = "Xenova/whisper-base.en";

export function TranscriptionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TranscriptionState>({
    isReady: false,
    isProcessing: false,
    currentSegment: null,
    transcripts: new Map(),
    error: null,
    currentAudioHash: null,
    queueLength: 0,
    queueItems: [],
  });

  const workerRef = useRef<Worker | null>(null);
  const currentAudioUrlRef = useRef<string>("");

  /**
   * Initialize worker once
   */
  useEffect(() => {
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

            // Update cache asynchronously
            if (currentAudioUrlRef.current) {
              updateAudioTranscripts(
                currentAudioUrlRef.current,
                newTranscripts
              );
            }

            return {
              ...prev,
              transcripts: newTranscripts,
              currentSegment: null,
            };
          });
          break;

        case "error":
          setState((prev) => ({
            ...prev,
            isProcessing: false,
            currentSegment: null,
            error: message.message,
          }));
          break;

        case "queue-updated":
          setState((prev) => {
            const newState = {
              ...prev,
              queueLength: message.queueLength,
              queueItems: message.queueItems,
              isProcessing:
                message.queueLength > 0 ||
                message.queueItems.some((item) => item.status === "processing"),
            };

            // Update queue in cache
            if (currentAudioUrlRef.current) {
              updateQueueItems(currentAudioUrlRef.current, message.queueItems);
            }

            return newState;
          });
          break;

        case "queue-cleared":
          setState((prev) => ({
            ...prev,
            queueLength: 0,
            queueItems: [],
            isProcessing: false,
            currentSegment: null,
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
    worker.postMessage({ type: "init", modelUrl: MODEL_URL });

    // Cleanup on unmount
    return () => {
      worker.terminate();
    };
  }, []);

  /**
   * Set the current audio URL (for cache key)
   */
  const setAudioUrl = useCallback(
    (url: string, audioHash: string) => {
      // Only clear transcripts if audio actually changed AND we're not loading from cache
      const isAudioChanging =
        currentAudioUrlRef.current !== url && currentAudioUrlRef.current !== "";

      if (isAudioChanging) {
        // Don't clear transcripts here - let the caller manage this
        setState((prev) => ({
          ...prev,
          currentAudioHash: audioHash,
          currentSegment: null,
          isProcessing: false,
        }));
      } else if (!state.currentAudioHash) {
        setState((prev) => ({
          ...prev,
          currentAudioHash: audioHash,
        }));
      }
      currentAudioUrlRef.current = url;
    },
    [state.currentAudioHash]
  );

  /**
   * Load cached transcripts and queue items
   */
  const loadCachedTranscripts = useCallback(
    (
      transcripts: Map<number, string>,
      audioHash: string,
      queueItems?: TranscriptionQueueItem[]
    ) => {
      setState((prev) => ({
        ...prev,
        transcripts: new Map(transcripts),
        currentAudioHash: audioHash,
        queueItems: queueItems || [],
        queueLength:
          queueItems?.filter((item) => item.status === "queued").length || 0,
        isProcessing:
          queueItems?.some((item) => item.status === "processing") || false,
      }));

      // Restore queue to worker if there are queued items
      if (queueItems && queueItems.length > 0 && workerRef.current) {
        workerRef.current.postMessage({
          type: "restore-queue",
          queueItems,
        });
      }
    },
    []
  );

  /**
   * Transcribe a segment
   */
  const transcribeSegment = useCallback(
    async (
      segmentIndex: number,
      pcmData: Float32Array,
      sampleRate: number,
      audioUrl: string
    ): Promise<string> => {
      if (!workerRef.current || !state.isReady) {
        throw new Error("Worker not ready");
      }

      // Check if already transcribed
      if (state.transcripts.has(segmentIndex)) {
        return state.transcripts.get(segmentIndex)!;
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
   * Transcribe all segments in batch (they will be queued in worker)
   */
  const transcribeAllSegments = useCallback(
    (
      segments: Array<{
        segmentIndex: number;
        pcmData: Float32Array;
        sampleRate: number;
      }>
    ) => {
      if (!workerRef.current || !state.isReady) {
        throw new Error("Worker not ready");
      }

      // Send all segments to worker queue
      workerRef.current.postMessage({
        type: "batch-transcribe",
        segments,
      });
    },
    [state.isReady]
  );

  /**
   * Clear the transcription queue
   */
  const clearQueue = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: "clear-queue",
      });
    }
  }, []);

  /**
   * Cancel a specific job in the queue
   */
  const cancelJob = useCallback((segmentIndex: number) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: "cancel-job",
        segmentIndex,
      });
    }
  }, []);

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

  const value: TranscriptionContextType = {
    ...state,
    transcribeSegment,
    transcribeAllSegments,
    getTranscript,
    clearTranscripts,
    setAudioUrl,
    loadCachedTranscripts,
    clearQueue,
    cancelJob,
  };

  return (
    <TranscriptionContext.Provider value={value}>
      {children}
    </TranscriptionContext.Provider>
  );
}

export function useTranscription() {
  const context = useContext(TranscriptionContext);
  if (context === undefined) {
    throw new Error(
      "useTranscription must be used within a TranscriptionProvider"
    );
  }
  return context;
}
