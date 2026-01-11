import Dexie, { Table } from "dexie";
import { AudioSegment, SessionHistory, TranscriptionQueueItem } from "./types";

/**
 * Audio cache data structure (in DB)
 */
export interface CachedAudioDataDB {
  audioHash: string;
  audioUrl: string;
  segments: AudioSegment[];
  transcripts: Record<number, string>;
  queueItems: TranscriptionQueueItem[];
  totalSegments: number;
  transcribedCount: number;
  lastAccessed: number;
  createdAt: number;
}

/**
 * Audio cache data structure (in memory)
 */
export interface CachedAudioData {
  audioHash: string;
  audioUrl: string;
  segments: AudioSegment[];
  transcripts: Map<number, string>;
  queueItems: TranscriptionQueueItem[];
  totalSegments: number;
  transcribedCount: number;
  lastAccessed: number;
  createdAt: number;
}

/**
 * Transcript cache data structure
 */
export interface CachedTranscript {
  key: string;
  audioHash: string;
  segmentIndex: number;
  modelVersion: string;
  text: string;
  timestamp: number;
}

/**
 * Dexie database class
 */
export class ListeningToolDB extends Dexie {
  // Tables
  audioData!: Table<CachedAudioDataDB, string>;
  transcripts!: Table<CachedTranscript, string>;
  sessions!: Table<SessionHistory, number>;

  constructor() {
    super("listening-tool-db");

    this.version(1).stores({
      audioData: "audioHash, audioUrl, lastAccessed, createdAt",
      transcripts: "key, audioHash, segmentIndex, timestamp",
      sessions: "timestamp, audioUrl",
    });
  }
}

// Create singleton instance
export const db = new ListeningToolDB();

/**
 * Simple hash function for audio URL
 */
export function hashAudioUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Generate cache key for transcript
 */
export function generateCacheKey(
  audioHash: string,
  segmentIndex: number,
  modelVersion: string = "whisper-v1"
): string {
  return `${audioHash}-${segmentIndex}-${modelVersion}`;
}
