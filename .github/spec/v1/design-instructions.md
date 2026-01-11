# Listening Practice Tool - Copilot Instructions

## Project Overview

Single-page application for language learning through audio listening and dictation practice. Users add MP3 file URLs, which are automatically downloaded and transcribed using Whisper AI (runs locally in browser), then practice by listening and typing what they hear.

## Tech Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS
- **Database**: Dexie.js (IndexedDB wrapper)
- **AI/ML**: Transformer.js (Whisper model - runs in browser, no API needed)
- **Audio**: Web Audio API
- **Workers**: Web Workers for ML inference

## Project Structure

```
src/
├── components/
│   ├── home/              # Home screen components
│   │   ├── MP3Input.tsx
│   │   └── AudioFileList.tsx
│   ├── processing/        # Processing screen components
│   │   ├── ProcessingProgress.tsx
│   │   └── TranscriptionStatus.tsx
│   ├── practice/          # Practice mode components
│   │   ├── PracticeScreen.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── SegmentSidebar.tsx
│   │   ├── TypingArea.tsx
│   │   └── AnswerChecker.tsx
│   └── shared/            # Shared/common components
│       ├── Progress.tsx
│       └── Modal.tsx
├── services/
│   ├── db.ts              # Dexie database definition
│   └── audio.service.ts   # Audio processing utilities
├── workers/
│   └── transcriber.worker.js  # Whisper ML worker
├── types/
│   └── index.ts           # TypeScript interfaces
├── hooks/
│   ├── useTranscriber.ts  # Whisper transcription hook
│   └── useWorker.ts       # Web Worker hook
├── utils/
│   ├── textComparison.ts  # Answer checking algorithms
│   └── audioUtils.ts      # Audio format utilities
└── App.tsx
```

## Database Schema (Dexie)

```typescript
class ListeningToolDB extends Dexie {
  audioFiles!: Table<AudioFile>;
  transcriptions!: Table<Transcription>;
  sessions!: Table<PracticeSession>;

  constructor() {
    super("ListeningToolDB");
    this.version(1).stores({
      audioFiles: "++id, url, downloadStatus, transcriptionStatus, createdAt",
      transcriptions: "++id, audioFileId, createdAt",
      sessions: "++id, audioFileId, startedAt",
    });
  }
}
```

### Core Interfaces

```typescript
interface AudioFile {
  id?: number;
  url: string; // MP3 URL provided by user
  fileName: string; // Derived from URL (sanitized)
  duration?: number;
  downloadStatus: "pending" | "downloading" | "completed" | "failed";
  transcriptionStatus: "pending" | "processing" | "completed" | "failed";
  audioBlob?: Blob;
  audioBlobUrl?: string;
  transcriptionId?: number;
  createdAt: Date;
}

interface Transcription {
  id?: number;
  audioFileId: number;
  fullText: string;

  // Whisper returns chunks with word-level timestamps
  chunks: TranscriptionChunk[];

  // Grouped chunks into sentences for practice
  sentences: PracticeSentence[];

  language: string;
  createdAt: Date;
  modelUsed: string; // e.g., "Xenova/whisper-tiny"
  processingTime: number; // milliseconds
}

// Raw output from Whisper
interface TranscriptionChunk {
  text: string;
  timestamp: [number, number | null]; // [start, end] in seconds
}

// Sentences grouped for practice (from multiple chunks)
interface PracticeSentence {
  id: string;
  text: string;
  start: number;
  end: number;
  chunks: TranscriptionChunk[]; // Original chunks
}

interface PracticeSession {
  id?: number;
  audioFileId: number;
  transcriptionId: number;
  currentSentenceIndex: number;
  completedSentences: number[];
  attempts: SentenceAttempt[];
  startedAt: Date;
  completedAt?: Date;
}

interface SentenceAttempt {
  sentenceId: string;
  userInput: string;
  correctText: string;
  similarity: number; // 0-100
  isCorrect: boolean;
  timestamp: Date;
  playCount: number;
}
```

## Coding Conventions

### TypeScript

- Use strict mode
- Always define interfaces for props and state
- Use type inference where obvious
- Prefer `interface` over `type` for object shapes
- Use enums for fixed sets of values

### React

- Use functional components with hooks
- Use custom hooks for reusable logic
- Prefer composition over inheritance
- Keep components small and focused (< 200 lines)
- Use React.memo for expensive renders

### Naming

- Components: PascalCase (e.g., `AudioPlayer`)
- Hooks: camelCase with 'use' prefix (e.g., `useAudioProcessor`)
- Services: camelCase with 'Service' suffix (e.g., `rssService`)
- Constants: UPPER_SNAKE_CASE
- Interfaces: PascalCase with 'I' prefix optional

### File Organization

- One component per file
- Co-locate styles with components
- Group related components in folders
- Index files for clean imports

### Comments

- Use JSDoc for public functions
- Explain "why" not "what"
- Document complex algorithms
- Add TODO comments for future improvements

## Application Flow

### Screen 1: Home Screen

