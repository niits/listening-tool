// Types for the application

export interface AudioSegment {
  start: number;
  end: number;
  audioHash?: string; // Optional hash to identify which audio this segment belongs to
  segmentId?: string; // Unique ID: audioHash-segmentIndex
}

export interface TranscriptSegment extends AudioSegment {
  text: string;
}

export interface UserAttempt {
  segmentIndex: number;
  userInput: string;
  score: number;
  timestamp: number;
}

export interface SessionHistory {
  audioUrl: string;
  segments: AudioSegment[];
  inputs: UserAttempt[];
  timestamp: number;
}

export interface ComparisonResult {
  score: number;
  correctTokens: string[];
  incorrectTokens: string[];
  missingTokens: string[];
  extraTokens: string[];
}

// Worker Message Types
export type WorkerInitMessage = {
  type: "init";
  modelUrl: string;
};

export type WorkerTranscribeMessage = {
  type: "transcribe";
  segmentIndex: number;
  audioHash: string;
  pcmData: Float32Array;
  sampleRate: number;
};

export type WorkerBatchTranscribeMessage = {
  type: "batch-transcribe";
  segments: Array<{
    segmentIndex: number;
    audioHash: string;
    pcmData: Float32Array;
    sampleRate: number;
  }>;
};

export type WorkerClearQueueMessage = {
  type: "clear-queue";
};

export type WorkerCancelJobMessage = {
  type: "cancel-job";
  segmentIndex: number;
  audioHash: string;
};

export type WorkerMessage =
  | WorkerInitMessage
  | WorkerTranscribeMessage
  | WorkerBatchTranscribeMessage
  | WorkerClearQueueMessage
  | WorkerCancelJobMessage;

export type WorkerReadyResponse = {
  type: "ready";
};

export type WorkerSegmentStartResponse = {
  type: "segment-start";
  segmentIndex: number;
  audioHash: string;
};

export type WorkerSegmentDoneResponse = {
  type: "segment-done";
  segmentIndex: number;
  audioHash: string;
  text: string;
};

export type WorkerErrorResponse = {
  type: "error";
  message: string;
};

export type WorkerQueueUpdatedResponse = {
  type: "queue-updated";
  queueLength: number;
  queueItems: Array<{
    segmentIndex: number;
    audioHash: string;
    audioUrl?: string;
    status: "queued" | "processing";
  }>;
};

export type WorkerQueueClearedResponse = {
  type: "queue-cleared";
};

export type WorkerResponse =
  | WorkerReadyResponse
  | WorkerSegmentStartResponse
  | WorkerSegmentDoneResponse
  | WorkerErrorResponse
  | WorkerQueueUpdatedResponse
  | WorkerQueueClearedResponse;

// Queue item for tracking
export interface TranscriptionQueueItem {
  segmentIndex: number;
  audioHash: string;
  audioUrl?: string;
  status: "queued" | "processing";
}
