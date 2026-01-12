# Listening Practice Tool

Client-side audio transcription and dictation practice application built with Next.js. All processing occurs in-browser with no external data transmission.

## Features

- Client-side audio processing and decoding
- Silence-based automatic segmentation
- Web Worker-based STT transcription using Whisper WASM
- Dictation practice with real-time accuracy scoring
- IndexedDB-backed local storage
- Zero server-side data transmission

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **UI**: Tailwind CSS
- **Transcription**: Whisper WASM (Web Worker)
- **Storage**: IndexedDB (via Dexie)
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

## Setup

### Installation

```bash
yarn install
```

### Configuration

The application uses @xenova/transformers for ASR with Whisper models. Default model: `Xenova/whisper-base.en`.

Available models (configure in `/contexts/TranscriptionContext.tsx`):

- `Xenova/whisper-tiny` (40MB)
- `Xenova/whisper-base` (75MB)
- `Xenova/whisper-small` (240MB)
- `Xenova/whisper-medium` (770MB)

**Note**: Models are bundled with the application during build to avoid CORS issues when deployed on edge platforms like Cloudflare Workers. The `prebuild` script automatically downloads model files from HuggingFace and copies necessary WASM files to the `public` directory.

### Development

```bash
yarn dev
```

Access at http://localhost:3000

### Production

The build process includes downloading model files:

```bash
yarn build  # Runs prebuild script automatically
yarn start
```

The `prebuild` script (`scripts/download-models.js`) performs:
1. Downloads Whisper model files from HuggingFace
2. Copies ONNX WASM files from node_modules
3. Places files in `public/models/` and `public/transformers-wasm/`

This ensures models are served from the same origin, preventing CORS errors on edge deployments.

## Deployment

### Cloudflare Workers (Pages)

The application is configured for deployment on Cloudflare Workers via `wrangler.toml`:

```bash
# Deploy to Cloudflare Workers
yarn build
wrangler pages deploy out
```

The build artifact includes:
- Static Next.js pages in `/out`
- Bundled Whisper model files
- WASM binaries for transformers.js
- All necessary assets served from same origin

**Note**: Model files add ~140MB to build artifact. Ensure your Cloudflare Workers plan supports this size, or consider using Cloudflare R2 for model storage.

## Architecture

### Processing Pipeline

1. Audio fetch and decode via Web Audio API
2. Mono PCM conversion
3. Silence detection using RMS energy analysis
4. Segment extraction and resampling to 16kHz
5. Web Worker transcription with Whisper
6. IndexedDB transcript caching
7. Practice mode with normalized token comparison

### Silence Detection

Energy-based analysis per frame:

```
1. Calculate RMS: sqrt(sum(sample²) / length)
2. Convert to dB: 20 * log10(RMS)
3. Mark silence if dB < threshold
4. Detect continuous silence regions
5. Create segments between silence
6. Filter short segments
```

Configuration in `lib/silenceSplitter.ts`:

- `frameDuration`: 30ms
- `silenceThreshold`: -40dB
- `minSilenceDuration`: 400ms
- `minSegmentDuration`: 500ms

### Transcript Comparison

Normalization process:

1. Lowercase conversion
2. Punctuation removal
3. Whitespace normalization
4. Tokenization
5. Token comparison
6. Accuracy calculation

Alternative: Levenshtein distance for WER

### Storage

IndexedDB stores:

- Transcripts: `{audioHash, segmentIndex, modelVersion, text, timestamp}`
- Sessions: `{audioUrl, segments, inputs, timestamp}`

Audio and PCM data are not persisted.

## Configuration

### Silence Detection

Edit `lib/silenceSplitter.ts`:

```typescript
const DEFAULT_CONFIG: SilenceConfig = {
  frameDuration: 30,
  silenceThreshold: -40,
  minSilenceDuration: 400,
  minSegmentDuration: 500,
};
```

### Sample Rate

Default: 16kHz. Modify in `hooks/useAudioProcessing.ts` and `lib/pcmTools.ts`.

## API Reference

### Audio Processing

```typescript
const audioBuffer = await fetchAndDecodeAudio(url);
const pcm = audioBufferToMono(audioBuffer);
const segments = detectSilenceSegments(pcm, sampleRate);
const segmentPCM = extractSegment(pcm, sampleRate, start, end);
const resampled = preparePCMForSTT(segmentPCM, originalRate, 16000);
```

### Transcription Worker

```typescript
const worker = new Worker(new URL("../workers/stt-worker.ts", import.meta.url));

worker.postMessage({ type: "init", modelUrl: "/models/whisper.wasm" });
worker.postMessage({
  type: "transcribe",
  segmentIndex: 0,
  pcmData: Float32Array,
  sampleRate: 16000,
});

worker.onmessage = (event) => {
  // event.data: { type: 'ready' | 'segment-start' | 'segment-done' | 'error' }
};
```

### Caching

```typescript
await cacheTranscript(audioUrl, segmentIndex, text);
const text = await getCachedTranscript(audioUrl, segmentIndex);
await saveSession({ audioUrl, segments, inputs, timestamp });
const sessions = await getAllSessions();
```

### Scoring

```typescript
const result = compareTranscripts(reference, userInput);
// Returns: { score, correctTokens, incorrectTokens, missingTokens, extraTokens }

const wer = calculateWER(reference, userInput);
```

## Performance

- Handles 4-10 minute audio files
- Typically 20-100 segments per file
- Non-blocking transcription via Web Workers
- PCM data kept in memory during session
- One-time model loading cost
- Transcript caching prevents reprocessing

## Privacy

- No server-side processing
- No data uploads
- No external API calls (except audio fetch)
- Local IndexedDB storage only
- Audio files not persisted
- GDPR compliant
- Offline-capable after model download

## Browser Requirements

- Web Audio API
- Web Workers
- WebAssembly
- IndexedDB
- ES2020+

Tested: Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

## Troubleshooting

### CORS Issues with Model Loading

If you encounter CORS errors when loading Whisper models:

1. **Ensure prebuild script runs**: The `prebuild` script should run automatically before `build`. It fetches all available model files from HuggingFace API and downloads them.

2. **Check model files**: After build, verify `out/models/Xenova/whisper-base.en/` contains downloaded files. The script automatically fetches the complete file list from HuggingFace, including:
   - All JSON configuration files (config.json, tokenizer_config.json, etc.)
   - All ONNX model weight files
   - Supporting files (vocab.json, merges.txt, etc.)

3. **Check WASM files**: Verify `out/transformers-wasm/` contains WASM binaries.

4. **Network access during build**: The download script requires internet access to HuggingFace API and CDN. Ensure your build environment can reach `huggingface.co`.

5. **Fallback behavior**: The worker is configured to prefer local models but will fall back to downloading from HuggingFace if local files are not found. In production with a successful build, all files should be local and CORS-free.

6. **Build artifact size**: The complete model with all files is ~140MB for whisper-base.en. Consider using a smaller model (`whisper-tiny`) or external storage (R2, S3) if size is a concern.

### Audio Loading Issues

- Verify CORS headers
- Check URL accessibility
- Test with different audio file

### Transcription Issues

- Verify Whisper WASM integration
- Check browser console for worker errors
- Confirm model file accessibility

### Performance Issues

- Reduce audio file size
- Lower sample rate
- Adjust silence detection thresholds
- Close unnecessary browser tabs

## License

MIT
