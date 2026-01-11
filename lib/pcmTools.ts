/**
 * Resample PCM audio data to a target sample rate
 * Uses linear interpolation for quality
 */
export function resamplePCM(
  pcmData: Float32Array,
  originalRate: number,
  targetRate: number
): Float32Array {
  if (originalRate === targetRate) {
    return pcmData;
  }

  const ratio = originalRate / targetRate;
  const newLength = Math.floor(pcmData.length / ratio);
  const result = new Float32Array(newLength);
  const lastIndex = pcmData.length - 1;

  for (let i = 0; i < newLength; i++) {
    const position = i * ratio;
    const index = Math.floor(position);
    const fraction = position - index;

    if (index < lastIndex) {
      // Linear interpolation
      result[i] =
        pcmData[index] * (1 - fraction) + pcmData[index + 1] * fraction;
    } else {
      result[i] = pcmData[Math.min(index, lastIndex)];
    }
  }

  return result;
}

/**
 * Convert Float32Array PCM to Int16Array (for compatibility with some STT models)
 * Optimized with direct clamping
 */
export function float32ToInt16(float32Array: Float32Array): Int16Array {
  const int16Array = new Int16Array(float32Array.length);

  for (let i = 0; i < float32Array.length; i++) {
    // Clamp to [-1, 1] and scale to int16 range
    const clamped = Math.max(-1, Math.min(1, float32Array[i]));
    int16Array[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }

  return int16Array;
}

/**
 * Prepare PCM segment for STT model
 * Resamples to target rate and returns Float32Array
 */
export function preparePCMForSTT(
  pcmData: Float32Array,
  originalRate: number,
  targetRate: number = 16000
): Float32Array {
  return resamplePCM(pcmData, originalRate, targetRate);
}
