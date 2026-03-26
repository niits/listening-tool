/**
 * Split a mono PCM audio buffer into segments at silence boundaries.
 *
 * Algorithm:
 *  1. Divide audio into 30ms frames, compute RMS energy per frame
 *  2. Adaptive silence threshold — calibrates to each recording's noise floor
 *     (10th-percentile RMS × 6), avoiding false splits in noisy environments
 *  3. Classify frames as silence / speech
 *  4. Find silence runs ≥ 600ms → split points (midpoint of silence run)
 *  5. Build raw segments between split points
 *  6. Discard segments < 1.5s (sub-sentence fragments / noise)
 *  7. Merge adjacent segments whose gap < 400ms AND merged total ≤ 15s
 *  8. Force-split segments > 15s at the *longest internal silence* (not midpoint)
 *     to avoid cutting mid-sentence; fall back to midpoint if no silence found
 *
 * The function yields to the event loop every 500 frames to keep the UI
 * responsive during processing of long audio files.
 *
 * Config field meanings:
 *  frameDurationMs       — analysis frame size (30ms recommended)
 *  silenceThresholdDb    — fallback fixed threshold if adaptive calibration
 *                          produces an implausibly low value (< -60dB)
 *  minSilenceDurationMs  — minimum silence run to be treated as a sentence
 *                          boundary (600ms avoids breath-pause false splits)
 *  minSegmentDurationMs  — discard segments shorter than this (1500ms)
 *  maxSegmentDurationS   — force-split segments longer than this (15s)
 *  mergeGapMs            — merge consecutive segments closer than this (400ms)
 */

import type { AudioSegment, SilenceConfig } from "./types";

export const DEFAULT_SILENCE_CONFIG: SilenceConfig = {
  frameDurationMs: 30,
  silenceThresholdDb: -35,       // fallback fixed threshold
  minSilenceDurationMs: 600,     // ≥600ms pause → sentence boundary
  minSegmentDurationMs: 1500,    // discard fragments < 1.5s
  maxSegmentDurationS: 15,       // force-split segments > 15s
  mergeGapMs: 400,               // merge gap < 400ms → same sentence
};

function rmsToDb(rms: number): number {
  return 20 * Math.log10(rms + 1e-9);
}

function frameRms(pcm: Float32Array, start: number, end: number): number {
  let sum = 0;
  for (let i = start; i < end; i++) {
    sum += pcm[i] * pcm[i];
  }
  return Math.sqrt(sum / (end - start));
}

/**
 * Compute an adaptive silence threshold from the audio's own noise floor.
 *
 * Strategy: sort frame energies, take the 10th percentile as the noise floor
 * (frames that are nearly always silent), then multiply by 6 (~15dB above
 * floor). This handles both quiet studio recordings and noisy environments.
 *
 * Falls back to the config's fixed dB threshold if the adaptive value would
 * be implausibly low (very clean recording with near-zero noise floor).
 */
function computeAdaptiveThreshold(
  frameEnergies: Float32Array,
  fallbackDb: number
): number {
  const sorted = Float32Array.from(frameEnergies).sort();
  const noiseFloor = sorted[Math.floor(sorted.length * 0.10)];
  const adaptive = noiseFloor * 6;

  // If adaptive threshold is effectively inaudible, use the fixed fallback
  const adaptiveDb = rmsToDb(adaptive);
  if (adaptiveDb < -60) {
    return Math.pow(10, fallbackDb / 20);
  }
  return adaptive;
}

/**
 * Find the best split point within [startFrame, endFrame]:
 * returns the midpoint of the longest silence run inside that range.
 * Falls back to the arithmetic midpoint if no silence run of ≥ minFrames exists.
 */
function findBestSplitInRange(
  isSilent: boolean[],
  startFrame: number,
  endFrame: number,
  minSilenceFrames: number
): number {
  let bestMid = Math.floor((startFrame + endFrame) / 2);
  let bestLen = 0;
  let runStart = -1;

  for (let f = startFrame; f < endFrame; f++) {
    if (isSilent[f]) {
      if (runStart === -1) runStart = f;
    } else {
      if (runStart !== -1) {
        const len = f - runStart;
        if (len > bestLen) {
          bestLen = len;
          bestMid = Math.floor((runStart + f) / 2);
        }
        runStart = -1;
      }
    }
  }
  // Handle silence that extends to the end of the range
  if (runStart !== -1) {
    const len = endFrame - runStart;
    if (len > bestLen) {
      bestMid = Math.floor((runStart + endFrame) / 2);
      bestLen = len;
    }
  }

  // Only use the silence-based midpoint if the silence is meaningful
  const minFramesForSplit = Math.ceil(200 / 30); // 200ms minimum
  return bestLen >= minFramesForSplit ? bestMid : Math.floor((startFrame + endFrame) / 2);
}

