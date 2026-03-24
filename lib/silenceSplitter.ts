import { AudioSegment } from "./types";

/**
 * Configuration for silence detection
 */
export interface SilenceConfig {
  frameDuration: number; // in milliseconds (20-50ms)
  silenceThreshold: number; // in decibels (e.g., -40dB)
  minSilenceDuration: number; // in milliseconds (300-500ms)
  minSegmentDuration: number; // in milliseconds (e.g., 500ms)
  maxSegmentDuration?: number; // in milliseconds — split segments longer than this (default: 25000ms)
  mergeThreshold?: number; // in milliseconds — merge adjacent segments with gap ≤ this (default: 800ms)
}

const DEFAULT_CONFIG: SilenceConfig = {
  frameDuration: 30, // 30ms frames
  silenceThreshold: -40, // -40dB
  minSilenceDuration: 400, // 400ms
  minSegmentDuration: 500, // 500ms
  maxSegmentDuration: 25000, // 25s
  mergeThreshold: 800, // 800ms
};

/**
 * Calculate RMS (Root Mean Square) energy for a frame
 * Optimized for single-pass calculation
 */
function calculateRMS(samples: Float32Array): number {
  let sum = 0;
  const length = samples.length;
  for (let i = 0; i < length; i++) {
    const sample = samples[i];
    sum += sample * sample;
  }
  return Math.sqrt(sum / length);
}

/**
 * Convert RMS to decibels
 */
function rmsToDb(rms: number): number {
  if (rms === 0) return -100;
  return 20 * Math.log10(rms);
}

/**
 * Core silence detection — returns raw segments without post-processing.
 * Uses subarray() for zero-copy frame views (no GC pressure).
 */
function detectRawSegments(
  pcmData: Float32Array,
  sampleRate: number,
  conf: SilenceConfig
): AudioSegment[] {
  const frameSamples = Math.floor((conf.frameDuration / 1000) * sampleRate);
  const minSilenceFrames = Math.floor(
    ((conf.minSilenceDuration / 1000) * sampleRate) / frameSamples
  );
  const minSegmentFrames = Math.floor(
    ((conf.minSegmentDuration / 1000) * sampleRate) / frameSamples
  );

  const totalFrames = Math.floor(pcmData.length / frameSamples);
  const isSilent: boolean[] = new Array(totalFrames);

  // Analyze each frame using subarray (zero-copy view, no allocation)
  for (let i = 0; i < totalFrames; i++) {
    const startSample = i * frameSamples;
    const endSample = Math.min(startSample + frameSamples, pcmData.length);
    const frame = pcmData.subarray(startSample, endSample);

    const rms = calculateRMS(frame);
    const db = rmsToDb(rms);

    isSilent[i] = db < conf.silenceThreshold;
  }

  // Find continuous silence regions
  const segments: AudioSegment[] = [];
  let segmentStart: number | null = null;
  let silenceCount = 0;

  for (let i = 0; i < totalFrames; i++) {
    if (isSilent[i]) {
      silenceCount++;

      // End of speech segment
      if (segmentStart !== null && silenceCount >= minSilenceFrames) {
        const segmentEnd = i - minSilenceFrames;
        const segmentLength = segmentEnd - segmentStart;

        if (segmentLength >= minSegmentFrames) {
          segments.push({
            start: (segmentStart * frameSamples) / sampleRate,
            end: (segmentEnd * frameSamples) / sampleRate,
          });
        }

        segmentStart = null;
      }
    } else {
      // Start of speech segment
      if (segmentStart === null) {
        segmentStart = i;
      }
      silenceCount = 0;
    }
  }

  // Handle final segment if audio ends with speech
  if (segmentStart !== null) {
    const segmentLength = totalFrames - segmentStart;
    if (segmentLength >= minSegmentFrames) {
      segments.push({
        start: (segmentStart * frameSamples) / sampleRate,
        end: (totalFrames * frameSamples) / sampleRate,
      });
    }
  }

  return segments;
}

/**
 * Split any segment exceeding maxSegmentDuration into equal-length chunks.
 */
function splitOversizedSegments(
  segments: AudioSegment[],
  maxDurationSec: number
): AudioSegment[] {
  const result: AudioSegment[] = [];
  for (const seg of segments) {
    const duration = seg.end - seg.start;
    if (duration <= maxDurationSec) {
      result.push(seg);
      continue;
    }
    let start = seg.start;
    while (start < seg.end) {
      result.push({ start, end: Math.min(start + maxDurationSec, seg.end) });
      start += maxDurationSec;
    }
  }
  return result;
}

