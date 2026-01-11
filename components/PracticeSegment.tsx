"use client";

import { useState, useCallback } from "react";
import { ComparisonResult } from "@/lib/types";
import { compareTranscripts } from "@/lib/scoring";

interface PracticeSegmentProps {
  segmentIndex: number;
  startTime: number;
  endTime: number;
  referenceTranscript: string;
  audioElement: HTMLAudioElement | null;
  onComplete: (userInput: string, score: number) => void;
  disabled?: boolean;
}

export function PracticeSegment({
  segmentIndex,
  startTime,
  endTime,
  referenceTranscript,
  audioElement,
  onComplete,
  disabled = false,
}: PracticeSegmentProps) {
  const [userInput, setUserInput] = useState("");
  const [showResult, setShowResult] = useState(false);
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const formatTime = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const playSegment = useCallback(() => {
    if (!audioElement) return;

    audioElement.currentTime = startTime;
    audioElement.play();
    setIsPlaying(true);

    const stopAtEnd = () => {
      if (audioElement.currentTime >= endTime) {
        audioElement.pause();
        setIsPlaying(false);
        audioElement.removeEventListener("timeupdate", stopAtEnd);
      }
    };

    audioElement.addEventListener("timeupdate", stopAtEnd);
  }, [audioElement, startTime, endTime]);

  const handleSubmit = useCallback(() => {
    const result = compareTranscripts(referenceTranscript, userInput);
    setComparison(result);
    setShowResult(true);
    onComplete(userInput, result.score);
  }, [referenceTranscript, userInput, onComplete]);

  const handleTryAgain = useCallback(() => {
    setUserInput("");
    setShowResult(false);
    setComparison(null);
  }, []);

  const renderTokenComparison = () => {
    if (!comparison) return null;

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <div className="text-3xl font-bold text-gray-800">
            {Math.round(comparison.score * 100)}%
          </div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 transition-all duration-500"
                style={{ width: `${comparison.score * 100}%` }}
              />
            </div>
          </div>
        </div>

        {comparison.correctTokens.length > 0 && (
          <div>
            <h4 className="font-medium text-green-700 mb-2">Correct</h4>
            <div className="flex flex-wrap gap-2">
              {comparison.correctTokens.map((token, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-green-100 text-green-800 rounded"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        )}

        {comparison.incorrectTokens.length > 0 && (
          <div>
            <h4 className="font-medium text-red-700 mb-2">Incorrect</h4>
            <div className="flex flex-wrap gap-2">
              {comparison.incorrectTokens.map((token, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-red-100 text-red-800 rounded line-through"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        )}

        {comparison.missingTokens.length > 0 && (
          <div>
            <h4 className="font-medium text-orange-700 mb-2">Missing</h4>
            <div className="flex flex-wrap gap-2">
              {comparison.missingTokens.map((token, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-orange-100 text-orange-800 rounded"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        )}

        {comparison.extraTokens.length > 0 && (
          <div>
            <h4 className="font-medium text-purple-700 mb-2">Extra</h4>
            <div className="flex flex-wrap gap-2">
              {comparison.extraTokens.map((token, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-purple-100 text-purple-800 rounded"
                >
                  {token}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-gray-200">
          <h4 className="font-medium text-gray-700 mb-2">Reference</h4>
          <p className="text-gray-600 italic">{referenceTranscript}</p>
        </div>
      </div>
    );
  };

  return (
    <div className="w-full max-w-4xl p-6 bg-white rounded-lg shadow-md border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">
          Segment {segmentIndex + 1}
        </h3>
        <span className="text-sm text-gray-600">
          {formatTime(startTime)} – {formatTime(endTime)}
        </span>
      </div>

      <div className="mb-4">
        <button
          onClick={playSegment}
          disabled={!audioElement || disabled}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
        >
          {isPlaying ? "▶ Playing..." : "▶ Play Segment"}
        </button>
      </div>

      {!showResult ? (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Type what you hear:
            </label>
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
              rows={3}
              placeholder="Type your transcription here..."
              disabled={disabled}
            />
          </div>
          <button
            onClick={handleSubmit}
            disabled={!userInput.trim() || disabled}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            Check Answer
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {renderTokenComparison()}
          <button
            onClick={handleTryAgain}
            className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}
