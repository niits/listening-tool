# Listening Practice Tool - Complete Specification & Development Guide (v1)

## 1. Project Overview

A browser-based audio listening and dictation practice tool for language learning. Users provide MP3 file URLs, and audio is automatically transcribed using Whisper AI (runs locally in browser via Transformer.js). No backend, no API keys required - everything runs client-side.

**Key Features**:

- Fully client-side (no backend/API key required)
- Direct MP3 URL input (no RSS/podcast dependencies)
- Local AI transcription using Whisper (Transformer.js)
- Sentence-by-sentence listening practice
- Real-time UI/UX with live progress updates
- Offline support with IndexedDB caching
- Files cached by sanitized URL name
- Keyboard shortcuts for efficient workflow

## 2. Tech Stack

- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite
- **Styling**: TailwindCSS v4+
- **Database**: Dexie.js (IndexedDB wrapper)
- **AI/ML**: Transformer.js (Whisper model - browser-based)
- **Audio**: Web Audio API
- **Workers**: Web Workers for ML inference
- **Package Manager**: pnpm

## 3. User Flow

### 3.1. Home Screen

- **MP3 Input Section**:
  - Text input field: "Enter MP3 file URL..."
  - "Go" button (primary action)
  - Validation error display for invalid URL format
- **Cached Audio Files List**:
  - Grid/list of audio file cards showing:
    - File name (sanitized from URL)
    - URL (truncated)
    - Added date
    - **Status Badge** (color-coded):
      - 🔵 **Gray "Not Started"**: Not downloaded/transcribed yet
      - 🟡 **Yellow "Transcribing... X%"**: In progress with progress percentage
      - 🟢 **Green "Ready to Practice"**: Transcription complete
      - 🔴 **Red "Error"**: Download/transcription failed

**Click Behavior**:

- **Not Started** → Auto-download + transcribe → Navigate to Processing Screen
- **Transcribing** → Navigate to Processing Screen (show real-time progress)
- **Ready** → Navigate to Practice Screen
- **Error** → Show error modal with retry option

**Data Flow**:

- On mount: Load audio files from IndexedDB
- Display cached data immediately
- Show cached transcription status
- When "Go" clicked: Validate URL → Create AudioFile record → Navigate to Processing Screen
- When audio file clicked: Check status in IndexedDB → Route accordingly

### 3.2. Episode List Screen

- **Header**:
  - Feed title + artwork
  - "Refresh Feed" button
  - Back button → Home Screen
- **Episode Cards**:
  - Each card displays:
    - Episode title
    - Publication date
    - Duration (from RSS or "Unknown")
    - Thumbnail image
    - **Status Badge** (color-coded):
      - 🔵 **Gray "Not Started"**: Not downloaded/transcribed yet
      - 🟡 **Yellow "Transcribing... X%"**: In progress with progress percentage
      - 🟢 **Green "Ready to Practice"**: Transcription complete
      - 🔴 **Red "Error"**: Download/transcription failed

**Click Behavior**:

- **Not Started** → Auto-download + transcribe → Navigate to Processing Screen
- **Transcribing** → Navigate to Processing Screen (show real-time progress)
- **Ready** → Navigate to Practice Screen
- **Error** → Show error modal with retry option

**Data Flow**:

- On mount: Load episodes for selected feed from IndexedDB
- Display cached data immediately
- Show cached transcription status
- When episode clicked: Check status in IndexedDB → Route accordingly

### 3.3. Processing & Transcription Screen

Automatically download audio (if not cached), convert, and send to Web Worker for Whisper transcription.

**Phase 1 - Model Loading** (first time only):

- Modal/overlay showing:
  - "Loading Whisper Model..."
  - List of files being downloaded:
    - File name (e.g., "decoder_model_quantized.onnx")
    - Per-file progress bar (0-100%)
    - File size progress (e.g., "45.2 MB / 60.5 MB")
  - Overall progress percentage
  - Dismissible background button (continues processing in background)

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
- **Segment Timeline Visualization** (horizontal timeline):
  - Timeline bar showing audio duration
  - Small vertical bars representing segments:
    - 🟢 **Green**: Transcribed
    - 🟡 **Yellow (pulsing)**: Currently transcribing
    - ⚫ **Gray**: Pending
  - Proportional widths (segment duration)
  - Multiple rows if needed for long audio
  - Bar height: 1/2 line height
  - Click segment → jump to that timestamp in preview

**Actions**:

