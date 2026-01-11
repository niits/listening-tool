# Listening Practice Tool

A client-side audio segmentation and STT transcription practice application built with Next.js. All audio processing and transcription happens entirely in the browser - no data is sent to any server.

## Features

- **Client-Side Audio Processing**: Fetch and decode audio files directly in the browser
- **Automatic Segmentation**: Split audio into segments based on silence detection
- **Web Worker Transcription**: Background STT transcription using Whisper WASM
- **Practice Mode**: Type what you hear and get instant feedback with accuracy scoring
- **Local Storage**: All progress and history stored locally using IndexedDB
- **Privacy First**: No audio or transcript data ever leaves your machine

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Tailwind CSS
- **Transcription**: Whisper WASM (Web Worker)
- **Storage**: IndexedDB (via idb library)
- **Language**: TypeScript

## Project Structure

```
/app
  page.tsx                    # Home page with audio URL input
  layout.tsx                  # Root layout
  globals.css                 # Global styles with Tailwind
  /processing
    page.tsx                  # Audio processing and transcription page
  /practice
    page.tsx                  # Practice session page

/components
  AudioUrlForm.tsx            # Audio URL input form
  SegmentProcessingList.tsx   # Display segment processing status
  PracticeSegment.tsx         # Individual segment practice UI

/hooks
  useAudioProcessing.ts       # Audio loading, decoding, and segmentation
  useTranscriptionWorker.ts   # Web Worker management for STT

/lib
  types.ts                    # TypeScript type definitions
  audioLoader.ts              # Fetch and decode audio
  silenceSplitter.ts          # Silence-based segmentation algorithm
  pcmTools.ts                 # PCM manipulation and resampling
  scoring.ts                  # Transcript comparison and WER calculation
  transcriptionCache.ts       # IndexedDB storage layer

/workers
  stt-worker.ts              # Web Worker for Whisper WASM transcription
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Start Using the App

The application is **fully functional** and uses **@xenova/transformers** (Transformers.js) for automatic speech recognition with Whisper models.

**Current Configuration:**

- Model: `Xenova/whisper-base.en`
- Runs entirely in the browser using WebAssembly
- Models are automatically downloaded and cached on first use

**Available Models** (change in `/contexts/TranscriptionContext.tsx`):

- `Xenova/whisper-tiny` (~40MB) - Fast, good for testing
- `Xenova/whisper-base` (~75MB) - Better accuracy
- `Xenova/whisper-small` (~240MB) - High accuracy
- `Xenova/whisper-medium` (~770MB) - Best accuracy

To change the model, update the `MODEL_URL` constant in `/contexts/TranscriptionContext.tsx`:

```typescript
const MODEL_URL = "Xenova/whisper-base"; // or any other model
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 4. Build for Production

```bash
npm run build
npm start
```

## How It Works

### Processing Pipeline

1. **Audio Input**: User provides a URL to an audio file
2. **Fetch & Decode**: Browser fetches the audio using `fetch()` and decodes it with Web Audio API
3. **Mono Conversion**: Multi-channel audio is mixed down to mono PCM
4. **Silence Detection**:
   - Analyze audio in short frames (20-50ms)
   - Calculate RMS energy per frame
   - Convert to decibels
   - Mark silence when below threshold for minimum duration
   - Generate segment boundaries `{start, end}`
5. **PCM Extraction**: Extract and resample PCM data for each segment (16kHz mono)
6. **Web Worker Transcription**:
   - Initialize Whisper model once
   - Send segments sequentially to worker
   - Receive transcripts and cache them
7. **Practice Mode**:
   - Play individual segments
   - Accept user input
   - Compare with reference using normalized token matching
   - Display accuracy and detailed diff

### Silence Detection Algorithm

The silence detector uses energy-based analysis:

```typescript
// For each frame:
1. Calculate RMS: sqrt(sum(sample²) / length)
2. Convert to dB: 20 * log10(RMS)
3. Mark as silence if dB < threshold (e.g., -40dB)
4. Detect continuous silence regions (e.g., 400ms+)
5. Create segments between silence regions
6. Filter out very short segments (e.g., <500ms)
```

Configuration options in `lib/silenceSplitter.ts`:

- `frameDuration`: 20-50ms (default: 30ms)
- `silenceThreshold`: -60dB to -30dB (default: -40dB)
- `minSilenceDuration`: 300-500ms (default: 400ms)
- `minSegmentDuration`: 500ms+ (default: 500ms)

### Transcript Comparison

The scoring system normalizes both reference and user input:

1. Convert to lowercase
2. Remove punctuation
3. Collapse whitespace
4. Tokenize into words
5. Compare token-by-token
6. Calculate:
   - Correct tokens (exact matches)
   - Incorrect tokens (wrong words)
   - Missing tokens (omitted words)
   - Extra tokens (added words)
   - Overall accuracy score (correct / total)

Alternative: Word Error Rate (WER) using Levenshtein distance

### Local Storage

All data is stored in IndexedDB:

**Transcripts Store**:

