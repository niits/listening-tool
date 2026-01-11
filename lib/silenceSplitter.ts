import { AudioSegment } from "./types";

/**
 * Configuration for silence detection
 */
export interface SilenceConfig {
  frameDuration: number; // in milliseconds (20-50ms)
  silenceThreshold: number; // in decibels (e.g., -40dB)
  minSilenceDuration: number; // in milliseconds (300-500ms)
  minSegmentDuration: number; // in milliseconds (e.g., 500ms)
}

const DEFAULT_CONFIG: SilenceConfig = {
  frameDuration: 30, // 30ms frames
  silenceThreshold: -40, // -40dB
  minSilenceDuration: 400, // 400ms
  minSegmentDuration: 500, // 500ms
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
 * Detect silence-based segments in PCM audio data
 */
export function detectSilenceSegments(
  pcmData: Float32Array,
  sampleRate: number,
  config: Partial<SilenceConfig> = {}
): AudioSegment[] {
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

  // Analyze each frame
  for (let i = 0; i < totalFrames; i++) {
    const startSample = i * frameSamples;
    const endSample = Math.min(startSample + frameSamples, pcmData.length);
    const frame = pcmData.slice(startSample, endSample);

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
