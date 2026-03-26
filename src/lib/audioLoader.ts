/**
 * Fetch an audio file from a URL, decode it with the Web Audio API,
 * and return a mono Float32Array with the sample rate.
 *
 * This runs on the main thread. The Web Audio API's decodeAudioData
 * is hardware-accelerated and handles all common formats (MP3, WAV, OGG, AAC, FLAC).
 */

import { mixDownToMono } from "./pcmTools";

export interface LoadedAudio {
  pcm: Float32Array; // mono, original sample rate
  sampleRate: number;
  durationSeconds: number;
}

/**
 * Load and decode audio from a URL.
 *
 * @param url        CORS-accessible audio URL
 * @param onProgress Called with a value 0–1 during the fetch phase
 * @throws Error with a descriptive message on network or decode failure
 */
export async function loadAudio(
  url: string,
  onProgress: (fraction: number) => void
): Promise<LoadedAudio> {
  // Fetch the raw bytes
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err) {
    throw new Error(
      `Network error fetching audio: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} — ${url}`);
  }

  // Stream the body and track download progress
  const contentLength = response.headers.get("Content-Length");
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  const reader = response.body?.getReader();

  if (!reader) {
    throw new Error("Response body is not readable (no ReadableStream)");
  }

  const chunks: Uint8Array[] = [];
  let received = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      if (total > 0) {
        onProgress(Math.min(received / total, 1));
      }
    }
  }

  // Merge chunks into a single ArrayBuffer
  const arrayBuffer = mergeChunks(chunks, received);

  // Decode with Web Audio API
  let audioBuffer: AudioBuffer;
  try {
    const ctx = new AudioContext();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    await ctx.close();
  } catch (err) {
    throw new Error(
      `Failed to decode audio: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  const pcm = mixDownToMono(audioBuffer);

  return {
    pcm,
    sampleRate: audioBuffer.sampleRate,
    durationSeconds: audioBuffer.duration,
  };
}

function mergeChunks(chunks: Uint8Array[], totalBytes: number): ArrayBuffer {
  const merged = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged.buffer;
}
