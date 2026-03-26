"use client";

/**
 * TranscriptionContext
 *
 * A global React context that owns the single Web Worker running Whisper.
 * The Worker is created once when the app first loads and persists across
 * page navigations (because the context lives in layout.tsx).
 *
 * The context provides:
 *  - workerReady: whether the model has finished loading
 *  - transcripts: Map<`${audioHash}-${segmentIndex}`, text>
 *  - queueItems: what's waiting in the worker queue
 *  - activeJob: the segment currently being transcribed
 *  - batchTranscribe / cancelJob / clearQueue: control the worker queue
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import type {
  TranscribeJob,
  QueueItem,
  WorkerInMessage,
  WorkerOutMessage,
} from "../lib/types";
import { saveTranscript } from "../lib/transcriptionCache";
import { saveTranscriptToAudioData } from "../lib/audioCache";

interface TranscriptionContextValue {
  workerReady: boolean;
  transcripts: Map<string, string>;
  queueItems: QueueItem[];
  activeJob: QueueItem | null;
  batchTranscribe: (jobs: TranscribeJob[]) => void;
  cancelJob: (segmentIndex: number, audioHash: string) => void;
  clearQueue: () => void;
}

const TranscriptionContext = createContext<TranscriptionContextValue | null>(
  null
);

export function TranscriptionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const workerRef = useRef<Worker | null>(null);
  const [workerReady, setWorkerReady] = useState(false);
  const [transcripts, setTranscripts] = useState<Map<string, string>>(
    () => new Map()
  );
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [activeJob, setActiveJob] = useState<QueueItem | null>(null);

  useEffect(() => {
    // Create the worker. Next.js bundles workers referenced with `new URL()`
    // and the `{ type: 'module' }` option enables ES module syntax in the worker.
    const worker = new Worker(
      new URL("../workers/stt-worker.ts", import.meta.url),
      { type: "module" }
    );
    workerRef.current = worker;

    worker.onmessage = async (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "ready":
          setWorkerReady(true);
          break;

        case "segment-done": {
          const { segmentIndex, audioHash, text } = msg;
          const key = `${audioHash}-${segmentIndex}`;

          // Persist to IndexedDB
          await saveTranscript(audioHash, segmentIndex, text);
          await saveTranscriptToAudioData(audioHash, segmentIndex, text);

          // Update in-memory map (create a new Map to trigger re-render)
          setTranscripts((prev) => {
            const next = new Map(prev);
            next.set(key, text);
            return next;
          });
          break;
        }

        case "queue-updated":
          setQueueItems(msg.queueItems);
          setActiveJob(msg.activeJob);
          break;

        case "queue-cleared":
          setQueueItems([]);
          setActiveJob(null);
          break;

        case "error":
          console.error("STT Worker error:", msg.message);
          break;
      }
    };

    worker.onerror = (err) => {
      console.error("STT Worker uncaught error:", err);
    };

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  const sendToWorker = useCallback((msg: WorkerInMessage) => {
    workerRef.current?.postMessage(msg);
  }, []);

  const batchTranscribe = useCallback(
    (jobs: TranscribeJob[]) => {
      sendToWorker({ type: "batch-transcribe", segments: jobs });
    },
    [sendToWorker]
  );

  const cancelJob = useCallback(
    (segmentIndex: number, audioHash: string) => {
      sendToWorker({ type: "cancel-job", segmentIndex, audioHash });
    },
    [sendToWorker]
  );

  const clearQueue = useCallback(() => {
    sendToWorker({ type: "clear-queue" });
  }, [sendToWorker]);

  return (
    <TranscriptionContext.Provider
      value={{
        workerReady,
        transcripts,
        queueItems,
        activeJob,
        batchTranscribe,
        cancelJob,
        clearQueue,
      }}
    >
      {children}
    </TranscriptionContext.Provider>
  );
}

export function useTranscription(): TranscriptionContextValue {
  const ctx = useContext(TranscriptionContext);
  if (!ctx) {
    throw new Error(
      "useTranscription must be used inside <TranscriptionProvider>"
    );
  }
  return ctx;
}
