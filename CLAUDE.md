# CLAUDE.md

Guide for Claude Code when working on this project.

## Project Overview

Browser-based audio listening and dictation practice tool for language learning. All processing is fully client-side — no backend, no API keys, no data uploads. Users provide MP3 URLs, the browser downloads + transcribes via Whisper WASM, then users practice dictation segment by segment.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS v3 |
| Storage | IndexedDB via Dexie 4 |
| Transcription | @xenova/transformers (Whisper WASM, Web Worker) |
| Audio | Web Audio API |
| Deployment | Cloudflare Workers (Pages) |
| Package Manager | yarn 4 |

## Common Commands

```bash
yarn dev          # Start dev server at http://localhost:3000
yarn build        # Full build: prebuild (download models) → Next.js build
yarn start        # Start production server
yarn check        # Run typecheck + lint (use before committing)
yarn typecheck    # TypeScript check only
yarn lint         # ESLint
yarn lint:fix     # ESLint auto-fix
yarn format       # Prettier format all files
```

> **Note**: `yarn build` runs `scripts/download-models.js` first — downloads ~140MB Whisper model from HuggingFace into `public/models/`. Requires internet access. Takes 5-10 min on first run.

## Project Structure

```
/app                           # Next.js App Router
  page.tsx                     # Home: URL input + cached audio list
  layout.tsx
  globals.css
  /processing/page.tsx         # Processing: transcription progress
  /practice/page.tsx           # Practice: dictation screen

/components                    # React components (flat, migrating to /src)
  AudioUrlForm.tsx             # URL input form
  CachedAudioList.tsx          # List of cached audio files with status
  PracticeSegment.tsx          # Single segment practice UI
  SegmentProcessingList.tsx    # Transcription segment status list
  TranscriptionQueueSidebar.tsx

/contexts
  TranscriptionContext.tsx     # Global transcription state + model config

/hooks
  useAudioProcessing.ts        # Audio load, decode, segment pipeline
  useTranscriptionWorker.ts    # Web Worker lifecycle management

/lib
  types.ts                     # All TypeScript types/interfaces — put new types here
  db.ts                        # Dexie DB class + table definitions
  audioLoader.ts               # Fetch + decode audio via Web Audio API
  silenceSplitter.ts           # Silence detection (RMS/dB energy analysis)
  pcmTools.ts                  # PCM conversion + resampling to 16kHz
  scoring.ts                   # WER calculation, transcript comparison (LCS)
  audioCache.ts                # Audio file caching utilities
  transcriptionCache.ts        # IndexedDB transcript read/write

/workers
  stt-worker.ts                # Web Worker: @xenova/transformers Whisper pipeline

/config
  model.config.ts              # Whisper model ID (default: Xenova/whisper-base.en)

/scripts
  download-models.js           # Prebuild: downloads models from HuggingFace

/src                           # Feature-based structure (migration in progress)
  /components/{home,practice,processing,rss,shared}
  /services
  /types

/docs                          # All project documentation
```

## Architecture

### Audio Processing Pipeline

1. User provides MP3 URL
2. `audioLoader.ts` fetches + decodes via Web Audio API → `AudioBuffer`
3. `pcmTools.ts` converts to mono `Float32Array`
4. `silenceSplitter.ts` detects silence regions (RMS energy, frame 30ms, threshold -40dB, min silence 400ms)
5. Segments extracted + resampled to 16kHz
6. `useTranscriptionWorker.ts` sends PCM chunks to Web Worker
7. `stt-worker.ts` runs `@xenova/transformers` Whisper pipeline
8. Results cached in IndexedDB via `transcriptionCache.ts`
9. Practice mode: user input compared against transcript via `scoring.ts` (LCS-based WER)

### Web Worker Message Protocol

```typescript
// Main thread → Worker
worker.postMessage({
  audio: Float32Array,  // 16kHz mono PCM
  model: 'Xenova/whisper-base.en',
  multilingual: false,
  quantized: true,
  subtask: 'transcribe',
  language: 'english',
});

// Worker → Main thread
{ status: 'initiate', file: string, progress: number, total: number }
{ status: 'progress', file: string, progress: number, total: number }
{ status: 'done', file: string }
{ status: 'ready' }
{ status: 'update', data: [text, { chunks }] }   // streaming
{ status: 'complete', data: { text, chunks } }   // final
{ status: 'error', data: Error }
```

