# Product Specification v1

Browser-based audio listening and dictation practice tool for language learning. Users provide MP3 file URLs, the browser auto-transcribes using Whisper AI (client-side, no API keys), then users practice by listening and typing what they hear.

**Core principles:**
- Fully client-side — no backend, no API key required
- Direct MP3 URL input
- Local AI transcription (Whisper via Transformer.js)
- Sentence-by-sentence listening practice
- Real-time UI with live progress updates
- Offline support via IndexedDB caching
- Keyboard shortcuts for efficient workflow

## User Flows

### Screen 1: Home Screen

**Purpose**: Entry point — add MP3 files and access cached audio.

**UI Elements:**

- **MP3 Input Section** (top):
  - Text input: "Enter MP3 file URL..."
  - "Go" button (primary action)
  - Validation error for invalid URL format

- **Cached Audio Files List**:
  - Cards showing: file name, URL (truncated), added date, status badge
  - **Status Badge:**
    - Gray "Not Started" — not yet downloaded/transcribed
    - Yellow "Transcribing... X%" — active transcription with progress
    - Green "Ready to Practice" — transcription complete
    - Red "Error" — failed download/transcription

**Click behavior on cached cards:**
- Not Started → auto-download + transcribe → Processing Screen
- Transcribing → Processing Screen (show current progress)
- Ready → Practice Screen
- Error → error modal with retry option

**Data flow:**
- On mount: load audio files from IndexedDB
- "Go" click: validate URL → create `AudioFile` record in IndexedDB → navigate to Processing Screen

---

### Screen 2: Processing & Transcription

**Purpose**: Show real-time transcription progress (auto-started on navigation).

**Phase 1 — Model Loading** (first time only):
- Modal showing:
  - "Loading Whisper Model..."
  - Per-file progress bars with file name + size (e.g., "decoder_model_quantized.onnx — 45.2 MB / 60.5 MB")
  - Overall progress percentage
  - "Run in Background" button

**Phase 2 — Audio Download** (if not cached):
- Progress bar: "Downloading audio... X MB / Y MB"
- Audio format conversion indicator
- Saves to IndexedDB on completion

**Phase 3 — Transcription** (automatic):
- **Live text display**: scrollable area, auto-scrolls as chunks stream in, timestamps shown
- **Progress**: overall bar, elapsed time, estimated remaining, "Transcribing segment N/M..."
- **Segment timeline** (horizontal bar):
  - Proportional-width bars per segment
  - Green = transcribed, Yellow pulsing = current, Gray = pending
  - Multiple rows for long audio
  - Click segment → jump to preview timestamp

**Actions:**
1. Download audio (if needed)
2. Convert to 16kHz mono Float32Array
3. Send to Whisper worker
4. Stream chunks → update UI
5. Group chunks into sentences
6. Save to IndexedDB
7. **Auto-navigate to Practice Screen** at 100%

**Controls**: "Cancel" (stop, return home) | "Run in Background" (minimize, return home)

---

### Screen 3: Practice Mode (Dictation)

**Layout**: Two-column (25% sidebar + 75% main)

**Left Sidebar — Sentence List:**
- Scrollable list of all sentences
- Each item: sentence number, first 40 chars (truncated), status icon, accuracy %
  - Green checkmark = completed correctly
  - Red X = attempted, incorrect
  - Blue highlight = currently active
  - Gray circle = not started
- Click any sentence → jump to it; auto-scroll to keep current visible

**Main Area:**

*Audio Player (top):*
- Play/Pause (large button; keyboard: `Space`)
- Plays current sentence only (start → end timestamp)
- Speed selector: 0.5x | 0.75x | **1x** | 1.25x | 1.5x
- Replay button (keyboard: `Ctrl+R`)
- Progress bar for current sentence

*Typing Area (middle):*
- Large textarea: "Type what you hear..."
- Character count
- Auto-focus on sentence load
- Monospace font
- Clear (×) button

*Control Buttons (below textarea):*
- `[◄ Previous]` (gray; `Ctrl+←`) — disabled at first sentence
- `[Show Answer]` (yellow) — reveals correct text, disables Check
- `[Check Answer]` (blue; `Ctrl+Enter`) — primary action
- `[Next ►]` (gray; `Ctrl+→`) — disabled at last sentence