**Purpose**: Entry point for adding MP3 files and accessing cached audio

**UI Elements**:

- **MP3 Input Section** (top):
  - Text input field: "Enter MP3 file URL..."
  - "Go" button (primary action)
  - Validation error display (invalid URL format)
- **Cached Audio Files List** (below input):
  - Grid/list of audio file cards showing:
    - File name (extracted from URL)
    - URL (truncated)
    - Added date
    - **Status Badge** (color-coded):
      - **Gray "Not Started"**: Audio not yet downloaded/transcribed
      - **Yellow "Transcribing... X%"**: Active transcription with progress
      - **Green "Ready to Practice"**: Transcription complete
      - **Red "Error"**: Failed download/transcription
  - Click any card:
    - **Not Started** → Auto-download audio → Navigate to Processing Screen
    - **Transcribing** → Navigate to Processing Screen (show current progress)
    - **Ready** → Navigate to Practice Screen
    - **Error** → Show error modal with retry option

**Actions**:

- Enter MP3 URL + "Go" → Validate URL → Create AudioFile record → Navigate to Processing Screen
- Click cached audio → Check status → Navigate to appropriate screen

---

### Screen 2: Processing & Transcription

**Purpose**: Show real-time transcription progress (auto-started)

**UI Elements**:

**Phase 1 - Model Loading** (first time only):

- Modal/overlay showing:
  - "Loading Whisper Model..."
  - List of files being downloaded:
    - File name (e.g., "decoder_model_quantized.onnx")
    - Progress bar (0-100%)
    - File size progress (e.g., "45.2 MB / 60.5 MB")
  - Overall progress percentage
  - Dismissible background button (still processes in background)

**Phase 2 - Audio Download** (if not cached):

- Progress bar: "Downloading audio... X MB / Y MB"
- Audio format conversion indicator
- Save to IndexedDB when complete

**Phase 3 - Transcription** (automatic):

- **Live Transcription Display**:
  - Scrollable text area showing transcribed text as it streams
  - Auto-scroll to bottom as new chunks arrive
  - Word-by-word updates (streaming from Whisper worker)
  - Timestamps visible next to chunks
- **Progress Indicators**:
  - Overall progress bar (estimated %)
  - Current processing time elapsed
  - Estimated time remaining (based on audio length)
  - Status: "Transcribing segment 45/120..."
- **Segment Visualization** (horizontal timeline):
  - Timeline bar showing audio duration
  - Small vertical bars representing segments:
    - **Green**: Transcribed
    - **Yellow** (pulsing): Currently transcribing
    - **Gray**: Pending
  - Proportional widths (segment duration)
  - Multiple rows if needed for long audio
  - Bar height: 1/2 line height
  - Click segment → jump to that timestamp in preview

**Actions**:

- Automatic process flow:
  1. Download audio (if needed)
  2. Convert to 16kHz mono Float32Array
  3. Send to Whisper worker
  4. Stream transcription chunks → Update UI in real-time
  5. Group chunks into sentences
  6. Save transcription to IndexedDB
  7. **Auto-navigate to Screen 3** when 100% complete
- "Cancel" button → Stop worker, return to Screen 1
- "Run in Background" → Minimize to notification, return to Screen 1

**Data Flow**:

- Web Worker messages:
  - `initiate`, `progress`, `done`, `ready` → Model loading
  - `update` → Real-time transcription chunks → Update UI immediately
  - `complete` → Final transcription → Group into sentences → Save to DB → Navigate

---

### Screen 3: Practice Mode (Dictation)

**Purpose**: Listen and type what you hear, sentence by sentence

**Layout**: Two-column design

**Left Sidebar** (25% width):