- Key: `{audioHash}-{segmentIndex}-{modelVersion}`
- Value: `{audioHash, segmentIndex, modelVersion, text, timestamp}`

**Sessions Store**:

- Key: `timestamp`
- Value: `{audioUrl, segments[], inputs[], timestamp}`
- Indexes: by-url, by-timestamp

No audio files or PCM data are ever stored.

## Configuration

### Adjust Silence Detection

Edit `lib/silenceSplitter.ts`:

```typescript
const DEFAULT_CONFIG: SilenceConfig = {
  frameDuration: 30, // Frame size in ms
  silenceThreshold: -40, // Silence threshold in dB
  minSilenceDuration: 400, // Minimum silence length in ms
  minSegmentDuration: 500, // Minimum segment length in ms
};
```

### Change Target Sample Rate

The default is 16kHz (common for Whisper). Adjust in:

- `hooks/useAudioProcessing.ts` - `getSegmentPCM()`
- `lib/pcmTools.ts` - `preparePCMForSTT()`

### Model URL

Update model paths in:

- `app/processing/page.tsx`
- `app/practice/page.tsx`

```typescript
useTranscriptionWorker(
  "/models/whisper-base.wasm", // Your model URL
  audioUrl || ""
);
```

## API Reference

### Audio Processing

```typescript
// Fetch and decode audio
const audioBuffer = await fetchAndDecodeAudio(url);

// Convert to mono
const pcm = audioBufferToMono(audioBuffer);

// Detect segments
const segments = detectSilenceSegments(pcm, sampleRate);

// Extract segment
const segmentPCM = extractSegment(pcm, sampleRate, start, end);

// Resample for STT
const resampled = preparePCMForSTT(segmentPCM, originalRate, 16000);
```

### Transcription Worker

```typescript
// Initialize worker
const worker = new Worker(new URL("../workers/stt-worker.ts", import.meta.url));

// Send init message
worker.postMessage({ type: "init", modelUrl: "/models/whisper.wasm" });

// Transcribe segment
worker.postMessage({
  type: "transcribe",
  segmentIndex: 0,
  pcmData: Float32Array,
  sampleRate: 16000,
});

// Receive results
worker.onmessage = (event) => {
  // event.data: { type: 'ready' | 'segment-start' | 'segment-done' | 'error' }
};
```

### Caching

```typescript
// Cache transcript
await cacheTranscript(audioUrl, segmentIndex, text);

// Retrieve cached transcript
const text = await getCachedTranscript(audioUrl, segmentIndex);

// Save session
await saveSession({ audioUrl, segments, inputs, timestamp });

// Get all sessions
const sessions = await getAllSessions();
```

### Scoring

```typescript
// Compare transcripts
const result = compareTranscripts(reference, userInput);
// Returns: { score, correctTokens, incorrectTokens, missingTokens, extraTokens }

// Calculate WER
const wer = calculateWER(reference, userInput);
```

## Performance Considerations

- **Audio Size**: Handles 4-10 minute audio files comfortably
- **Segment Count**: Typically 20-100 segments depending on speech density
- **Worker Usage**: All transcription runs in Web Worker (non-blocking)
- **Memory**: PCM data kept in memory during session (cleared on exit)
- **Model Loading**: One-time cost at worker initialization
- **Caching**: Transcripts cached to avoid re-processing

## Privacy & Security

- ✅ No server-side processing
- ✅ No data uploads
- ✅ No external API calls (except fetching audio URL)
- ✅ All storage is local (IndexedDB)
- ✅ Audio files not persisted
- ✅ Full GDPR compliance
- ✅ Can work offline after model download

## Browser Compatibility

Requires modern browser with:

- Web Audio API
- Web Workers
- WebAssembly
- IndexedDB
- ES2020+ JavaScript

Tested on:

- Chrome 90+
- Firefox 88+
- Safari 14+
- Edge 90+

## Troubleshooting

### Audio won't load

- Check CORS headers on audio file
- Ensure URL is accessible from browser
- Try with a different audio file

### Transcription not working

- Verify Whisper WASM is properly integrated
- Check browser console for worker errors
- Ensure model file is accessible

### Performance issues

- Reduce audio file size
- Lower sample rate (e.g., 8kHz)
- Adjust silence detection thresholds
- Close other browser tabs

## Future Enhancements

- [ ] Support for local file uploads
- [ ] Multiple model options (tiny, base, small)
- [ ] Language selection
- [ ] Playback speed control
- [ ] Keyboard shortcuts
- [ ] Export results to CSV/JSON
- [ ] Advanced WER visualization
- [ ] Repeat difficult segments
- [ ] Custom silence detection profiles
- [ ] Progress statistics dashboard

## License

MIT

## Contributing

This is a reference implementation based on the specification. Contributions are welcome, especially:

- Whisper WASM integration examples
- Alternative STT engines
- UI/UX improvements
- Performance optimizations
- Additional language support

---

**Note**: This implementation uses @xenova/transformers (Transformers.js) with Whisper models for automatic speech recognition. The models run entirely in the browser using WebAssembly and are automatically downloaded and cached on first use.
