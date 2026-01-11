import type { Metadata } from "next";
import "./globals.css";
import { TranscriptionProvider } from "@/contexts/TranscriptionContext";
import { TranscriptionQueueSidebar } from "@/components/TranscriptionQueueSidebar";

export const metadata: Metadata = {
  title: "Listening Practice Tool",
  description: "Client-side audio transcription practice application",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <TranscriptionProvider>
          <div className="flex min-h-screen">
            {children}
            <TranscriptionQueueSidebar />
          </div>
        </TranscriptionProvider>
      </body>
    </html>
  );
}