- **Sentence List**:
  - Scrollable list of all sentences (virtualized for performance)
  - Each item shows:
    - Sentence number (#1, #2, #3...)
    - First 40 characters of text (truncated preview)
    - Status icon:
      - ✅ **Green checkmark**: Completed correctly
      - ❌ **Red X**: Attempted but incorrect
      - 🎯 **Blue highlight**: Currently active
      - ⚪ **Gray circle**: Not started
    - Accuracy percentage (if attempted): "85%"
  - Click any sentence → Jump to that sentence
  - Auto-scroll to keep current sentence visible

**Main Area** (75% width):

- **Audio Player** (top):
  - Play/Pause button (large, keyboard: Space)
  - Current sentence playback only (start → end timestamp)
  - Playback speed selector: 0.5x | 0.75x | **1x** | 1.25x | 1.5x
  - Waveform visualization (optional) showing current segment
  - Replay button (keyboard: Ctrl+R)
  - Progress bar for current sentence
- **Typing Area** (middle):
  - Large textarea input: "Type what you hear..."
  - Character count display
  - Auto-focus when sentence loads
  - Monospace font for clarity
  - Clear button (×)
- **Control Buttons** (below textarea):
  - **[◄ Previous Sentence]** (gray, keyboard: Ctrl+←)
  - **[Show Answer]** (yellow, reveals correct text)
  - **[Check Answer]** (blue, primary action, keyboard: Ctrl+Enter)
  - **[Next Sentence ►]** (gray, keyboard: Ctrl+→)
  - Button states: disabled if at first/last sentence

- **Result Display** (bottom, appears after checking):
  - **Your Answer** section:
    - Word-by-word comparison with color highlighting:
      - **Green background**: Correct word
      - **Red background**: Wrong word (shows user's version)
      - **Orange dashed underline**: Missing word (from correct answer)
      - **Gray strike-through**: Extra word (not in correct answer)
  - **Correct Answer** section:
    - Full correct text for reference
  - **Accuracy Score**:
    - Large percentage: "92% Correct"
    - Progress toward 100% (visual bar)
  - **Feedback Message**:
    - < 50%: "Keep practicing!"
    - 50-79%: "Good effort!"
    - 80-94%: "Great job!"
    - 95-99%: "Almost perfect!"
    - 100%: "🎉 Perfect! Well done!" (celebration animation)
  - **Try Again** button → Clear input, keep on same sentence

**Actions**:

- On sentence load:
  - Auto-play audio once
  - Focus textarea
  - Load saved attempt from localStorage (if exists)
- "Check Answer":
  - Normalize both texts (lowercase, trim, remove punctuation)
  - Tokenize into words
  - Run LCS algorithm for word matching
  - Calculate similarity score
  - Highlight differences
  - Save attempt to localStorage
  - If 100% → Auto-advance to next after 2 seconds
- "Show Answer":
  - Reveal correct text above textarea
  - Disable "Check Answer" button (already shown)
  - Allow copying for review
- "Previous/Next":
  - Save current attempt
  - Load new sentence
  - Scroll sidebar to keep visible
- Session complete (all sentences done):
  - Show summary modal:
    - Total accuracy
    - Time spent
    - Sentences completed
    - Best/worst performing sentences
  - "Practice Again" or "Return to Episodes"

**Data Flow**:

- On mount: Load transcription from IndexedDB
- Load progress from localStorage: `practice_progress_${episodeId}`
- Save after each attempt:
  ```js
  {
    episodeId: number,
    currentSentenceIndex: number,
    attempts: {
      sentenceId: string,
      userInput: string,
      similarity: number,
      timestamp: Date
    }[]
  }
  ```
- Real-time save (no "Save" button needed)

**Keyboard Shortcuts**:

- `Space`: Play/Pause
- `Ctrl+R`: Replay current sentence
- `Ctrl+→`: Next sentence
- `Ctrl+←`: Previous sentence
- `Ctrl+Enter`: Check answer
- `Esc`: Go back to episodes list

## Web Worker Pattern

### Main Thread → Worker Messages

```typescript
worker.postMessage({
  audio: Float32Array, // Audio data (16kHz mono)
  model: "Xenova/whisper-tiny", // Model to use
  multilingual: false,
  quantized: true,
  subtask: "transcribe", // or 'translate'
  language: "english", // or null for auto-detect
});
```

### Worker → Main Thread Messages

```typescript
// Model loading
{ status: 'initiate', file: string, progress: number, total: number }
{ status: 'progress', file: string, progress: number, total: number }
{ status: 'done', file: string }
{ status: 'ready' }

// Transcription
{ status: 'update', data: [text, { chunks }] }  // Real-time updates
{ status: 'complete', data: { text, chunks } }  // Final result
{ status: 'error', data: Error }
```

### Worker Implementation (Based on whisper-web)

```typescript
// workers/transcriber.worker.js
import { pipeline, env } from "@xenova/transformers";

env.allowLocalModels = false;

class AutomaticSpeechRecognitionPipeline {
  static task = "automatic-speech-recognition";
  static model = null;
  static quantized = null;
  static instance = null;

  static async getInstance(progress_callback = null) {
    if (this.instance === null) {
      this.instance = pipeline(this.task, this.model, {
        quantized: this.quantized,
        progress_callback,
        revision: this.model.includes("/whisper-medium")
          ? "no_attentions"
          : "main",
      });
    }
    return this.instance;
  }
}

self.addEventListener("message", async (event) => {
  const { audio, model, multilingual, quantized, subtask, language } =
    event.data;

  // Set model configuration
  const p = AutomaticSpeechRecognitionPipeline;
  let modelName = model;

  // Use .en version for English-only models
  if (!multilingual && !model.includes("distil-whisper")) {
    modelName += ".en";
  }

  // Reload model if changed
  if (p.model !== modelName || p.quantized !== quantized) {
    p.model = modelName;
    p.quantized = quantized;
    if (p.instance !== null) {
      (await p.getInstance()).dispose();
      p.instance = null;
    }
  }

  // Load model with progress callback
  const transcriber = await p.getInstance((data) => {
    self.postMessage(data);
  });

  // Transcription chunks for streaming updates
  let chunks_to_process = [{ tokens: [], finalised: false }];

  // Streaming callback for real-time updates
  function callback_function(item) {
    let last = chunks_to_process[chunks_to_process.length - 1];
    last.tokens = [...item[0].output_token_ids];

    let data = transcriber.tokenizer._decode_asr(chunks_to_process, {
      time_precision: time_precision,
      return_timestamps: true,
      force_full_sequences: false,
    });

    self.postMessage({
      status: "update",
      data: data,
    });
  }

  // Run transcription with streaming
  const output = await transcriber(audio, {
    top_k: 0,
    do_sample: false,
    chunk_length_s: model.includes("distil-whisper") ? 20 : 30,
    stride_length_s: model.includes("distil-whisper") ? 3 : 5,
    language: language,
    task: subtask,
    return_timestamps: true,
    force_full_sequences: false,
    callback_function: callback_function,
  });

  self.postMessage({
    status: "complete",
    data: output,
  });
});
```

## Audio Processing

### Download Audio

```typescript
const downloadAudio = async (url: string): Promise<Blob> => {
  const response = await fetch(url);
  const blob = await response.blob();
  return blob;
};
```

### Convert Audio to Whisper Format

```typescript
// Whisper requires: 16kHz sample rate, mono channel, Float32Array
const prepareAudioForWhisper = async (blob: Blob): Promise<Float32Array> => {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const arrayBuffer = await blob.arrayBuffer();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

  let audio: Float32Array;

  if (audioBuffer.numberOfChannels === 2) {
    // Convert stereo to mono
    const SCALING_FACTOR = Math.sqrt(2);
    const left = audioBuffer.getChannelData(0);
    const right = audioBuffer.getChannelData(1);

    audio = new Float32Array(left.length);
    for (let i = 0; i < left.length; i++) {
      audio[i] = (SCALING_FACTOR * (left[i] + right[i])) / 2;
    }
  } else {
    audio = audioBuffer.getChannelData(0);
  }

  return audio;
};
```

### Group Chunks into Sentences

```typescript
// Whisper returns word-level chunks, we need to group them into sentences
const groupChunksIntoSentences = (
  chunks: TranscriptionChunk[]
): PracticeSentence[] => {
  const sentences: PracticeSentence[] = [];
  let currentSentence: PracticeSentence = {
    id: "",
    text: "",
    start: 0,
    end: 0,
    chunks: [],
  };

  for (const chunk of chunks) {
    if (currentSentence.chunks.length === 0) {
      currentSentence.start = chunk.timestamp[0];
    }

    currentSentence.chunks.push(chunk);
    currentSentence.text += chunk.text;
    currentSentence.end = chunk.timestamp[1] ?? chunk.timestamp[0];

    // End sentence on punctuation or long pause
    const hasPunctuation = /[.!?]$/.test(chunk.text.trim());
    const nextChunk = chunks[chunks.indexOf(chunk) + 1];
    const longPause =
      nextChunk && nextChunk.timestamp[0] - chunk.timestamp[1]! > 0.5;

    if (hasPunctuation || longPause) {
      currentSentence.id = `sen-${sentences.length}`;
      sentences.push(currentSentence);
      currentSentence = { id: "", text: "", start: 0, end: 0, chunks: [] };
    }
  }

  // Add remaining chunks
  if (currentSentence.chunks.length > 0) {
    currentSentence.id = `sen-${sentences.length}`;
    sentences.push(currentSentence);
  }

  return sentences;
};
```

## Answer Checking Algorithm

Use **Longest Common Subsequence (LCS)** for accurate word-by-word comparison with support for extra words:

````typescript
interface WordComparison {
  word: string;
  status: 'correct' | 'wrong' | 'missing' | 'extra';
  index: number;
}

interface CheckResult {
  similarity: number;          // 0-100
  isCorrect: boolean;          // 100% match
  userWords: WordComparison[]; // User's input with status
  correctWords: WordComparison[]; // Expected answer with status
  feedback: string;            // Feedback message
}

const checkAnswer = (userInput: string, correctText: string): CheckResult => {
  // 1. Normalize: lowercase, remove punctuation, trim extra whitespace
  const normalize = (text: string) =>
    text.toLowerCase()
        .trim()
        .replace(/[.,!?;:'"""()[\]{}]/g, '') // Remove punctuation
        .replace(/\s+/g, ' ')                 // Collapse whitespace
        .replace(/\n/g, ' ');                 // Normalize line breaks

  // 2. Tokenize into words
  const userWords = normalize(userInput).split(' ').filter(w => w.length > 0);
  const correctWords = normalize(correctText).split(' ').filter(w => w.length > 0);

  // Edge case: empty input
  if (userWords.length === 0) {
    return {
      similarity: 0,
      isCorrect: false,
      userWords: [],
      correctWords: correctWords.map((word, i) => ({
        word, status: 'missing', index: i
      })),
      feedback: 'Please type your answer.'
    };
  }

  // 3. Calculate LCS (Longest Common Subsequence)
  const lcs = longestCommonSubsequence(userWords, correctWords);

  // 4. Calculate similarity based on correct words
  // Formula: (matched words / expected words) * 100
  const similarity = Math.round((lcs.length / correctWords.length) * 100);
  const isCorrect = similarity === 100 && userWords.length === correctWords.length;

  // 5. Build comparison arrays with status
  const lcsSet = new Set(lcs);
  let userComparison: WordComparison[] = [];
  let correctComparison: WordComparison[] = [];

  // Mark user words
  let userIdx = 0, correctIdx = 0;
  while (userIdx < userWords.length || correctIdx < correctWords.length) {
    const userWord = userWords[userIdx];
    const correctWord = correctWords[correctIdx];

    if (userWord === correctWord && lcsSet.has(userWord)) {
      // Matched word
      userComparison.push({ word: userWord, status: 'correct', index: userIdx });
      correctComparison.push({ word: correctWord, status: 'correct', index: correctIdx });
      userIdx++;
      correctIdx++;
    } else if (correctIdx < correctWords.length && !userWords.includes(correctWords[correctIdx])) {
      // Missing word (in correct but not in user)
      correctComparison.push({ word: correctWords[correctIdx], status: 'missing', index: correctIdx });
      correctIdx++;
  result: CheckResult; // From answer checking algorithm
}

// Component renders two sections:
// 1. Your Answer (userWords with status highlighting)
// 2. Correct Answer (correctWords with status highlighting)

// Word Highlighting Styles:
interface WordHighlightStyle {
  correct: {
    background: '#10B981',  // green-500
    color: '#FFFFFF',
    padding: '2px 4px',
    borderRadius: '3px'
  },
  wrong: {
    background: '#EF4444',  // red-500
    color: '#FFFFFF',
    padding: '2px 4px',
    borderRadius: '3px',
    textDecoration: 'underline wavy'
  },
  missing: {
    color: '#F59E0B',       // yellow-600
    textDecoration: 'underline dashed 2px',
    textUnderlineOffset: '3px',
    fontWeight: '500'
  },
  extra: {
    color: '#6B7280',       // gray-500
    textDecoration: 'line-through',
    opacity: '0.7'
  }
}

// Usage Example:
const AnswerComparison: React.FC<AnswerComparisonProps> = ({ result }) => {
  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      {/* Accuracy Score */}
      <div className="text-center">
        <div className="text-4xl font-bold text-blue-600">
          {result.similarity}%
        </div>
        <div className="text-sm text-gray-600 mt-1">
          {result.feedback}
        </div>
        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${result.similarity}%` }}
          />
        </div>
      </div>

      {/* Your Answer */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Your Answer:
        </h3>
        <div className="bg-white p-3 rounded border border-gray-200">
          {result.userWords.map((word, i) => (
            <span key={i} className={getWordClassName(word.status)}>
              {word.word}
            </span>
          )).reduce((acc, curr) => [acc, ' ', curr])}
        </div>
      </div>

      {/* Correct Answer */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-2">
          Correct Answer:
        </h3>
        <div className="bg-white p-3 rounded border border-gray-200">
          {result.correctWords.map((word, i) => (
            <span key={i} className={getWordClassName(word.status)}>
              {word.word}
            </span>
          )).reduce((acc, curr) => [acc, ' ', curr])}
        </div>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-gray-600">
        <span><span className="inline-block w-3 h-3 bg-green-500 rounded mr-1" />Correct</span>
        <span><span className="inline-block w-3 h-3 bg-red-500 rounded mr-1" />Wrong</span>
        <span><span className="text-yellow-600">━━</span> Missing</span>
        <span><span className="line-through text-gray-500">Extra</span></span>
      </div>
    </div> Display
```typescript
// Real-time display of transcription progress with multiple views

interface TranscriptionProgressProps {
  status: 'idle' | 'loading-model' | 'downloading-audio' | 'transcribing' | 'complete' | 'error';
  progress: number;        // 0-100
  currentText: string;     // Accumulated transcription text
  chunks: TranscriptionChunk[];
  totalDuration?: number;  // Audio duration in seconds
  elapsedTime: number;     // Processing time in seconds
  modelFiles?: ModelLoadProgress[]; // For model loading phase
  error?: string;
}

interface ModelLoadProgress {
  file: string;
  progress: number;  // 0-100
  loaded: number;    // bytes loaded
  total: number;     // total bytes
}

// Component with multiple phases:
const TranscriptionProgress: React.FC<TranscriptionProgressProps> = (props) => {
  return (
    <div className="max-w-4xl mx-auto p-6">
      {/* Phase 1: Model Loading (first time only) */}
      {props.status === 'loading-model' && (
        <div className="space-y-4">
          <h2 className="text-xl font-semibold">Loading Whisper Model...</h2>
          <p className="text-gray-600">This only happens once. Files will be cached for future use.</p>
          {props.modelFiles?.map(file => (
            <div key={file.file} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className="font-mono text-xs truncate">{file.file}</span>
                <span>{file.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${file.progress}%` }}
                />
              </div>
              <div className="text-xs text-gray-500">
                {formatBytes(file.loaded)} / {formatBytes(file.total)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Phase 2: Audio Download */}
      {props.status === 'downloading-audio' && (
        <div>
          <h2 className="text-xl font-semibold">Downloading Audio...</h2>
          <div className="mt-4">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-blue-600 h-3 rounded-full transition-all"
                style={{ width: `${props.progress}%` }}
              />
            </div>
            <p className="text-sm text-gray-600 mt-2">{props.progress}%</p>
          </div>
        </div>
      )}

      {/* Phase 3: Transcription */}
      {props.status === 'transcribing' && (
        <div className="space-y-6">
          {/* Header with progress */}
          <div>
            <h2 className="text-xl font-semibold">Transcribing Audio...</h2>
            <div className="flex justify-between text-sm text-gray-600 mt-2">
              <span>Progress: {props.progress}%</span>
              <span>Time: {formatDuration(props.elapsedTime)}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3 mt-2">
              <div
                className="bg-green-600 h-3 rounded-full transition-all"
                style={{ width: `${props.progress}%` }}
              />
            </div>
          </div>

          {/* Segment Timeline Visualization */}
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3">Segments</h3>
            <SegmentTimeline
              chunks={props.chunks}
              totalDuration={props.totalDuration}
            />
          </div>

          {/* Live Transcription Text */}
          <div className="bg-white border border-gray-200 rounded-lg p-4 max-h-96 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-3">Live Transcription</h3>
            <div className="text-gray-800 whitespace-pre-wrap font-mono text-sm leading-relaxed">
              {props.currentText}
              <span className="inline-block w-2 h-4 bg-blue-600 animate-pulse ml-1" />
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
              Run in Background
            </button>
            <button className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Complete - Auto-navigate after showing this */}
      {props.status === 'complete' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-2xl font-semibold text-green-600">
            Transcription Complete!
          </h2>
          <p className="text-gray-600 mt-2">
            Redirecting to practice mode...
          </p>
        </div>
      )}

      {/* Error */}
      {props.status === 'error' && (
        <div className="text-center py-8">
          <div className="text-6xl mb-4">❌</div>
          <h2 className="text-2xl font-semibold text-red-600">
            Transcription Failed
          </h2>
          <p className="text-gray-600 mt-2">{props.error}</p>
          <button className="mt-4 px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
            Retry
          </button>
        </div>
      )}
    </div>
  );
};

// Segment Timeline Component
interface SegmentTimelineProps {
  chunks: TranscriptionChunk[];
  totalDuration?: number;
}

const SegmentTimeline: React.FC<SegmentTimelineProps> = ({ chunks, totalDuration }) => {
  // Group chunks into rows (max width per row)
  const rowWidth = 800; // pixels
  const rows: TranscriptionChunk[][] = [];
  let currentRow: TranscriptionChunk[] = [];
  let currentRowWidth = 0;

  chunks.forEach(chunk => {
    const duration = (chunk.timestamp[1] ?? chunk.timestamp[0]) - chunk.timestamp[0];
    const width = (duration / (totalDuration || 100)) * rowWidth;

    if (currentRowWidth + width > rowWidth && currentRow.length > 0) {
      rows.push(currentRow);
      currentRow = [];
      currentRowWidth = 0;
    }

    currentRow.push(chunk);
    currentRowWidth += width;
  });

  if (currentRow.length > 0) {
    rows.push(currentRow);
  }

  return (
    <div className="space-y-1">
      {rows.map((row, rowIdx) => (
        <div key={rowIdx} className="flex gap-0.5" style={{ height: '12px' }}>
          {row.map((chunk, chunkIdx) => {
            const duration = (chunk.timestamp[1] ?? chunk.timestamp[0]) - chunk.timestamp[0];
            const width = (duration / (totalDuration || 100)) * 100; // percentage
            const isComplete = chunk.timestamp[1] !== null;

            return (
              <div
                key={chunkIdx}
                className={`rounded-sm transition-all ${
                  isComplete ? 'bg-green-500' : 'bg-yellow-400 animate-pulse'
                }`}
                style={{
                  width: `${width}%`,
                  height: '100%',
                  minWidth: '2px'
                }}
                title={`${chunk.timestamp[0].toFixed(1)}s - ${chunk.timestamp[1]?.toFixed(1) || '...'}s`}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
};

// Update UI on every 'update' message from worker
// Show live transcription as it processes
// Auto-scroll to bottom of text area
// Segment timeline updates in real-time
  if (similarity === 100 && isCorrect) {
    feedback = '🎉 Perfect! Well done!';
  } else if (similarity >= 95) {
    feedback = 'Almost perfect! Just a small mistake.';
  } else if (similarity >= 80) {
    feedback = 'Great job! A few minor errors.';
  } else if (similarity >= 50) {
    feedback = 'Good effort! Keep practicing.';
  } else {
    feedback = 'Keep trying! Listen carefully.';
  }

  return {
    similarity,
    isCorrect,
    userWords: userComparison,
    correctWords: correctComparison,
    feedback
  };
};

// Helper: Calculate Longest Common Subsequence
const longestCommonSubsequence = (arr1: string[], arr2: string[]): string[] => {
  const m = arr1.length;
  const n = arr2.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  // Fill DP table
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (arr1[i - 1] === arr2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find LCS
  const lcs: string[] = [];
  let i = m, j = n;
  whiAuto-start transcription** immediately when episode is clicked (if not already transcribed)
4. **Whisper handles segmentation** - no separate segmentation step needed
5. **Normalize text** before comparison (lowercase, remove punctuation)
6. **Cache everything** in IndexedDB for offline support:
   - Audio files (as Blob)
   - Transcription results
   - RSS feed data
   - Practice session progress (localStorage)
7. **Auto-navigate** to practice screen when transcription completes
8. **Save progress** after each answer check to localStorage
9. **Use Transformer.js locally** - no API key needed, runs entirely in browser
10. **Streaming transcription** - show live text updates as Whisper processes
11. **CORS proxy** may be needed for RSS feeds in development (use `https://api.allorigins.win/raw?url=`)
12. **Storage quota management**:
    - Check quota before saving large files
    - Warn user at 80% capacity
    - Auto-cleanup oldest episodes at 90%
    - Allow manual cache clearing
13. **Answer checking includes 4 states**: correct (green), wrong (red), missing (dashed underline), extra (strike-through)
14. **Model loading is one-time** - first transcription downloads ~40-250MB model files, subsequent uses are instant
15. **Segment timeline visualization** - proportional widths, multiple rows for long audio, real-time color updat
      j--;
    }
  }

  return lcs;
};
````

## UI Components Guidelines

### Progress Display (Model Loading)

```typescript
interface ProgressItemProps {
  file: string;       // e.g., "onnx/decoder_model_merged_quantized.onnx"
  progress: number;    (Practice Mode)
- `Space`: Play/Pause audio
- `Ctrl+R`: Replay current sentence
- `Ctrl+→`: Next sentence
- `Ctrl+←`: Previous sentence
- `Ctrl+Enter`: Check answer
- `Esc`: Return to episodes list

### Status Icons & Colors
**Episode Status Badges**:
- 🔵 **Gray "Not Started"**: Not downloaded/transcribed yet
- 🟡 **Yellow "Transcribing... X%"**: In progress with percentage
- 🟢 **Green "Ready to Practice"**: Transcription complete
- 🔴 **Red "Error"**: Failed process

**Practice Sentence Status**:
- ✅ **Green checkmark**: Completed correctly (100%)
- ❌ **Red X**: Attempted but incorrect (< 100%)
- 🎯 **Blue highlight**: Currently active sentence
- ⚪ **Gray circle**: Not started yet

**Transcription Segments** (timeline bars):
- 🟢 **Green**: Segment transcribed
- 🟡 **Yellow (pulsing)**: Currently transcribing
- ⚫ **Gray**: Pending transcription

**Answer Highlighting**:
- 🟢 **Green background**: Correct word
- 🔴 **Red background**: Wrong word
- 🟠 **Orange dashed underline**: Missing word
- ⚫ **Gray strike-through**: Extra word TranscriptionChunk[];
}

// Update UI on every 'update' message from worker
// Show live transcription as it processes
// Scroll to bottom automatically
```

### Audio Player

```typescript
// Sentence-level audio playback
interface AudioPlayerProps {
  audioUrl: string;
  currentSentence: { start: number; end: number };
  onSegmentEnd?: () => void;
}

// Features:
// - Play/pause current sentence only
// - Playback speed: 0.5x, 0.75x, 1x, 1.25x, 1.5x
// - Previous/Next sentence navigation
// - Keyboard shortcuts (Space, Ctrl+Arrow)
```

### Answer Comparison Display

```typescript
// Show user answer vs correct answer with highlights
interface AnswerComparisonProps {
  userAnswer: string;
  correctAnswer: string;
  similarity: number;
}

// Highlighting:
// - Correct words: green (#10B981)
// - Wrong words: red (#EF4444)
// - Missing words: underline dashed (#F59E0B)
// - Extra words: strike-through (#6B7280)
```

## Styling Guidelines

### TailwindCSS

- Use utility classes
- Create custom components for repeated patterns
- Use semantic color names from design system

### Colors

```css
/* Status Colors */
--success: #10b981 (green-500) --warning: #f59e0b (yellow-500) --error: #ef4444
  (red-500) --info: #3b82f6 (blue-500) /* Text */ --text-primary: #111827
  (gray-900) --text-secondary: #6b7280 (gray-500) /* Background */
  --bg-primary: #ffffff (white) --bg-secondary: #f9fafb (gray-50) /* Borders */
  --border: #e5e7eb (gray-200);
```

### Animations

```css
/* Loading spinner */
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* Smooth transitions */
transition: all 0.3s ease;
```

## Performance Best Practices

### IndexedDB

- Use transactions for multiple operations
- Index frequently queried fields
- Batch read/write operations
- Clear old cache when quota exceeds 80%

### Audio

- Revoke blob URLs when done
- Clear AudioContext buffers after processing
- Limit concurrent transcriptions to 1

### React

- Use `React.memo` for heavy components
- Virtualize long lists (react-window)
- Debounce input handlers (300ms)
- Lazy load Web Worker

### Web Worker

- Offload heavy processing (transcription)
- Send progress updates via streaming callback
- Dispose pipeline when changing models
- Terminate worker when done

## Error Handling

### Network Errors

```typescript
try {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
} catch (error) {
  // Show user-friendly error
  // Offer retry option
  // Log for debugging
}
```

### Storage Errors

```typescript
// Check quota before saving
const estimate = await navigator.storage.estimate();
if (estimate.usage / estimate.quota > 0.8) {
  // Warn user
  // Offer to clear old cache
}
```

### Validation

- Validate RSS URL format
- Check audio file format
- Verify transcription results
- Sanitize user inputs

## Testing Strategy

### Unit Tests

- Test utility functions (textComparison, audioUtils)
- Test services (mock API responses)
- Test hooks (React Testing Library)

### Integration Tests

- Test complete user flows
- Test Web Worker communication
- Test IndexedDB operations

### Manual Testing

- Test with various RSS feeds
- Test with different audio formats
- Test on different browsers
- Test storage quota scenarios

## Environment Variables

```env
# No environment variables needed - everything runs locally!
# Models are downloaded from Hugging Face CDN automatically
```

## Common Patterns

### Loading States

```typescript
const [isLoading, setIsLoading] = useState(false);
const [error, setError] = useState<string | null>(null);

try {
  setIsLoading(true);
  setError(null);
  await doSomething();
} catch (err) {
  setError(err.message);
} finally {
  setIsLoading(false);
}
```

### Dexie Operations

```typescript
// Add
await db.episodes.add(episode);

// Get
const episode = await db.episodes.get(id);

// Update
await db.episodes.update(id, { status: "completed" });

// Query
const episodes = await db.episodes.where("feedId").equals(feedId).toArray();

// Delete
await db.episodes.delete(id);
```

### LocalStorage (Practice Progress)

```typescript
// Save progress
const saveProgress = (episodeId: number, progress: any) => {
  localStorage.setItem(`practice_${episodeId}`, JSON.stringify(progress));
};

// Load progress
const loadProgress = (episodeId: number) => {
  const saved = localStorage.getItem(`practice_${episodeId}`);
  return saved ? JSON.parse(saved) : null;
};
```

## Accessibility

- Use semantic HTML
- Add ARIA labels to controls
- Support keyboard navigation
- Announce status changes to screen readers
- Ensure color contrast ratios (WCAG AA)

## Browser Compatibility

- Target: Modern browsers (Chrome, Firefox, Safari, Edge)
- Required APIs:
  - IndexedDB
  - Web Audio API
  - Web Workers
  - Fetch API
  - Storage API

## Future Enhancements

- Multiple language support
- Vocabulary extraction
- Spaced repetition system
- Cloud sync
- Speech recognition for speaking practice
- PWA support with offline mode
- Export practice history

## Important Notes

1. **Always use Web Worker** for audio processing to avoid blocking UI
2. **Real-time UI updates** during transcription using worker messages
3. **Normalize text** before comparison (lowercase, remove punctuation)
4. **Cache everything** in IndexedDB for offline support
5. **Auto-navigate** to practice screen when transcription completes
6. **Save progress** after each answer check
7. **Use Transformer.js locally** - no API key needed, runs in browser
8. **CORS proxy** may be needed for RSS feeds in development
9. **Storage quota management** - warn at 80%, auto-cleanup at 90%
10. **Streaming transcription** - show live text updates as Whisper processes

## Model Configuration

### Recommended Models

- **whisper-tiny**: Fast, ~40MB, good for testing
- **whisper-base**: Balanced, ~75MB, recommended for production
- **whisper-small**: Better accuracy, ~250MB, for advanced users

### Model Settings

```typescript
// Use quantized models for better performance
quantized: true,

// Chunk settings for long audio
chunk_length_s: 30,
stride_length_s: 5,

// Language detection
language: 'english',  // or null for auto-detect
task: 'transcribe',   // or 'translate'

// Enable word-level timestamps
return_timestamps: true,
```

## Quick Reference

### Keyboard Shortcuts

- `Space`: Play/Pause audio
- `Ctrl+R`: Replay current segment
- `Ctrl+→`: Next segment
- `Ctrl+←`: Previous segment
- `Ctrl+Enter`: Check answer
- `Esc`: Go back/close modal

### Status Icons

- ✅ Completed
- 🎯 Current/Active
- ⚪ Pending
- 🟢 Transcribed
- 🟡 Processing
- ⚙️ Working
- ❌ Error

### File Naming

- Components: `AudioPlayer.tsx`
- Services: `rss.service.ts`
- Hooks: `useAudioProcessor.ts`
- Types: `index.ts` or `types.ts`
- Utils: `textComparison.ts`

---

When implementing features:

1. Check these instructions first
2. Follow the established patterns
3. Maintain type safety
4. Test with real data
5. Optimize for performance
6. Handle errors gracefully
