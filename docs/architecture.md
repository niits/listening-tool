# Technical Architecture

## Overview

Listening Practice Tool is a pure client-side Next.js application. All audio processing, AI transcription, and data storage happen in the browser. No data is sent to any server.

## Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 15 (App Router) | Static export for Cloudflare Workers |
| UI | React 18 + Tailwind CSS v3 | Functional components, no class components |
| Transcription | @xenova/transformers (Whisper) | Runs in Web Worker via WASM |
| Storage | Dexie 4 (IndexedDB wrapper) | Transcripts, sessions, audio metadata |
| Audio | Web Audio API | Decode, convert, segment audio |
| Workers | Web Workers API | Offload ML inference from main thread |
| Package Manager | yarn 4 | Configured in `.yarnrc.yml` |
| Deployment | Cloudflare Workers (Pages) | Static site + bundled model files |

## System Architecture Diagram

```
Browser (Client-side only)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  Next.js App (Main Thread)                              │
│  ┌────────────┐  ┌──────────────┐  ┌────────────────┐  │
│  │  /app      │  │  /components │  │  /contexts     │  │
│  │  pages     │  │  UI layer    │  │  Transcription │  │
│  └─────┬──────┘  └──────┬───────┘  │  Context       │  │
│        │                │          └───────┬────────┘  │
│        └────────────────┴──────────────────┤           │
│                                            ▼           │
│  ┌─────────────────────────────────────────────────┐   │
│  │  /hooks                                         │   │
│  │  useAudioProcessing     useTranscriptionWorker  │   │
│  └──────────┬──────────────────────┬───────────────┘   │
│             │                      │                   │
│             ▼                      ▼                   │
│  ┌──────────────────┐   ┌──────────────────────────┐   │
│  │  /lib            │   │  Web Worker              │   │
│  │  audioLoader     │   │  /workers/stt-worker.ts  │   │
│  │  silenceSplitter │   │  @xenova/transformers    │   │
│  │  pcmTools        │   │  Whisper WASM pipeline   │   │
│  │  scoring         │   └──────────────────────────┘   │
│  │  db (Dexie)      │                                   │
│  │  audioCache      │                                   │
│  │  transcriptionCache                                  │
│  └──────────────────┘                                   │
│             │                                           │
│             ▼                                           │
│  ┌──────────────────┐                                   │
│  │  IndexedDB       │  localStorage (practice progress) │
│  │  (Dexie)         │                                   │
│  └──────────────────┘                                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
         │ fetch (audio URL only)
         ▼
    External Audio Server (user-provided URL)
```

## Processing Pipeline

### Phase 1: Audio Ingestion

```
User URL → audioLoader.ts → Web Audio API
         → AudioBuffer (stereo, original sample rate)
         → pcmTools.ts → mono Float32Array
```

### Phase 2: Silence-Based Segmentation

```
Float32Array → silenceSplitter.ts
             → Frame analysis (30ms frames)
             → RMS calculation per frame
             → dB conversion: 20 * log10(RMS)
             → Mark frames below -40dB as silence
             → Find continuous silence regions (min 400ms)
             → Extract audio segments between silence (min 500ms)
             → Resample each segment to 16kHz (for Whisper)
```

**Configuration in `lib/silenceSplitter.ts`:**

| Parameter | Default | Description |
|---|---|---|
| `frameDuration` | 30ms | Analysis frame length |
| `silenceThreshold` | -40dB | Minimum dB to be considered speech |
| `minSilenceDuration` | 400ms | Minimum silence gap to split |
| `minSegmentDuration` | 500ms | Minimum segment length to keep |

### Phase 3: Transcription (Web Worker)

```
Float32Array (16kHz) → Web Worker message
                     → stt-worker.ts
                     → @xenova/transformers pipeline
                     → Whisper WASM inference
                     → Streaming chunk callbacks → UI updates
                     → Final: { text, chunks: [{text, timestamp}] }
```

### Phase 4: Storage

```
Transcription result → transcriptionCache.ts → IndexedDB
Practice attempt     → localStorage (keyed by audioFileId)
Session data         → IndexedDB (Dexie sessions table)
```

### Phase 5: Practice

```
IndexedDB transcript → PracticeSegment component
User types input     → scoring.ts → LCS comparison
                     → Word classification: correct|wrong|missing|extra
                     → Accuracy score (0-100%)
                     → Save to localStorage
```

## Web Worker Architecture

The Whisper model runs in a dedicated Web Worker to avoid blocking the main thread.

### Message Protocol

**Main Thread → Worker:**

