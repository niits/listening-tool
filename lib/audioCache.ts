/**
 * IndexedDB read/write operations for the `audioData` table.
 * All functions are async wrappers around Dexie queries.
 */

import { db } from "./db";
import type { AudioData, AudioSegment } from "./types";

export async function getAudioData(
  audioHash: string
): Promise<AudioData | undefined> {
  return db.audioData.get(audioHash);
}

export async function saveAudioData(data: AudioData): Promise<void> {
  await db.audioData.put(data);
}

export async function saveSegments(
  audioHash: string,
  segments: AudioSegment[],
  audioUrl: string
): Promise<void> {
  const existing = await db.audioData.get(audioHash);
  if (existing) {
    await db.audioData.update(audioHash, {
      segments,
      totalSegments: segments.length,
      lastAccessed: Date.now(),
    });
  } else {
    await db.audioData.put({
      audioHash,
      audioUrl,
      segments,
      transcripts: {},
      queueItems: [],
      totalSegments: segments.length,
      transcribedCount: 0,
      lastAccessed: Date.now(),
      createdAt: Date.now(),
    });
  }
}

export async function saveTranscriptToAudioData(
  audioHash: string,
  segmentIndex: number,
  text: string
): Promise<void> {
  const data = await db.audioData.get(audioHash);
  if (!data) return;
  const transcripts = { ...data.transcripts, [segmentIndex]: text };
  const transcribedCount = Object.keys(transcripts).length;
  await db.audioData.update(audioHash, { transcripts, transcribedCount });
}

export async function touchLastAccessed(audioHash: string): Promise<void> {
  await db.audioData.update(audioHash, { lastAccessed: Date.now() });
}

export async function deleteAudioData(audioHash: string): Promise<void> {
  await db.audioData.delete(audioHash);
}

export async function listAllAudio(): Promise<AudioData[]> {
  return db.audioData.orderBy("lastAccessed").reverse().toArray();
}
