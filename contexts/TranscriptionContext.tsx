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
  TranscriptionQueueItem,
} from "@/lib/types";
import { updateAudioTranscripts, updateQueueItems } from "@/lib/audioCache";
import { MODEL_ID } from "@/config/model.config";

export interface TranscriptionState {
  isReady: boolean;
  isProcessing: boolean;
  currentSegment: number | null;
  transcripts: Map<string, Map<number, string>>; // audioHash → Map<segmentIndex, text>
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
    audioUrl: string,
    audioHash: string
  ) => Promise<string>;
  transcribeAllSegments: (
    segments: Array<{
      segmentIndex: number;
      audioHash: string;
      pcmData: Float32Array;
      sampleRate: number;
    }>
  ) => void;
  getTranscript: (audioHash: string, segmentIndex: number) => string | null;
  getTranscriptsForAudio: (audioHash: string) => Map<number, string>;
  clearTranscripts: (audioHash?: string) => void;
  setAudioUrl: (url: string, audioHash: string) => void;
  loadCachedTranscripts: (
    transcripts: Map<number, string>,
    audioHash: string,
    queueItems?: TranscriptionQueueItem[]
  ) => void;
  clearQueue: () => void;
  cancelJob: (audioHash: string, segmentIndex: number) => void;
}

const TranscriptionContext = createContext<
  TranscriptionContextType | undefined
>(undefined);