export async function splitOnSilence(
  pcm: Float32Array,
  sampleRate: number,
  audioHash: string,
  config?: Partial<SilenceConfig>
): Promise<AudioSegment[]> {
  const cfg: SilenceConfig = { ...DEFAULT_SILENCE_CONFIG, ...config };

  const frameSamples = Math.floor((cfg.frameDurationMs / 1000) * sampleRate);
  const totalFrames = Math.floor(pcm.length / frameSamples);

  // Step 1: compute RMS energy per frame
  const frameEnergies = new Float32Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    const start = f * frameSamples;
    const end = Math.min(start + frameSamples, pcm.length);
    frameEnergies[f] = frameRms(pcm, start, end);

    if (f > 0 && f % 500 === 0) {
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  // Step 2: adaptive silence threshold
  const silenceThreshold = computeAdaptiveThreshold(frameEnergies, cfg.silenceThresholdDb);

  // Step 3: classify frames
  const isSilent: boolean[] = new Array(totalFrames);
  for (let f = 0; f < totalFrames; f++) {
    isSilent[f] = frameEnergies[f] < silenceThreshold;
  }

  // Step 4: find silence runs ≥ minSilenceDurationMs → split points
  const minSilenceFrames = Math.ceil(cfg.minSilenceDurationMs / cfg.frameDurationMs);
  const splitPoints: number[] = [0];

  let silenceStart = -1;
  for (let f = 0; f < totalFrames; f++) {
    if (isSilent[f]) {
      if (silenceStart === -1) silenceStart = f;
    } else {
      if (silenceStart !== -1) {
        const silenceLen = f - silenceStart;
        if (silenceLen >= minSilenceFrames) {
          splitPoints.push(Math.floor((silenceStart + f) / 2));
        }
        silenceStart = -1;
      }
    }
  }
  splitPoints.push(totalFrames);

  // Step 5: build raw segments
  interface RawSegment { startFrame: number; endFrame: number; }
  const raw: RawSegment[] = [];
  for (let i = 0; i < splitPoints.length - 1; i++) {
    raw.push({ startFrame: splitPoints[i], endFrame: splitPoints[i + 1] });
  }

  // Step 6: discard segments shorter than minSegmentDurationMs
  const minSegFrames = Math.ceil(cfg.minSegmentDurationMs / cfg.frameDurationMs);
  const filtered = raw.filter((s) => s.endFrame - s.startFrame >= minSegFrames);

  // Step 7: merge adjacent segments whose gap < mergeGapMs AND merged total ≤ maxSegmentDurationS
  const mergeGapFrames = Math.ceil(cfg.mergeGapMs / cfg.frameDurationMs);
  const maxFrames = Math.floor((cfg.maxSegmentDurationS * 1000) / cfg.frameDurationMs);
  const merged: RawSegment[] = [];

  for (const seg of filtered) {
    if (merged.length === 0) {
      merged.push({ ...seg });
      continue;
    }
    const last = merged[merged.length - 1];
    const gap = seg.startFrame - last.endFrame;
    const wouldBeLength = seg.endFrame - last.startFrame;
    if (gap < mergeGapFrames && wouldBeLength <= maxFrames) {
      last.endFrame = seg.endFrame;
    } else {
      merged.push({ ...seg });
    }
  }

  // Step 8: force-split segments exceeding maxSegmentDurationS
  // Use the longest internal silence as the split point (not midpoint)
  const finalRaw: RawSegment[] = [];
  for (const seg of merged) {
    let remaining = { ...seg };
    while (remaining.endFrame - remaining.startFrame > maxFrames) {
      const splitAt = findBestSplitInRange(
        isSilent,
        remaining.startFrame,
        remaining.endFrame,
        minSilenceFrames
      );
      // Avoid degenerate splits (split must leave at least minSegFrames on each side)
      const leftLen = splitAt - remaining.startFrame;
      const rightLen = remaining.endFrame - splitAt;
      if (leftLen < minSegFrames || rightLen < minSegFrames) {
        // Can't split cleanly — keep as-is to avoid zero-length segments
        break;
      }
      finalRaw.push({ startFrame: remaining.startFrame, endFrame: splitAt });
      remaining = { startFrame: splitAt, endFrame: remaining.endFrame };
    }
    finalRaw.push(remaining);
  }

  // Convert frame indices to time in seconds
  const frameDurationS = cfg.frameDurationMs / 1000;
  return finalRaw.map((seg, i) => {
    const start = seg.startFrame * frameDurationS;
    const end = seg.endFrame * frameDurationS;
    return {
      segmentIndex: i,
      audioHash,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      duration: Math.round((end - start) * 1000) / 1000,
    };
  });
}
