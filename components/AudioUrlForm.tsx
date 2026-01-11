"use client";

import { useState, FormEvent } from "react";

interface AudioUrlFormProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export function AudioUrlForm({
  onSubmit,
  isLoading = false,
}: AudioUrlFormProps) {
  const [url, setUrl] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl">
      <div className="flex flex-col gap-4">
        <label
          htmlFor="audio-url"
          className="text-lg font-medium text-gray-700"
        >
          Audio File URL
        </label>
        <div className="flex gap-2">
          <input
            id="audio-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com/audio.mp3"
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
            required
          />
          <button
            type="submit"
            disabled={isLoading || !url.trim()}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "Processing..." : "Process Audio"}
          </button>
        </div>
      </div>
    </form>
  );
}
