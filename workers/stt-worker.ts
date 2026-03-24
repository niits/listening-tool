/**
 * Web Worker for STT Transcription using @huggingface/transformers
 *
 * This worker runs transcription in the background to keep the main thread responsive.
 * It loads the Whisper model once and reuses it for all segments.
 */

import {
  pipeline,
  env,
  AutomaticSpeechRecognitionPipeline,
} from "@xenova/transformers";
import type { WorkerMessage } from "../lib/types";

// Model base URL: R2 public bucket in production, local path in dev
// NEXT_PUBLIC_R2_MODEL_BASE_URL is injected at build time by Next.js
const MODEL_BASE_URL = process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL || "/models/";

// Load models from R2 (production) or local public/models/ (dev)
env.allowLocalModels = true;
env.localModelPath = MODEL_BASE_URL;
// In production (R2 configured): disable HuggingFace CDN to prevent CORS errors.
// In dev (no R2, no local model files): allow remote fallback to HuggingFace CDN.
env.allowRemoteModels = !process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL;

// WASM runtime is still bundled locally (files are small, under 25MB limit)
env.backends.onnx.wasm.wasmPaths = "/transformers-wasm/";

// Global state
let isInitialized = false;
let modelLoaded = false;
let transcriber: AutomaticSpeechRecognitionPipeline | null = null;
let currentModel: string | null = null;

// Queue for batch transcription
interface QueueItem {
  segmentIndex: number;
  audioHash: string;
  audioUrl?: string;
  pcmData: Float32Array;
  sampleRate: number;
}
let transcriptionQueue: QueueItem[] = [];
let isProcessingQueue = false;
let currentProcessingIndex: number | null = null;
let currentProcessingItem: QueueItem | null = null;

/**
 * Process the transcription queue sequentially
 */
async function processQueue(): Promise<void> {
  if (isProcessingQueue) {
    return;
  }

  if (transcriptionQueue.length === 0) {
    isProcessingQueue = false;
    currentProcessingIndex = null;
    return;
  }

  isProcessingQueue = true;

  // Process one item at a time
  const item = transcriptionQueue.shift();

  if (item) {
    currentProcessingIndex = item.segmentIndex;
    currentProcessingItem = item;

    // Send detailed queue update
    self.postMessage({
      type: "queue-updated",
      queueLength: transcriptionQueue.length,
      queueItems: [
        { segmentIndex: item.segmentIndex, audioHash: item.audioHash, audioUrl: item.audioUrl, status: "processing" },
        ...transcriptionQueue.map((q) => ({
          segmentIndex: q.segmentIndex,
          audioHash: q.audioHash,
          audioUrl: q.audioUrl,
          status: "queued",
        })),
      ],
    });

    await transcribeSegment(item.segmentIndex, item.audioHash, item.pcmData, item.sampleRate);
  }

  // Reset processing flag and continue with next item
  currentProcessingIndex = null;
  currentProcessingItem = null;
  isProcessingQueue = false;

  // Send queue update after processing
  self.postMessage({
    type: "queue-updated",
    queueLength: transcriptionQueue.length,
    queueItems: transcriptionQueue.map((q) => ({
      segmentIndex: q.segmentIndex,
      audioHash: q.audioHash,
      audioUrl: q.audioUrl,
      status: "queued",
    })),
  });

  // Process next item if queue is not empty
  if (transcriptionQueue.length > 0) {
    processQueue();
  }
}

/**
 * Add segments to queue
 */
function addToQueue(segments: QueueItem[]): void {
  transcriptionQueue.push(...segments);

  const queueItems =
    currentProcessingItem !== null
      ? [
          {
            segmentIndex: currentProcessingItem.segmentIndex,
            audioHash: currentProcessingItem.audioHash,
            audioUrl: currentProcessingItem.audioUrl,
            status: "processing" as const,
          },
          ...transcriptionQueue.map((q) => ({
            segmentIndex: q.segmentIndex,
            audioHash: q.audioHash,
            audioUrl: q.audioUrl,
            status: "queued" as const,
          })),
        ]
      : transcriptionQueue.map((q) => ({
          segmentIndex: q.segmentIndex,
          audioHash: q.audioHash,
          audioUrl: q.audioUrl,
          status: "queued" as const,
        }));

  self.postMessage({
    type: "queue-updated",
    queueLength: transcriptionQueue.length,
    queueItems,
  });

  // Start processing if not already processing
  if (!isProcessingQueue) {
    processQueue();
  }
}

/**
 * Clear the queue
 */
function clearQueue(): void {
  transcriptionQueue = [];
  isProcessingQueue = false;
  currentProcessingIndex = null;
  currentProcessingItem = null;
  self.postMessage({
    type: "queue-cleared",
  });
}

/**
 * Cancel a specific job in the queue
 */
