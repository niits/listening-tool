import { db, hashAudioUrl, generateCacheKey } from "./db";
import { SessionHistory } from "./types";

/**
 * Cache transcript for a segment
 */
export async function cacheTranscript(
  audioUrl: string,
  segmentIndex: number,
  text: string,
  modelVersion: string = "whisper-v1"
): Promise<void> {
  const audioHash = hashAudioUrl(audioUrl);
  const key = generateCacheKey(audioHash, segmentIndex, modelVersion);

  await db.transcripts.put({
    key,
    audioHash,
    segmentIndex,
    modelVersion,
    text,
    timestamp: Date.now(),
  });
}

/**
 * Retrieve cached transcript for a segment
 */
export async function getCachedTranscript(
  audioUrl: string,
  segmentIndex: number,
  modelVersion: string = "whisper-v1"
): Promise<string | null> {
  const audioHash = hashAudioUrl(audioUrl);
  const key = generateCacheKey(audioHash, segmentIndex, modelVersion);

  const result = await db.transcripts.get(key);
  return result?.text ?? null;
}

/**
 * Save session history
 */
export async function saveSession(session: SessionHistory): Promise<void> {
  await db.sessions.put(session);
}

/**
 * Get all sessions
 */
export async function getAllSessions(): Promise<SessionHistory[]> {
  return await db.sessions.toArray();
}

/**
 * Get sessions for a specific audio URL
 */
export async function getSessionsByUrl(
  audioUrl: string
): Promise<SessionHistory[]> {
  return await db.sessions.where("audioUrl").equals(audioUrl).toArray();
}

/**
 * Delete a session
 */
export async function deleteSession(timestamp: number): Promise<void> {
  await db.sessions.delete(timestamp);
}

/**
 * Clear all cached data
 */
export async function clearAllData(): Promise<void> {
  await db.transcripts.clear();
  await db.sessions.clear();
}
