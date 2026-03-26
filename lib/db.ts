/**
 * Dexie (IndexedDB) database schema.
 *
 * Three tables:
 *  - audioData:   one record per audio URL (segments + transcript map + metadata)
 *  - transcripts: one record per (audioHash, segmentIndex) pair — granular cache
 *  - sessions:    user practice history (attempts per segment)
 *
 * Only indexed fields need to be listed in stores(). Non-indexed fields
 * are stored but not queryable — that is fine for our use case.
 */

import Dexie, { type Table } from "dexie";
import type { AudioData, TranscriptRecord, SessionRecord } from "./types";

class ListeningDB extends Dexie {
  audioData!: Table<AudioData, string>;
  transcripts!: Table<TranscriptRecord, string>;
  sessions!: Table<SessionRecord, number>;

  constructor() {
    super("ListeningPracticeDB");
    this.version(1).stores({
      audioData: "audioHash, lastAccessed",
      transcripts: "key, audioHash, segmentIndex",
      sessions: "timestamp, audioUrl, audioHash",
    });
  }
}

export const db = new ListeningDB();
