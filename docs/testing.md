# Testing and Deployment Guide

## Local Development Testing

### 1. Run Dev Server

```bash
yarn dev
```

Access at http://localhost:3000. Hot reload enabled.

### 2. Type and Lint Checks

```bash
yarn check       # typecheck + lint
yarn typecheck   # TypeScript only
yarn lint        # ESLint only
yarn lint:fix    # ESLint with auto-fix
yarn format      # Prettier format
```

Run `yarn check` before committing to catch type errors and linting issues.

---

## Build Testing

### 1. Test the Download Script

Run the prebuild script manually to verify model downloads:

```bash
node scripts/download-models.js
```

**Expected output:**
- API call to fetch file list from HuggingFace
- Download progress per model file
- WASM files copied from node_modules
- "Build preparation complete!" message

**Files created:**
- `public/models/Xenova/whisper-base.en/` — all ONNX + config files (~140MB)
- `public/transformers-wasm/` — 4 WASM binary files (~37MB)

### 2. Full Build

```bash
# Clean previous build (optional)
rm -rf out public/models public/transformers-wasm

# Build (runs prebuild automatically)
yarn build
```

**Verify output:**
```bash
ls -la out/models/Xenova/whisper-base.en/
ls -la out/transformers-wasm/
```

---

## Deployment to Cloudflare Workers

### Deploy

```bash
yarn build
wrangler pages deploy out
```

**Expected:**
- Upload size ~180MB+ (models + WASM)
- Deployment completes without size errors

### Post-Deploy Runtime Checks

After deploying, verify in the browser:

1. Open the deployed URL
2. Load an audio file
3. **Model loading**: No CORS errors in console; models load from `/models/Xenova/whisper-base.en/`
4. **WASM loading**: In Network tab, WASM files load from `/transformers-wasm/`
5. **Transcription**: Process an audio file, verify segments are transcribed
6. **Practice mode**: Check answer works, scoring displays correctly

---

## Troubleshooting

### Build fails: "ENOTFOUND huggingface.co"

Build environment cannot access HuggingFace.

- Check firewall/proxy settings
- Ensure internet access to `huggingface.co`

### Build fails: "ENOSPC: no space left on device"

- Free disk space (need ~500MB)
- Remove unused Docker images/containers

### Deployment fails: "Asset too large"

Model files exceed Cloudflare Workers size limits. Options:

1. Use a smaller model:
   ```javascript
   // config/model.config.js
   const MODEL_ID = 'Xenova/whisper-tiny'; // ~40MB
   ```

2. Use Cloudflare R2 for model storage:
   - Upload models to R2 bucket with CORS headers
   - Update `stt-worker.ts` to load from R2 URL

### Still seeing CORS errors in production

Debug steps:
```bash
# Verify files exist in build output
ls -la out/models/
ls -la out/transformers-wasm/

# Check worker configuration
grep "localModelPath" workers/stt-worker.ts

# Check model ID consistency
grep "MODEL_ID" config/model.config.js
grep "MODEL_ID" contexts/TranscriptionContext.tsx
```

### Transcription not working

1. Check browser console for errors
2. Verify WebAssembly support in browser
3. Check Network tab — WASM files should load without errors
4. Try smaller model first (`whisper-tiny`)

---

## Build Environment Requirements

| Requirement | Detail |
|---|---|
| Internet access | `huggingface.co` for model downloads |
| Disk space | 500MB+ free |
| First build time | 5-10 min (model download) |
| Subsequent builds | 2-3 min (models cached) |

### CI/CD (GitHub Actions)

```yaml
- name: Build
  run: yarn build
  timeout-minutes: 15  # Allow time for model download

- name: Deploy
  run: wrangler pages deploy out
```

---

## Performance Benchmarks

### Model Loading (first time, cold start)

| Model | Load Time |
|---|---|
| whisper-tiny | 5-10 seconds |
| whisper-base | 10-15 seconds |
| whisper-small | 30-60 seconds |

After first load, models are cached by the browser — subsequent loads are instant.

### Transcription Speed

| Model | Speed | Example |
|---|---|---|
| whisper-tiny | ~1x real-time | 1 min audio = 1 min processing |
| whisper-base | ~2-3x real-time | 1 min audio = 2-3 min processing |
| whisper-small | ~5-10x real-time | 1 min audio = 5-10 min processing |

### Typical Usage

- Audio files: 4-10 minutes
- Segments per file: 20-100
- PCM data held in memory during session

---

## Rollback Plan

If production issues occur:

1. **Immediate**: Revert to previous Cloudflare Pages deployment
2. **Debug**: Check browser console and build logs
3. **Fallback**: Remove model bundling — revert `stt-worker.ts` to load from HuggingFace CDN directly (CORS errors expected on Cloudflare Workers, acceptable on other hosts)

---

## Success Checklist

- [ ] `yarn check` passes (typecheck + lint)
- [ ] Build completes without errors
- [ ] Model files present in `out/models/`
- [ ] WASM files present in `out/transformers-wasm/`
- [ ] Deployment succeeds without size errors
- [ ] No CORS errors in browser console
- [ ] Models load from same origin
- [ ] Transcription works end-to-end
- [ ] Practice mode scoring works correctly