### Storage (Dexie/IndexedDB)

```typescript
// lib/db.ts — table definitions
audioFiles:     { id, url, fileName, downloadStatus, transcriptionStatus, ... }
transcriptions: { id, audioFileId, fullText, chunks, sentences, modelUsed, ... }
sessions:       { id, audioFileId, transcriptionId, currentSentenceIndex, attempts, ... }
```

Practice progress is saved to `localStorage` keyed by `practice_progress_${audioFileId}`.

### Build: Whisper Model Bundling

Models are downloaded at build time into `public/models/` to avoid CORS errors on Cloudflare Workers. The `scripts/download-models.js` prebuild script:
1. Fetches the model file list from HuggingFace API
2. Downloads all ONNX + config files (~140MB for whisper-base.en)
3. Copies WASM binaries from `node_modules` to `public/transformers-wasm/`

## Coding Conventions

### TypeScript
- `strict: true` in tsconfig — no implicit any
- All types/interfaces in `lib/types.ts` (or `src/types/` after migration)
- Prefer `interface` over `type` for object shapes
- Define interfaces for all props and state

### React
- Functional components with hooks only — no class components (except error boundaries)
- Custom hooks for reusable stateful logic (`/hooks`)
- `React.memo` for expensive renders
- Fragments (`<>`) to avoid unnecessary DOM wrappers
- Components < 200 lines; extract logic to hooks/utils if longer

### Naming
- Components: `PascalCase.tsx`
- Hooks: `useFeatureName.ts`
- Services: `feature.service.ts`
- Utils/lib: `featureName.ts`
- Constants: `UPPER_SNAKE_CASE`
- Interfaces: `PascalCase` (no `I` prefix)

### File Organization
- No barrel files (`index.ts` re-exports) — import directly from source
- Group by feature, not by type
- Co-locate logic that changes together
- All documentation in `docs/`
- New components go in `src/components/{feature}/` (feature-based, not flat)

### State Management
- `useState` for component-local state
- `Context API` (`TranscriptionContext`) for shared transcription state
- No external state library unless complexity demands it

### Styling
- Tailwind CSS utility classes
- Use shadcn/ui for UI primitives when available
- Semantic color names via CSS variables

## Key Constraints

- **No server-side processing** — everything runs in the browser
- **No external API calls** — only the user-provided audio URL is fetched
- **CORS**: Models must be served from the same origin (bundled at build)
- **Privacy**: No data leaves the browser; GDPR compliant by design
- **Browser requirements**: Web Audio API, Web Workers, WebAssembly, IndexedDB, ES2020+

## Practice Mode: Answer Checking

Uses LCS (Longest Common Subsequence) for word-by-word comparison (`lib/scoring.ts`):
1. Normalize: lowercase → remove punctuation → trim → collapse spaces
2. Tokenize into words
3. Run LCS to find matched words
4. Classify each word: correct (green) | wrong (red) | missing (orange dashed) | extra (gray strikethrough)
5. Score = matched / expected × 100

Keyboard shortcuts: `Space` (play/pause), `Ctrl+R` (replay), `Ctrl+→/←` (next/prev), `Ctrl+Enter` (check), `Esc` (back)

## Documentation

- [docs/spec.md](docs/spec.md) — Full v1 product specification and user flows
- [docs/design.md](docs/design.md) — UI/UX design instructions and component specs
- [docs/coding-standards.md](docs/coding-standards.md) — Detailed coding standards
- [docs/testing.md](docs/testing.md) — Build, deployment, and testing guide
- [docs/architecture.md](docs/architecture.md) — Technical architecture deep-dive

## Deployment

```bash
yarn build                      # Build + bundle models
wrangler pages deploy out       # Deploy to Cloudflare Workers Pages
```

Build artifact (`out/`) includes static Next.js pages + Whisper model files (~180MB total).