1. Download audio (if needed)
2. Convert to 16kHz mono Float32Array
3. Send to Whisper worker
4. Stream transcription chunks → Update UI in real-time
5. Group chunks into sentences
6. Save transcription to IndexedDB
7. **Auto-navigate to Practice Screen** when 100% complete

**Control Buttons**:

- "Cancel" → Stop worker, return to Episode List
- "Run in Background" → Minimize to notification, return to Episode List

### 3.4. Practice Mode (Dictation Screen)

**Layout**: Two-column design

**Left Sidebar** (25% width):

- **Sentence List**:
  - Scrollable list of all sentences (virtualized for performance)
  - Each item shows:
    - Sentence number (#1, #2, #3...)
    - First 40 characters of text (truncated preview)
    - **Status icon**:
      - ✅ **Green checkmark**: Completed correctly (100%)
      - ❌ **Red X**: Attempted but incorrect (< 100%)
      - 🎯 **Blue highlight**: Currently active sentence
      - ⚪ **Gray circle**: Not started
    - Accuracy percentage if attempted (e.g., "85%")
  - Click any sentence → Jump to that sentence
  - Auto-scroll to keep current sentence visible

**Main Area** (75% width):

_Audio Player_ (top):

- Play/Pause button (large, keyboard: Space)
- Current sentence playback only (start → end timestamp)
- Playback speed selector: 0.5x | 0.75x | **1x** | 1.25x | 1.5x
- Waveform visualization (optional) showing current segment
- Replay button (keyboard: Ctrl+R)
- Progress bar for current sentence

_Typing Area_ (middle):

- Large textarea input: "Type what you hear..."
- Character count display
- Auto-focus when sentence loads
- Monospace font for clarity
- Clear button (×)

_Control Buttons_ (below textarea):

- **[◄ Previous Sentence]** (gray, keyboard: Ctrl+←)
- **[Show Answer]** (yellow, reveals correct text)
- **[Check Answer]** (blue, primary action, keyboard: Ctrl+Enter)
- **[Next Sentence ►]** (gray, keyboard: Ctrl+→)
- Button states: disabled if at first/last sentence

_Result Display_ (bottom, appears after checking):

- **Your Answer** section:
  - Word-by-word comparison with color highlighting:
    - 🟢 **Green background**: Correct word
    - 🔴 **Red background**: Wrong word (shows user's version)
    - 🟠 **Orange dashed underline**: Missing word (from correct answer)
    - ⚫ **Gray strike-through**: Extra word (not in correct answer)

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
  - Disable "Check Answer" button
  - Allow copying for review
- "Previous/Next":
  - Save current attempt
  - Load new sentence
  - Scroll sidebar to keep visible
- **Session Complete** (all sentences done):
  - Show summary modal:
    - Total accuracy
    - Time spent
    - Sentences completed
    - Best/worst performing sentences
  - "Practice Again" or "Return to Episodes"

**Data Flow**:

- On mount: Load transcription from IndexedDB
- Load progress from localStorage: `practice_progress_${episodeId}`
- Save after each attempt (real-time, no "Save" button needed)

## 4. Answer Checking Algorithm

Use **Longest Common Subsequence (LCS)** for accurate word-by-word comparison:

**Process**:

1. **Normalize text**: lowercase, remove punctuation, trim, collapse spaces
2. **Tokenize** into words
3. **Calculate LCS** (Longest Common Subsequence)
4. **Mark each word**:
   - ✅ Correct (green)
   - ❌ Wrong (red)
   - 🟠 Missing (orange dashed underline)
   - ⚫ Extra (gray strike-through)
5. **Calculate score**: (matched words / expected words) \* 100
6. **Generate feedback** based on score

## 5. Technical Architecture

### 5.1. Database Schema (Dexie/IndexedDB)

```typescript
class ListeningToolDB extends Dexie {
  feeds!: Table<Feed>;
  episodes!: Table<Episode>;
  transcriptions!: Table<Transcription>;
  sessions!: Table<PracticeSession>;

  constructor() {
    super("ListeningToolDB");
    this.version(1).stores({
      feeds: "++id, url, lastFetched",
      episodes: "++id, feedId, guid, downloadStatus, transcriptionStatus",
      transcriptions: "++id, episodeId, createdAt",
      sessions: "++id, episodeId, startedAt",
    });
  }
}
```

### 5.2. Core Interfaces

```typescript
interface Feed {
  id?: number;
  url: string;
  title: string;
  description: string;
  imageUrl?: string;
  lastFetched: Date;
}

interface Episode {
  id?: number;
  feedId: number;
  title: string;
  description: string;
  audioUrl: string;
  duration?: number;
  pubDate: Date;
  guid: string;
  downloadStatus: "pending" | "downloading" | "completed" | "failed";
  transcriptionStatus: "pending" | "processing" | "completed" | "failed";
  audioBlob?: Blob;
  audioBlobUrl?: string;
  transcriptionId?: number;
}

interface Transcription {
  id?: number;
  episodeId: number;
  fullText: string;
  chunks: TranscriptionChunk[];
  sentences: PracticeSentence[];
  language: string;
  createdAt: Date;
  modelUsed: string;
  processingTime: number;
}

interface TranscriptionChunk {
  text: string;
  timestamp: [number, number | null];
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
  episodeId: number;
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
  similarity: number;
  isCorrect: boolean;
  timestamp: Date;
  playCount: number;
}
```

### 5.3. Web Worker Pattern

**Main Thread → Worker Messages**:

```typescript
worker.postMessage({
  audio: Float32Array,
  model: "Xenova/whisper-base.en",
  multilingual: false,
  quantized: true,
  subtask: "transcribe",
  language: "english",
});
```

**Worker → Main Thread Messages**:

```typescript
// Model loading
{ status: 'initiate', file: string, progress: number, total: number }
{ status: 'progress', file: string, progress: number, total: number }
{ status: 'done', file: string }
{ status: 'ready' }

// Transcription
{ status: 'update', data: [text, { chunks }] }
{ status: 'complete', data: { text, chunks } }
{ status: 'error', data: Error }
```

## 6. Project Structure

```bash
src/
├── components/
│   ├── home/
│   │   ├── RSSInput.tsx
│   │   └── FeedList.tsx
│   ├── rss/
│   │   ├── EpisodeList.tsx
│   │   └── EpisodeCard.tsx
│   ├── processing/
│   │   ├── ProcessingProgress.tsx
│   │   └── TranscriptionStatus.tsx
│   ├── practice/
│   │   ├── PracticeScreen.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── SegmentSidebar.tsx
│   │   ├── TypingArea.tsx
│   │   └── AnswerChecker.tsx
│   └── shared/
│       ├── Progress.tsx
│       └── Modal.tsx
├── services/
│   ├── db.ts
│   ├── rss.service.ts
│   └── audio.service.ts
├── workers/
│   └── transcriber.worker.js
├── types/
│   └── index.ts
├── hooks/
│   ├── useTranscriber.ts
│   └── useWorker.ts
├── utils/
│   ├── textComparison.ts
│   └── audioUtils.ts
├── lib/                     # General utilities & helpers
└── App.tsx
```

## 7. Coding Conventions

### TypeScript

- Use strict mode (`strict: true` in tsconfig.json)
- Always define interfaces for props and state
- Use type inference where obvious
- Prefer `interface` over `type` for object shapes
- Use enums for fixed sets of values
- **Place all types in `types/` folder** with descriptive filenames

### React

- **Use functional components with hooks** (no class components except error boundaries)
- Use custom hooks for reusable logic
- Prefer composition over inheritance
- Keep components small and focused (< 200 lines)
- Use `React.memo` for expensive renders
- **Component naming**: PascalCase (e.g., `AudioPlayer`)
- **Props**: camelCase, destructure in function signature
- **Never mutate** props or state directly
- **Use fragments** (`<>...</>`) to avoid unnecessary DOM wrappers

### Naming Conventions

- **Components**: PascalCase (e.g., `AudioPlayer.tsx`)
- **Hooks**: camelCase with 'use' prefix (e.g., `useAudioProcessor.ts`)
- **Services**: camelCase with '.service' suffix (e.g., `rss.service.ts`)
- **Constants**: UPPER_SNAKE_CASE
- **Variables/Functions**: camelCase, descriptive names
- **Long, clear names** over short, vague ones

### File Organization

- One component per file
- Co-locate related logic that changes together
- Group code by feature, not by type
- **No barrel files** (avoid `index.ts` re-exports)
- Import directly from specific files
- Extract large non-component logic to `lib/` folder

### Comments & Documentation

- Use JSDoc for public functions
- Explain "why" not "what"
- Document complex algorithms
- Add TODO comments for future improvements
- All principal documentation in `docs/` folder

## 8. UI/UX Guidelines

### Styling (TailwindCSS v4+)

- Use utility classes
- Create custom components for repeated patterns
- Use semantic color names

**Color Palette**:

```css
/* Status Colors */
--success: #10b981 /* green-500 */ --warning: #f59e0b /* yellow-500 */
  --error: #ef4444 /* red-500 */ --info: #3b82f6 /* blue-500 */ /* Text */
  --text-primary: #111827 /* gray-900 */ --text-secondary: #6b7280
  /* gray-500 */ /* Background */ --bg-primary: #ffffff /* white */
  --bg-secondary: #f9fafb /* gray-50 */ /* Borders */ --border: #e5e7eb
  /* gray-200 */;
```

### Keyboard Shortcuts

- **Space**: Play/Pause audio
- **Ctrl+R**: Replay current sentence
- **Ctrl+→**: Next sentence
- **Ctrl+←**: Previous sentence
- **Ctrl+Enter**: Check answer
- **Esc**: Go back/close modal

### Accessibility

- Use semantic HTML
- Add ARIA labels to controls
- Support keyboard navigation
- Announce status changes to screen readers
- Ensure color contrast ratios (WCAG AA)

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

### Responsive Design

- Desktop-optimized (primary)
- Support tablet/mobile (secondary)
- Use responsive breakpoints from TailwindCSS

## 9. Performance Best Practices

### IndexedDB

- Use transactions for multiple operations
- Index frequently queried fields
- Batch read/write operations
- Clear old cache when quota exceeds 80%
- Check quota before saving large files

### Audio Processing

- Revoke blob URLs when done
- Clear AudioContext buffers after processing
- Limit concurrent transcriptions to 1

### React Optimization

- Use `React.memo` for heavy components
- Virtualize long lists (react-window)
- Debounce input handlers (300ms)
- Lazy load Web Worker
- Use `React.lazy` and `Suspense` for code splitting

### Web Worker

- Offload heavy processing (transcription)
- Send progress updates via streaming callback
- Dispose pipeline when changing models
- Terminate worker when done

## 10. Error Handling

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

## 11. Storage Management

### Storage Quota Strategy

1. Check quota before saving large files
2. Warn user at 80% capacity
3. Auto-cleanup oldest episodes at 90%
4. Allow manual cache clearing
5. Save audio as Blob in IndexedDB
6. Save practice progress in localStorage

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

## 12. Model Configuration

### Recommended Models

- **whisper-tiny**: Fast, ~40MB, good for testing
- **whisper-base**: Balanced, ~75MB, recommended for production
- **whisper-small**: Better accuracy, ~250MB, for advanced users

### Model Settings

```typescript
{
  quantized: true,
  chunk_length_s: 30,
  stride_length_s: 5,
  language: 'english',  // or null for auto-detect
  task: 'transcribe',   // or 'translate'
  return_timestamps: true,
}
```

## 13. Important Implementation Notes

1. **Auto-start transcription** immediately when episode is clicked (if not already transcribed)
2. **Whisper handles segmentation** - no separate segmentation step needed
3. **Normalize text** before comparison (lowercase, remove punctuation)
4. **Cache everything** in IndexedDB for offline support
5. **Auto-navigate** to practice screen when transcription completes
6. **Save progress** after each answer check to localStorage
7. **Use Transformer.js locally** - no API key needed
8. **Streaming transcription** - show live text updates as Whisper processes
9. **CORS proxy** may be needed for RSS feeds in development: `https://api.allorigins.win/raw?url=`
10. **Model loading is one-time** - first transcription downloads model files, subsequent uses are instant
11. **Segment timeline visualization** - proportional widths, multiple rows for long audio, real-time updates
12. **Answer checking uses 4 states**: correct (green), wrong (red), missing (dashed underline), extra (strike-through)
13. **Use pnpm** for package management
14. **Design for replaceability** - make it easy to replace and delete code
15. **One level of abstraction per function**

## 14. Browser Compatibility

**Target**: Modern browsers (Chrome, Firefox, Safari, Edge)

**Required APIs**:

- IndexedDB
- Web Audio API
- Web Workers
- Fetch API
- Storage API

## 15. Testing Strategy

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

## 16. Future Enhancements

- Multiple language support
- Vocabulary extraction
- Spaced repetition system
- Cloud sync
- Speech recognition for speaking practice
- PWA support with offline mode
- Export practice history

---

## Quick Reference Card

### Status Icons

- ✅ Completed correctly
- ❌ Attempted but incorrect
- 🎯 Current/Active
- ⚪ Pending/Not started
- 🟢 Transcribed
- 🟡 Processing
- 🔴 Error

### File Naming Examples

- Components: `AudioPlayer.tsx`
- Services: `rss.service.ts`
- Hooks: `useAudioProcessor.ts`
- Types: `episode.ts`, `transcription.ts`
- Utils: `textComparison.ts`

### Common Dexie Operations

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

---

**This file is the v1 complete specification and development guide.** Use it for development, code reviews, and future extensions.