/**
 * Merge adjacent segments whose gap is ≤ mergeThresholdSec,
 * as long as the merged result stays ≤ maxDurationSec.
 */
function mergeAdjacentSegments(
  segments: AudioSegment[],
  mergeThresholdSec: number,
  maxDurationSec: number
): AudioSegment[] {
  if (segments.length === 0 || mergeThresholdSec <= 0) return segments;
  const merged: AudioSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last) {
      const gap = seg.start - last.end;
      const mergedDuration = seg.end - last.start;
      if (gap <= mergeThresholdSec && mergedDuration <= maxDurationSec) {
        last.end = seg.end;
        continue;
      }
    }
    merged.push({ ...seg });
  }
  return merged;
}

/**
 * Detect silence-based segments in PCM audio data (synchronous).
 * Kept for backward compatibility; prefer detectSilenceSegmentsAsync for large files.
 */
export function detectSilenceSegments(
  pcmData: Float32Array,
  sampleRate: number,
  config: Partial<SilenceConfig> = {}
): AudioSegment[] {
  const conf: SilenceConfig = { ...DEFAULT_CONFIG, ...config };
  const raw = detectRawSegments(pcmData, sampleRate, conf);

  const maxDurSec = (conf.maxSegmentDuration ?? 25000) / 1000;
  const mergeThresholdSec = (conf.mergeThreshold ?? 800) / 1000;

  const split = splitOversizedSegments(raw, maxDurSec);
  return mergeAdjacentSegments(split, mergeThresholdSec, maxDurSec);
}

/**
 * Async version — yields to the main thread every 500 frames to avoid UI jank.
 * Use this in production for audio files longer than ~1 minute.
 */
export async function detectSilenceSegmentsAsync(
  pcmData: Float32Array,
  sampleRate: number,
  config: Partial<SilenceConfig> = {}
): Promise<AudioSegment[]> {
  const conf: SilenceConfig = { ...DEFAULT_CONFIG, ...config };

  const frameSamples = Math.floor((conf.frameDuration / 1000) * sampleRate);
  const minSilenceFrames = Math.floor(
    ((conf.minSilenceDuration / 1000) * sampleRate) / frameSamples
  );
  const minSegmentFrames = Math.floor(
    ((conf.minSegmentDuration / 1000) * sampleRate) / frameSamples
  );

  const totalFrames = Math.floor(pcmData.length / frameSamples);
  const isSilent: boolean[] = new Array(totalFrames);
  const YIELD_EVERY = 500;

  // Analyze frames with periodic yields
  for (let i = 0; i < totalFrames; i++) {
    const startSample = i * frameSamples;
    const endSample = Math.min(startSample + frameSamples, pcmData.length);
    const frame = pcmData.subarray(startSample, endSample);

    isSilent[i] = rmsToDb(calculateRMS(frame)) < conf.silenceThreshold;

    if (i % YIELD_EVERY === YIELD_EVERY - 1) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Build segments
  const segments: AudioSegment[] = [];
  let segmentStart: number | null = null;
  let silenceCount = 0;

  for (let i = 0; i < totalFrames; i++) {
    if (isSilent[i]) {
      silenceCount++;
      if (segmentStart !== null && silenceCount >= minSilenceFrames) {
        const segmentEnd = i - minSilenceFrames;
        if (segmentEnd - segmentStart >= minSegmentFrames) {
          segments.push({
            start: (segmentStart * frameSamples) / sampleRate,
            end: (segmentEnd * frameSamples) / sampleRate,
          });
        }
        segmentStart = null;
      }
    } else {
      if (segmentStart === null) segmentStart = i;
      silenceCount = 0;
    }
  }

  if (segmentStart !== null) {
    const segmentLength = totalFrames - segmentStart;
    if (segmentLength >= minSegmentFrames) {
      segments.push({
        start: (segmentStart * frameSamples) / sampleRate,
        end: (totalFrames * frameSamples) / sampleRate,
      });
    }
  }

  const maxDurSec = (conf.maxSegmentDuration ?? 25000) / 1000;
  const mergeThresholdSec = (conf.mergeThreshold ?? 800) / 1000;

  const split = splitOversizedSegments(segments, maxDurSec);
  return mergeAdjacentSegments(split, mergeThresholdSec, maxDurSec);
}
