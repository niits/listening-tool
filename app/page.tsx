"use client";

import { useRouter } from "next/navigation";
import { AudioUrlForm } from "@/components/AudioUrlForm";
import { CachedAudioList } from "@/components/CachedAudioList";

export default function HomePage() {
  const router = useRouter();

  const handleSubmit = (url: string) => {
    // Encode URL to pass as query parameter
    const encodedUrl = encodeURIComponent(url);
    router.push(`/processing?url=${encodedUrl}`);
  };

  return (
    <div className="flex-1 min-h-screen flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-4xl space-y-8">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-gray-900">
            Listening Practice Tool
          </h1>
          <p className="text-lg text-gray-600">
            Practice your listening skills with AI-powered transcription
          </p>
          <p className="text-sm text-gray-500">
            All processing happens in your browser. No data is sent to any
            server.
          </p>
        </div>

        <div className="flex justify-center">
          <AudioUrlForm onSubmit={handleSubmit} />
        </div>

        {/* Cached Audio List */}
        <div className="mt-12">
          <CachedAudioList />
        </div>

        <div className="mt-12 p-6 bg-gray-100 rounded-lg">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">
            How it works
          </h2>
          <ol className="space-y-3 text-gray-700">
            <li className="flex gap-3">
              <span className="font-bold text-blue-600">1.</span>
              <span>Provide a URL to an audio file (MP3, WAV, etc.)</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600">2.</span>
              <span>The audio is downloaded and analyzed in your browser</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600">3.</span>
              <span>Segments are automatically detected based on silence</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600">4.</span>
              <span>Each segment is transcribed using Whisper AI</span>
            </li>
            <li className="flex gap-3">
              <span className="font-bold text-blue-600">5.</span>
              <span>
                Practice by typing what you hear and get instant feedback
              </span>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}
