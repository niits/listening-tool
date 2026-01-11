import {
  db,
  hashAudioUrl,
  type CachedAudioData,
  type CachedAudioDataDB,
} from "./db";
import { AudioSegment, TranscriptionQueueItem } from "./types";

// Re-export for backwards compatibility
export type { CachedAudioData };
export { hashAudioUrl };

/**
 * Save audio data to cache
 */
export async function saveAudioCache(
  audioUrl: string,
  segments: AudioSegment[],
  transcripts: Map<number, string>,
  queueItems: TranscriptionQueueItem[] = []
): Promise<string> {
  const audioHash = hashAudioUrl(audioUrl);

  // Convert Map to object for storage
  const transcriptsObj: Record<number, string> = {};
  transcripts.forEach((text, index) => {
    transcriptsObj[index] = text;
  });

  const now = Date.now();

  const existing = await db.audioData.get(audioHash);

  await db.audioData.put({
    audioHash,
    audioUrl,
    segments,
    transcripts: transcriptsObj,
    queueItems,
    totalSegments: segments.length,
    transcribedCount: transcripts.size,
    lastAccessed: now,
    createdAt: existing?.createdAt || now,
  });

  return audioHash;
}

/**
 * Get cached audio data
 */
export async function getCachedAudio(
  audioUrl: string
): Promise<CachedAudioData | null> {
  const audioHash = hashAudioUrl(audioUrl);

  const data = await db.audioData.get(audioHash);

  if (!data) return null;

  // Convert transcripts object back to Map
  const transcriptsMap = new Map<number, string>();
  const transcriptsObj = data.transcripts as Record<number, string>;
  Object.entries(transcriptsObj).forEach(([key, value]) => {
    transcriptsMap.set(parseInt(key), value);
  });

  // Update last accessed time
  await db.audioData.put({
    ...data,
    lastAccessed: Date.now(),
  });

  return {
    ...data,
    transcripts: transcriptsMap,
  };
}

/**
 * Update transcripts for cached audio
 */
export async function updateAudioTranscripts(
  audioUrl: string,
  transcripts: Map<number, string>
): Promise<void> {
  const audioHash = hashAudioUrl(audioUrl);

  const existing = await db.audioData.get(audioHash);
  if (!existing) return;

  // Convert Map to object
  const transcriptsObj: Record<number, string> = {};
  transcripts.forEach((text, index) => {
    transcriptsObj[index] = text;
  });

  await db.audioData.put({
    ...existing,
    transcripts: transcriptsObj,
    transcribedCount: transcripts.size,
    lastAccessed: Date.now(),
  });
}

/**
 * Update queue items for cached audio
 */
export async function updateQueueItems(
  audioUrl: string,
  queueItems: TranscriptionQueueItem[]
): Promise<void> {
  const audioHash = hashAudioUrl(audioUrl);

  const existing = await db.audioData.get(audioHash);
  if (!existing) return;

  await db.audioData.put({
    ...existing,
    queueItems,
    lastAccessed: Date.now(),
  });
}

/**
 * Get all cached audio files
 */
export async function getAllCachedAudio(): Promise<CachedAudioData[]> {
  const allData = await db.audioData.toArray();

  return allData
    .map((data) => {
      // Convert transcripts object back to Map
      const transcriptsMap = new Map<number, string>();
      const transcriptsObj = data.transcripts as Record<number, string>;
      Object.entries(transcriptsObj).forEach(([key, value]) => {
        transcriptsMap.set(parseInt(key), value);
      });

      return {
        ...data,
        transcripts: transcriptsMap,
      };
    })
    .sort((a, b) => b.lastAccessed - a.lastAccessed); // Sort by most recent
}

/**
 * Delete cached audio
 */
export async function deleteCachedAudio(audioUrl: string): Promise<void> {
  const audioHash = hashAudioUrl(audioUrl);
  await db.audioData.delete(audioHash);
}

/**
 * Clear all cache
 */
export async function clearAllCache(): Promise<void> {
  await db.audioData.clear();
}

/**
 * Get all queue items across all cached audio files
 */
export async function getAllQueueItems(): Promise<
  { audioUrl: string; audioHash: string; items: TranscriptionQueueItem[] }[]
> {
  const allData = await db.audioData.toArray();

  return allData
    .filter((data) => data.queueItems && data.queueItems.length > 0)
    .map((data) => ({
      audioUrl: data.audioUrl,
      audioHash: data.audioHash,
      items: data.queueItems,
    }));
}