```typescript
// Initialize (with model URL for same-origin loading)
{ type: 'init', modelUrl: '/models/' }

// Transcribe a segment
{
  type: 'transcribe',
  segmentIndex: number,
  pcmData: Float32Array,  // 16kHz mono
  sampleRate: 16000
}
```

**Worker → Main Thread:**

```typescript
// Model loading progress
{ status: 'initiate', file: string, progress: number, total: number }
{ status: 'progress', file: string, progress: number, total: number }
{ status: 'done', file: string }
{ status: 'ready' }

// Transcription results
{ type: 'segment-start', segmentIndex: number }
{ type: 'segment-done', segmentIndex: number, text: string, chunks: TranscriptionChunk[] }
{ type: 'error', error: string }
```

## Database Schema (Dexie/IndexedDB)

```typescript
// lib/db.ts
class ListeningToolDB extends Dexie {
  audioFiles!: Table<AudioFile>;
  transcriptions!: Table<Transcription>;
  sessions!: Table<PracticeSession>;
}

// Indexes:
// audioFiles:     ++id, url, downloadStatus, transcriptionStatus, createdAt
// transcriptions: ++id, audioFileId, createdAt
// sessions:       ++id, audioFileId, startedAt
```

**Key Types (from `lib/types.ts`):**

```typescript
interface AudioFile {
  id?: number;
  url: string;
  fileName: string;
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  transcriptionId?: number;
  createdAt: Date;
}

interface Transcription {
  id?: number;
  audioFileId: number;
  fullText: string;
  chunks: TranscriptionChunk[];    // Raw Whisper output
  sentences: PracticeSentence[];   // Grouped for practice
  modelUsed: string;
  processingTime: number;          // ms
  createdAt: Date;
}

interface TranscriptionChunk {
  text: string;
  timestamp: [number, number | null];  // [start, end] seconds
}

interface PracticeSentence {
  id: string;
  text: string;
  start: number;
  end: number;
  chunks: TranscriptionChunk[];
}
```

## Model Bundling Strategy

Whisper models must be served from the same origin to avoid CORS errors on Cloudflare Workers. The prebuild script (`scripts/download-models.js`) handles this:

```
Build time:
  HuggingFace API → file list for Xenova/whisper-base.en
  → Download all ONNX + config files → public/models/Xenova/whisper-base.en/
  → Copy WASM binaries from node_modules → public/transformers-wasm/

Runtime:
  stt-worker.ts → env.localModelPath = '/models/'
               → loads from same-origin (no CORS)
               → fallback to HuggingFace CDN if local files missing
```

**Available models (configure in `config/model.config.ts`):**

| Model | Size | Accuracy | Use Case |
|---|---|---|---|
| `Xenova/whisper-tiny` | ~40MB | Low | Testing, fast iteration |
| `Xenova/whisper-base.en` | ~140MB | Medium | **Default, recommended** |
| `Xenova/whisper-small` | ~240MB | High | Better accuracy |
| `Xenova/whisper-medium` | ~770MB | Best | Advanced users |

## Answer Checking Algorithm

Located in `lib/scoring.ts`. Uses LCS (Longest Common Subsequence):

```
Input: reference text, user input text

1. Normalize both:
   - Lowercase
   - Remove punctuation
   - Trim + collapse whitespace

2. Tokenize into word arrays

3. Run LCS to find longest matching subsequence

4. Classify each word:
   - Matched in LCS → correct (green)
   - In user but not reference → extra (gray strikethrough)
   - In reference but not user → missing (orange dashed underline)
   - Not matched → wrong (red)

5. Score = (matched count / reference word count) × 100

6. Generate feedback:
   - < 50%:    "Keep practicing!"
   - 50-79%:  "Good effort!"
   - 80-94%:  "Great job!"
   - 95-99%:  "Almost perfect!"
   - 100%:    "Perfect! Well done!"
```

## Performance Considerations

- **Non-blocking transcription**: Web Worker keeps UI responsive
- **Streaming updates**: Worker sends partial results as they arrive
- **Model loading**: One-time cost (cached by browser after first load)
- **PCM memory**: Audio data held in memory during session, not persisted
- **Transcript caching**: Prevents reprocessing same audio
- **Virtual scrolling**: Recommended for segment lists in practice mode (react-window)
- **IndexedDB quota**: Check quota before saving large files; warn at 80%, auto-clean at 90%

## Browser Requirements

| API | Purpose |
|---|---|
| Web Audio API | Audio decode + processing |
| Web Workers | Whisper WASM offloading |
| WebAssembly | Whisper model inference |
| IndexedDB | Persistent storage |
| Fetch API | Audio URL download |
| Storage API | Quota management |

**Tested browsers**: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+
