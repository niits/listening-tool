"use client";

import { useState, useCallback } from "react";
import { AudioSegment, TranscriptSegment } from "@/lib/types";
import {
  fetchAndDecodeAudio,
  audioBufferToMono,
  extractSegment,
} from "@/lib/audioLoader";
import { detectSilenceSegments } from "@/lib/silenceSplitter";
import { preparePCMForSTT } from "@/lib/pcmTools";
import { hashAudioUrl } from "@/lib/db";

export interface AudioProcessingState {
  isLoading: boolean;
  error: string | null;
  audioBuffer: AudioBuffer | null;
  pcmData: Float32Array | null;
  segments: AudioSegment[];
  progress: number;
  audioHash: string | null;
}

export function useAudioProcessing() {
  const [state, setState] = useState<AudioProcessingState>({
    isLoading: false,
    error: null,
    audioBuffer: null,
    pcmData: null,
    segments: [],
    progress: 0,
    audioHash: null,
  });

  /**
   * Process audio from URL
   */
  const processAudio = useCallback(async (url: string) => {
    // Always reset completely when processing new audio
    setState({
      isLoading: true,
      error: null,
      audioBuffer: null,
      pcmData: null,
      segments: [],
      progress: 0,
      audioHash: null,
    });

    try {
      // Generate audio hash
      const audioHash = hashAudioUrl(url);

      // Step 1: Fetch and decode audio
      setState((prev) => ({ ...prev, progress: 10, audioHash }));
      const audioBuffer = await fetchAndDecodeAudio(url);

      setState((prev) => ({ ...prev, progress: 30, audioBuffer }));

      // Step 2: Convert to mono PCM
      const pcmData = audioBufferToMono(audioBuffer);

      setState((prev) => ({ ...prev, progress: 50, pcmData }));

      // Step 3: Detect silence-based segments and add audioHash + segmentId
      const baseSegments = detectSilenceSegments(
        pcmData,
        audioBuffer.sampleRate
      );
      const segments = baseSegments.map((seg, index) => ({
        ...seg,
        audioHash,
        segmentId: `${audioHash}-${index}`,
      }));

      setState((prev) => ({
        ...prev,
        progress: 100,
        segments,
        isLoading: false,
      }));

      return { audioBuffer, pcmData, segments, audioHash };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      throw error;
    }
  }, []);

  /**
   * Extract PCM for a specific segment
   */
  const getSegmentPCM = useCallback(
    (
      segmentIndex: number,
      targetSampleRate: number = 16000
    ): Float32Array | null => {
      if (
        !state.pcmData ||
        !state.audioBuffer ||
        !state.segments[segmentIndex]
      ) {
        return null;
      }

      const segment = state.segments[segmentIndex];
      const segmentPCM = extractSegment(
        state.pcmData,
        state.audioBuffer.sampleRate,
        segment.start,
        segment.end
      );

      return preparePCMForSTT(
        segmentPCM,
        state.audioBuffer.sampleRate,
        targetSampleRate
      );
    },
    [state.pcmData, state.audioBuffer, state.segments]
  );

  /**
   * Reset state
   */
  const reset = useCallback(() => {
    setState({
      isLoading: false,
      error: null,
      audioBuffer: null,
      pcmData: null,
      segments: [],
      progress: 0,
      audioHash: null,
    });
  }, []);

  return {
    ...state,
    processAudio,
    getSegmentPCM,
    reset,
  };
}
