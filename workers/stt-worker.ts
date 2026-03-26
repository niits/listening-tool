/**
 * Web Worker: Whisper speech-to-text transcription.
 *
 * This file runs in a Worker context (no DOM access).
 * It maintains a FIFO queue of transcription jobs and processes them
 * sequentially, sending progress updates to the main thread after each.
 *
 * Message protocol: see lib/types.ts (WorkerInMessage / WorkerOutMessage)
 */

import { pipeline, env } from "@huggingface/transformers";
import {
  MODEL_ID,
  MODEL_BASE_URL,
  WASM_BASE_URL,
} from "../config/model.config";
import type {
  WorkerInMessage,
  WorkerOutMessage,
  TranscribeJob,
  QueueItem,
} from "../lib/types";

// Configure transformers.js to load from our Pages Function proxy paths,
// which serve files from R2 on the same origin (no CORS issues).
env.localModelPath = MODEL_BASE_URL;
env.allowLocalModels = true;   // required in WebWorker env — defaults to false in browser contexts
env.allowRemoteModels = false; // never fetch from huggingface.co directly

// Set ONNX Runtime WASM binary path — typed as Object in the library, so cast
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(env.backends as any).onnx.wasm.wasmPaths = WASM_BASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type WhisperPipeline = any;

let transcriber: WhisperPipeline | null = null;
let isProcessing = false;
const queue: TranscribeJob[] = [];

function send(msg: WorkerOutMessage): void {
  self.postMessage(msg);
}

function queueSnapshot(): QueueItem[] {
  return queue.map((job) => ({
    segmentIndex: job.segmentIndex,
    audioHash: job.audioHash,
    audioUrl: job.audioUrl,
  }));
}

function activeJobFromQueue(): QueueItem | null {
  if (queue.length === 0) return null;
  return {
    segmentIndex: queue[0].segmentIndex,
    audioHash: queue[0].audioHash,
    audioUrl: queue[0].audioUrl,
  };
}

async function initModel(): Promise<void> {
  transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
    // dtype 'q8' uses the quantized ONNX model (smaller download, faster inference)
    dtype: "q8",
  });
  send({ type: "ready" });
}

async function processQueue(): Promise<void> {
  if (isProcessing || !transcriber) return;
  isProcessing = true;

  while (queue.length > 0) {
    const job = queue[0]; // peek — don't remove yet

    send({
      type: "segment-start",
      segmentIndex: job.segmentIndex,
      audioHash: job.audioHash,
    });

    let text = "";
    try {
      const result = await transcriber(job.pcmData, {
        sampling_rate: 16000,
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const raw: string = Array.isArray(result)
        ? (result[0] as { text: string }).text
        : (result as { text: string }).text;
      text = raw.trim();
    } catch (err) {
      console.error(
        `Worker: transcription error for segment ${job.segmentIndex}:`,
        err
      );
      // Continue with empty text — never stall the queue over one bad segment
    }

    // Remove from front of queue now that it's done
    queue.shift();

    send({
      type: "segment-done",
      segmentIndex: job.segmentIndex,
      audioHash: job.audioHash,
      text,
    });

    send({
      type: "queue-updated",
      queueLength: queue.length,
      queueItems: queueSnapshot(),
      activeJob: activeJobFromQueue(),
    });
  }

  isProcessing = false;
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const msg = event.data;

  switch (msg.type) {
    case "init": {
      try {
        await initModel();
      } catch (err) {
        send({
          type: "error",
          message: `Failed to load model: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      break;
    }

    case "batch-transcribe": {
      for (const seg of msg.segments) {
        queue.push(seg);
      }
      send({
        type: "queue-updated",
        queueLength: queue.length,
        queueItems: queueSnapshot(),
        activeJob: activeJobFromQueue(),
      });
      // fire-and-forget — keeps running while queue has items
      processQueue();
      break;
    }

    case "transcribe": {
      queue.push({
        segmentIndex: msg.segmentIndex,
        audioHash: msg.audioHash,
        audioUrl: msg.audioUrl,
        pcmData: msg.pcmData,
        sampleRate: msg.sampleRate,
      });
      send({
        type: "queue-updated",
        queueLength: queue.length,
        queueItems: queueSnapshot(),
        activeJob: activeJobFromQueue(),
      });
      processQueue();
      break;
    }

    case "cancel-job": {
      const idx = queue.findIndex(
        (j) =>
          j.segmentIndex === msg.segmentIndex && j.audioHash === msg.audioHash
      );
      if (idx > 0) {
        // idx 0 is the currently-running job — cannot cancel that
        queue.splice(idx, 1);
      }
      send({
        type: "queue-updated",
        queueLength: queue.length,
        queueItems: queueSnapshot(),
        activeJob: activeJobFromQueue(),
      });
      break;
    }

    case "clear-queue": {
      // Keep idx 0 (currently running) — only clear the waiting items
      if (queue.length > 1) {
        queue.splice(1);
      } else {
        queue.length = 0;
      }
      send({ type: "queue-cleared" });
      send({
        type: "queue-updated",
        queueLength: queue.length,
        queueItems: queueSnapshot(),
        activeJob: activeJobFromQueue(),
      });
      break;
    }
  }
};

// Start loading the model immediately when the worker starts
initModel().catch((err) => {
  send({
    type: "error",
    message: `Model init failed: ${err instanceof Error ? err.message : String(err)}`,
  });
});