*Result Display (bottom, after checking):*
- **Your Answer**: word-by-word colored diff
  - Green bg = correct word
  - Red bg = wrong word (user's version)
  - Orange dashed underline = missing word (from reference)
  - Gray strikethrough = extra word (not in reference)
- **Correct Answer**: full reference text
- **Accuracy Score**: large "X% Correct" + progress bar
- **Feedback**: < 50% "Keep practicing!" | 50-79% "Good effort!" | 80-94% "Great job!" | 95-99% "Almost perfect!" | 100% "Perfect! Well done!"
- **Try Again** button — clear input, stay on same sentence

**Actions:**
- Sentence load: auto-play once, focus textarea, load saved attempt from localStorage
- Check Answer: normalize → LCS → classify → score → save to localStorage; if 100% → auto-advance after 2s
- Show Answer: reveal text, disable Check
- Previous/Next: save attempt, load sentence, scroll sidebar
- Session complete: summary modal (total accuracy, time, best/worst sentences) → "Practice Again" or "Return Home"

**Keyboard Shortcuts:**
- `Space` — Play/Pause
- `Ctrl+R` — Replay current sentence
- `Ctrl+→` — Next sentence
- `Ctrl+←` — Previous sentence
- `Ctrl+Enter` — Check answer
- `Esc` — Go back

---

## Answer Checking Algorithm

Uses **Longest Common Subsequence (LCS)** for accurate word-by-word comparison.

**Process:**
1. Normalize text: lowercase → remove punctuation → trim → collapse spaces
2. Tokenize into words
3. Calculate LCS
4. Classify each word: correct | wrong | missing | extra
5. Score = (matched words / reference words) × 100
6. Generate feedback based on score

---

## Data Model

```typescript
interface AudioFile {
  id?: number;
  url: string;
  fileName: string;                // sanitized from URL
  duration?: number;
  downloadStatus: 'pending' | 'downloading' | 'completed' | 'failed';
  transcriptionStatus: 'pending' | 'processing' | 'completed' | 'failed';
  audioBlob?: Blob;
  audioBlobUrl?: string;
  transcriptionId?: number;
  createdAt: Date;
}

interface Transcription {
  id?: number;
  audioFileId: number;
  fullText: string;
  chunks: TranscriptionChunk[];    // raw Whisper output
  sentences: PracticeSentence[];   // grouped for practice
  language: string;
  createdAt: Date;
  modelUsed: string;               // e.g., "Xenova/whisper-base.en"
  processingTime: number;          // ms
}

interface TranscriptionChunk {
  text: string;
  timestamp: [number, number | null];  // [start, end] in seconds
}

interface PracticeSentence {
  id: string;
  text: string;
  start: number;
  end: number;
  chunks: TranscriptionChunk[];
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
  similarity: number;  // 0-100
  isCorrect: boolean;
  timestamp: Date;
  playCount: number;
}
```

---

## Storage Strategy

**IndexedDB (Dexie):**
- Transcripts + sessions
- Audio metadata
- Audio blobs (optional, large)

**localStorage:**
- Practice progress: `practice_progress_${audioFileId}`

**Quota management:**
- Check quota before saving large files
- Warn user at 80% capacity
- Auto-cleanup oldest files at 90%
- Allow manual cache clearing

---

## Model Configuration

Default model: `Xenova/whisper-base.en` (set in `config/model.config.ts`)

| Model | Size | Use Case |
|---|---|---|
| `Xenova/whisper-tiny` | ~40MB | Testing, fast |
| `Xenova/whisper-base.en` | ~140MB | **Default, recommended** |
| `Xenova/whisper-small` | ~250MB | Better accuracy |
| `Xenova/whisper-medium` | ~770MB | Advanced users |

**Model settings:**
```typescript
{
  quantized: true,
  chunk_length_s: 30,
  stride_length_s: 5,
  language: 'english',
  task: 'transcribe',
  return_timestamps: true,
}
```

---

## Future Enhancements

- Multiple language support
- Vocabulary extraction + spaced repetition
- Cloud sync
- Speech recognition for speaking practice
- PWA with full offline mode
- Export practice history
