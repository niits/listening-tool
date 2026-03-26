/**
 * IndexedDB read/write for the `transcripts` table.
 * Each record maps one (audioHash, segmentIndex) pair to a transcript text.
 */

import { db } from "./db";
import type { TranscriptRecord } from "./types";
import { MODEL_ID } from "./model.config";

function makeKey(audioHash: string, segmentIndex: number): string {
  return `${audioHash}-${segmentIndex}`;
}

export async function getTranscript(
  audioHash: string,
  segmentIndex: number
): Promise<TranscriptRecord | undefined> {
  return db.transcripts.get(makeKey(audioHash, segmentIndex));
}

export async function saveTranscript(
  audioHash: string,
  segmentIndex: number,
  text: string
): Promise<void> {
  await db.transcripts.put({
    key: makeKey(audioHash, segmentIndex),
    audioHash,
    segmentIndex,
    modelVersion: MODEL_ID,
    text,
    timestamp: Date.now(),
  });
}

export async function getAllTranscripts(
  audioHash: string
): Promise<TranscriptRecord[]> {
  return db.transcripts.where("audioHash").equals(audioHash).toArray();
}

export async function deleteTranscriptsForAudio(
  audioHash: string
): Promise<void> {
  await db.transcripts.where("audioHash").equals(audioHash).delete();
}