const MODEL_URL = MODEL_ID; // Use shared config

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
  // Maps audioHash → audioUrl for correct per-audio cache writes
  const audioUrlMapRef = useRef<Map<string, string>>(new Map());
  // Tracks current audio hash without stale-closure risk
  const currentAudioHashRef = useRef<string | null>(null);
  // Tracks pending one-shot listeners for cleanup on unmount
  const pendingHandlersRef = useRef<Set<(e: MessageEvent) => void>>(new Set());

  /**
   * Initialize worker once
   */
  useEffect(() => {
    const worker = new Worker(
      new URL("../workers/stt-worker.ts", import.meta.url),
      { type: "module" }
    );

    workerRef.current = worker;

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
            const allTranscripts = new Map(prev.transcripts);
            const audioTranscripts = new Map(
              allTranscripts.get(message.audioHash) ?? new Map<number, string>()
            );
            audioTranscripts.set(message.segmentIndex, message.text);
            allTranscripts.set(message.audioHash, audioTranscripts);

            // Write to the correct audio file's cache
            const audioUrl = audioUrlMapRef.current.get(message.audioHash);
            if (audioUrl) {
              updateAudioTranscripts(audioUrl, audioTranscripts);
            }

            return {
              ...prev,
              transcripts: allTranscripts,
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
              queueItems: message.queueItems as TranscriptionQueueItem[],
              isProcessing:
                message.queueLength > 0 ||
                message.queueItems.some((item) => item.status === "processing"),
            };

            // Update cache per audio file
            const byHash = new Map<string, TranscriptionQueueItem[]>();
            (message.queueItems as TranscriptionQueueItem[]).forEach((item) => {
              const list = byHash.get(item.audioHash) ?? [];
              list.push(item);
              byHash.set(item.audioHash, list);
            });
            byHash.forEach((items, hash) => {
              const url = audioUrlMapRef.current.get(hash);
              if (url) updateQueueItems(url, items);
            });

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

    worker.postMessage({ type: "init", modelUrl: MODEL_URL });

    return () => {
      // Clean up all pending one-shot handlers before terminating
      pendingHandlersRef.current.forEach((h) =>
        worker.removeEventListener("message", h)
      );
      pendingHandlersRef.current.clear();
      worker.terminate();
    };
  }, []);

  /**
   * Register audio URL ↔ hash mapping; update currentAudioHash state.
   * Uses refs to avoid stale-closure issues with rapid successive calls.
   */
  const setAudioUrl = useCallback((url: string, audioHash: string) => {
    audioUrlMapRef.current.set(audioHash, url);

    const isChanging =
      currentAudioHashRef.current !== null &&
      currentAudioHashRef.current !== audioHash;

    if (isChanging) {
      setState((prev) => ({
        ...prev,
        currentAudioHash: audioHash,
        currentSegment: null,
        isProcessing: false,
      }));
    } else if (currentAudioHashRef.current === null) {
      setState((prev) => ({ ...prev, currentAudioHash: audioHash }));
    }

    currentAudioHashRef.current = audioHash;
  }, []);

  /**
   * Load cached transcripts into the per-audio map.
   * Does NOT send restore-queue to the worker — the caller's useEffect
   * handles re-queuing any untranscribed segments.
   */
  const loadCachedTranscripts = useCallback(
    (
      transcripts: Map<number, string>,
      audioHash: string,
      queueItems?: TranscriptionQueueItem[]
    ) => {
      setState((prev) => {
        const allTranscripts = new Map(prev.transcripts);
        allTranscripts.set(audioHash, new Map(transcripts));
        return {
          ...prev,
          transcripts: allTranscripts,
          currentAudioHash: audioHash,
          queueItems: queueItems || [],
          queueLength:
            queueItems?.filter((item) => item.status === "queued").length || 0,
          isProcessing:
            queueItems?.some((item) => item.status === "processing") || false,
        };
      });
    },
    []
  );

  /**
   * Transcribe a single segment.
   * Checks per-audio cache first; queues in worker if not already done.
   */
  const transcribeSegment = useCallback(
    async (
      segmentIndex: number,
      pcmData: Float32Array,
      sampleRate: number,
      audioUrl: string,
      audioHash: string
    ): Promise<string> => {
      if (!workerRef.current || !state.isReady) {
        throw new Error("Worker not ready");
      }

      // Per-audio duplicate check
      const audioTranscripts = state.transcripts.get(audioHash);
      if (audioTranscripts?.has(segmentIndex)) {
        return audioTranscripts.get(segmentIndex)!;
      }

      audioUrlMapRef.current.set(audioHash, audioUrl);

      return new Promise((resolve, reject) => {
        const handler = (event: MessageEvent<WorkerResponse>) => {
          const msg = event.data;
          if (
            msg.type === "segment-done" &&
            msg.segmentIndex === segmentIndex &&
            msg.audioHash === audioHash
          ) {
            pendingHandlersRef.current.delete(handler);
            workerRef.current?.removeEventListener("message", handler);
            resolve(msg.text);
          } else if (msg.type === "error") {
            pendingHandlersRef.current.delete(handler);
            workerRef.current?.removeEventListener("message", handler);
            reject(new Error(msg.message));
          }
        };

        pendingHandlersRef.current.add(handler);
        workerRef.current!.addEventListener("message", handler);
        workerRef.current!.postMessage({
          type: "transcribe",
          segmentIndex,
          audioHash,
          pcmData,
          sampleRate,
        });
      });
    },
    [state.isReady, state.transcripts]
  );

  /**
   * Transcribe all segments in batch (queued in worker).
   */
  const transcribeAllSegments = useCallback(
    (
      segments: Array<{
        segmentIndex: number;
        audioHash: string;
        pcmData: Float32Array;
        sampleRate: number;
      }>
    ) => {
      if (!workerRef.current || !state.isReady) {
        throw new Error("Worker not ready");
      }

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
      workerRef.current.postMessage({ type: "clear-queue" });
    }
  }, []);

  /**
   * Cancel a specific job in the queue
   */
  const cancelJob = useCallback((audioHash: string, segmentIndex: number) => {
    if (workerRef.current) {
      workerRef.current.postMessage({
        type: "cancel-job",
        segmentIndex,
        audioHash,
      });
    }
  }, []);

  /**
   * Get transcript for a specific segment of a specific audio file
   */
  const getTranscript = useCallback(
    (audioHash: string, segmentIndex: number): string | null => {
      return state.transcripts.get(audioHash)?.get(segmentIndex) ?? null;
    },
    [state.transcripts]
  );

  /**
   * Get all transcripts for a specific audio file
   */
  const getTranscriptsForAudio = useCallback(
    (audioHash: string): Map<number, string> => {
      return state.transcripts.get(audioHash) ?? new Map<number, string>();
    },
    [state.transcripts]
  );

  /**
   * Clear transcripts — optionally scoped to one audio file
   */
  const clearTranscripts = useCallback((audioHash?: string) => {
    setState((prev) => {
      if (audioHash) {
        const allTranscripts = new Map(prev.transcripts);
        allTranscripts.delete(audioHash);
        return { ...prev, transcripts: allTranscripts };
      }
      return { ...prev, transcripts: new Map() };
    });
  }, []);

  const value: TranscriptionContextType = {
    ...state,
    transcribeSegment,
    transcribeAllSegments,
    getTranscript,
    getTranscriptsForAudio,
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
