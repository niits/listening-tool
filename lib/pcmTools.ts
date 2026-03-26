/**
 * PCM audio utility functions.
 *
 * These operate on raw Float32Array samples (values in [-1, 1]).
 * All functions are pure — no side effects.
 */

/**
 * Resample a PCM buffer from srcRate to targetRate using linear interpolation.
 *
 * @param pcm        Mono Float32Array of samples
 * @param srcRate    Original sample rate (Hz)
 * @param targetRate Desired sample rate (Hz). Whisper requires 16000.
 * @returns          New Float32Array at targetRate
 */
export function resample(
  pcm: Float32Array,
  srcRate: number,
  targetRate: number
): Float32Array {
  if (srcRate === targetRate) return pcm;

  const ratio = srcRate / targetRate;
  const outLength = Math.floor(pcm.length / ratio);
  const out = new Float32Array(outLength);

  for (let i = 0; i < outLength; i++) {
    const srcPos = i * ratio;
    const lo = Math.floor(srcPos);
    const hi = Math.min(lo + 1, pcm.length - 1);
    const frac = srcPos - lo;
    out[i] = pcm[lo] * (1 - frac) + pcm[hi] * frac;
  }

  return out;
}

/**
 * Extract a sub-slice of a PCM buffer by time range.
 *
 * @param pcm        Full mono PCM buffer
 * @param sampleRate Sample rate of the buffer (Hz)
 * @param startSec   Start time in seconds (inclusive)
 * @param endSec     End time in seconds (exclusive)
 * @returns          New Float32Array containing only the requested range
 */
export function slicePcm(
  pcm: Float32Array,
  sampleRate: number,
  startSec: number,
  endSec: number
): Float32Array {
  const startSample = Math.floor(startSec * sampleRate);
  const endSample = Math.min(Math.ceil(endSec * sampleRate), pcm.length);
  return pcm.slice(startSample, endSample);
}

/**
 * Mix a stereo (or multi-channel) AudioBuffer down to mono by averaging channels.
 *
 * @param buffer AudioBuffer from Web Audio API
 * @returns Mono Float32Array
 */
export function mixDownToMono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) {
    return buffer.getChannelData(0);
  }

  const length = buffer.length;
  const mono = new Float32Array(length);
  const channelCount = buffer.numberOfChannels;

  for (let ch = 0; ch < channelCount; ch++) {
    const channel = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      mono[i] += channel[i];
    }
  }

  for (let i = 0; i < length; i++) {
    mono[i] /= channelCount;
  }

  return mono;
}
