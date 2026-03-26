/**
 * All application-wide TypeScript types.
 * New types go here — do not scatter them across feature files.
 */

// ---------------------------------------------------------------------------
// Audio data
// ---------------------------------------------------------------------------

export interface AudioSegment {
  segmentIndex: number;
  audioHash: string;
  start: number; // seconds from start of original audio
  end: number; // seconds from start of original audio
  duration: number; // seconds (end - start)
}

export interface AudioData {
  audioHash: string; // PK — base-36 32-bit djb2 hash of the URL
  audioUrl: string;
  segments: AudioSegment[];
  transcripts: Record<number, string>; // segmentIndex → transcript text
  queueItems: number[]; // segmentIndexes currently in worker queue
  totalSegments: number;
  transcribedCount: number;
  lastAccessed: number; // Unix ms
  createdAt: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Transcription cache
// ---------------------------------------------------------------------------

export interface TranscriptRecord {
  key: string; // PK — `${audioHash}-${segmentIndex}`
  audioHash: string;
  segmentIndex: number;
  modelVersion: string; // MODEL_ID at time of transcription
  text: string;
  timestamp: number; // Unix ms
}

// ---------------------------------------------------------------------------
// Session / practice history
// ---------------------------------------------------------------------------

export interface SessionInput {
  segmentIndex: number;
  userInput: string;
  score: number; // 0–1
  timestamp: number; // Unix ms
}

export interface SessionRecord {
  timestamp: number; // PK — session start time (Unix ms)
  audioUrl: string;
  audioHash: string;
  inputs: SessionInput[];
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

export type TokenClass = "correct" | "incorrect" | "missing" | "extra";

export interface ScoredToken {
  text: string;
  class: TokenClass;
}

export interface ScoreResult {
  score: number; // 0–1  (correct / total reference tokens)
  tokens: ScoredToken[];
}

// ---------------------------------------------------------------------------
// Silence detection
// ---------------------------------------------------------------------------

export interface SilenceConfig {
  frameDurationMs: number; // default 30
  silenceThresholdDb: number; // default -40  (negative dB, e.g. -40)
  minSilenceDurationMs: number; // default 400 — minimum silence to be a split point
  minSegmentDurationMs: number; // default 500 — discard segments shorter than this
  maxSegmentDurationS: number; // default 25  — force-split segments longer than this
  mergeGapMs: number; // default 800 — merge adjacent segments closer than this
}

// ---------------------------------------------------------------------------
// Web Worker message protocol
// ---------------------------------------------------------------------------

export interface TranscribeJob {
  segmentIndex: number;
  audioHash: string;
  audioUrl: string; // used for display in queue sidebar
  pcmData: Float32Array;
  sampleRate: number;
}

export interface QueueItem {
  segmentIndex: number;
  audioHash: string;
  audioUrl: string;
}

export type WorkerInMessage =
  | { type: "init" }
  | { type: "batch-transcribe"; segments: TranscribeJob[] }
  | {
      type: "transcribe";
      segmentIndex: number;
      audioHash: string;
      audioUrl: string;
      pcmData: Float32Array;
      sampleRate: number;
    }
  | { type: "clear-queue" }
  | { type: "cancel-job"; segmentIndex: number; audioHash: string };

export type WorkerOutMessage =
  | { type: "ready" }
  | { type: "segment-start"; segmentIndex: number; audioHash: string }
  | {
      type: "segment-done";
      segmentIndex: number;
      audioHash: string;
      text: string;
    }
  | {
      type: "queue-updated";
      queueLength: number;
      queueItems: QueueItem[];
      activeJob: QueueItem | null;
    }
  | { type: "queue-cleared" }
  | { type: "error"; message: string };