function cancelJob(segmentIndex: number, audioHash: string): void {
  const initialLength = transcriptionQueue.length;
  transcriptionQueue = transcriptionQueue.filter(
    (item) => !(item.segmentIndex === segmentIndex && item.audioHash === audioHash)
  );

  if (initialLength !== transcriptionQueue.length) {
    const queueItems =
      currentProcessingItem !== null
        ? [
            {
              segmentIndex: currentProcessingItem.segmentIndex,
              audioHash: currentProcessingItem.audioHash,
              audioUrl: currentProcessingItem.audioUrl,
              status: "processing" as const,
            },
            ...transcriptionQueue.map((q) => ({
              segmentIndex: q.segmentIndex,
              audioHash: q.audioHash,
              audioUrl: q.audioUrl,
              status: "queued" as const,
            })),
          ]
        : transcriptionQueue.map((q) => ({
            segmentIndex: q.segmentIndex,
            audioHash: q.audioHash,
            audioUrl: q.audioUrl,
            status: "queued" as const,
          }));

    self.postMessage({
      type: "queue-updated",
      queueLength: transcriptionQueue.length,
      queueItems,
    });
  }
}

/**
 * Initialize Whisper model using @huggingface/transformers
 */
async function initializeModel(modelName: string): Promise<void> {
  try {
    if (modelLoaded && currentModel === modelName) {
      return;
    }

    // If switching models, dispose of the old one
    if (transcriber && currentModel !== modelName) {
      modelLoaded = false;
      transcriber = null;
    }

    currentModel = modelName;

    // Load the model with progress callback
    transcriber = await pipeline("automatic-speech-recognition", modelName, {
      quantized: true, // Use quantized model for better performance
      progress_callback: (progress: any) => {
        // Send progress updates to main thread
        if (progress.status === "progress") {
          self.postMessage({
            type: "progress",
            file: progress.file,
            progress: progress.progress,
            loaded: progress.loaded,
            total: progress.total,
          });
        }
      },
    });

    modelLoaded = true;
    isInitialized = true;

    // Notify main thread that worker is ready
    self.postMessage({ type: "ready" });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    self.postMessage({
      type: "error",
      message: `Failed to initialize model: ${errorMessage}`,
    });
  }
}

/**
 * Transcribe audio segment using @huggingface/transformers
 */
async function transcribeSegment(
  segmentIndex: number,
  audioHash: string,
  pcmData: Float32Array,
  sampleRate: number
): Promise<void> {
  try {
    if (!modelLoaded || !transcriber) {
      throw new Error("Model not initialized");
    }

    // Notify that transcription started
    self.postMessage({
      type: "segment-start",
      segmentIndex,
      audioHash,
    });

    // Run transcription with @huggingface/transformers
    const output = await transcriber(pcmData, {
      // Greedy decoding (deterministic)
      top_k: 0,
      do_sample: false,

      // Chunking parameters for longer audio
      chunk_length_s: 30,
      stride_length_s: 5,

      // Return just the text, not timestamps
      return_timestamps: false,
    });

    // Extract text from output - handle both single and array results
    const text =
      typeof output === "string"
        ? output
        : Array.isArray(output)
          ? output.map((o) => o.text).join(" ")
          : output.text;

    // Return result
    self.postMessage({
      type: "segment-done",
      segmentIndex,
      audioHash,
      text,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    self.postMessage({
      type: "error",
      message: `Transcription failed for segment ${segmentIndex}: ${errorMessage}`,
    });
  }
}

/**
 * Message handler
 */
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const { type } = event.data;

  switch (type) {
    case "init":
      // Model URL is actually the model name from HuggingFace
      // e.g., "Xenova/whisper-tiny" or "Xenova/whisper-base"
      await initializeModel(event.data.modelUrl);
      break;

    case "transcribe":
      addToQueue([
        {
          segmentIndex: event.data.segmentIndex,
          audioHash: event.data.audioHash,
          pcmData: event.data.pcmData,
          sampleRate: event.data.sampleRate,
        },
      ]);
      break;

    case "batch-transcribe":
      addToQueue(event.data.segments);
      break;

    case "clear-queue":
      clearQueue();
      break;

    case "cancel-job":
      cancelJob(event.data.segmentIndex, event.data.audioHash);
      break;

    default:
      self.postMessage({
        type: "error",
        message: `Unknown message type: ${type}`,
      });
  }
};

/**
 * USAGE NOTES:
 *
 * This worker uses @xenova/transformers (Transformers.js) for speech recognition.
 *
 * Available models:
 * - Xenova/whisper-tiny (~40MB) - Fastest, less accurate
 * - Xenova/whisper-base (~75MB) - Good balance
 * - Xenova/whisper-small (~240MB) - Better accuracy
 * - Xenova/whisper-medium (~770MB) - High accuracy, slower
 *
 * To use:
 * 1. Install: npm install @xenova/transformers
 * 2. Send init message with model name: { type: 'init', modelUrl: 'Xenova/whisper-tiny' }
 * 3. Send transcribe messages with PCM data (16kHz Float32Array)
 *
 * The model is automatically downloaded and cached in the browser.
 * First load will be slower, subsequent loads will be instant.
 *
 * Configuration options in transcribeSegment():
 * - chunk_length_s: Length of audio chunks (default: 30s)
 * - stride_length_s: Overlap between chunks (default: 5s)
 * - return_timestamps: Whether to return word timestamps
 * - language: Force specific language (e.g., 'english', 'spanish')
 * - task: 'transcribe' or 'translate' (to English)
 */

export {};
