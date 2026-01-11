/**
 * Fetch and decode audio file from URL using Web Audio API
 */
export async function fetchAndDecodeAudio(url: string): Promise<AudioBuffer> {
  // Fetch audio file client-side only
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();

  // Decode audio using AudioContext
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  return audioBuffer;
}

/**
 * Convert AudioBuffer to mono Float32Array PCM
 * Optimized to minimize memory allocations and operations
 */
export function audioBufferToMono(audioBuffer: AudioBuffer): Float32Array {
  if (audioBuffer.numberOfChannels === 1) {
    return audioBuffer.getChannelData(0);
  }

  // Mix down to mono by averaging all channels
  const length = audioBuffer.length;
  const mono = new Float32Array(length);
  const numberOfChannels = audioBuffer.numberOfChannels;
  const channelDataArray: Float32Array[] = [];

  // Cache channel data to avoid repeated getChannelData calls
  for (let channel = 0; channel < numberOfChannels; channel++) {
    channelDataArray.push(audioBuffer.getChannelData(channel));
  }

  // Mix channels
  const divisor = 1 / numberOfChannels;
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (let channel = 0; channel < numberOfChannels; channel++) {
      sum += channelDataArray[channel][i];
    }
    mono[i] = sum * divisor;
  }

  return mono;
}

/**
 * Extract PCM data for a specific time segment
 */
export function extractSegment(
  pcmData: Float32Array,
  sampleRate: number,
  startTime: number,
  endTime: number
): Float32Array {
  const startSample = Math.floor(startTime * sampleRate);
  const endSample = Math.floor(endTime * sampleRate);
  return pcmData.slice(startSample, endSample);
}
