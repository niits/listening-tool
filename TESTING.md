# Testing Guide for CORS Fix

This document provides guidance for testing the CORS fix that bundles Whisper models with the application.

## Overview

The fix downloads Whisper model files from HuggingFace during the build process and bundles them with the application to avoid CORS errors on Cloudflare Workers deployment.

## Pre-Build Testing

### 1. Test Download Script Locally

```bash
# Run the download script manually
node scripts/download-models.js
```

**Expected Output:**
- Download progress for each model file
- Success messages for each downloaded file
- WASM files copied from node_modules
- Final "Build preparation complete!" message

**Files Created:**
- `public/models/Xenova/whisper-base.en/config.json`
- `public/models/Xenova/whisper-base.en/generation_config.json`
- `public/models/Xenova/whisper-base.en/preprocessor_config.json`
- `public/models/Xenova/whisper-base.en/tokenizer_config.json`
- `public/models/Xenova/whisper-base.en/tokenizer.json`
- `public/models/Xenova/whisper-base.en/vocab.json`
- `public/models/Xenova/whisper-base.en/merges.txt`
- `public/models/Xenova/whisper-base.en/onnx/model_quantized.onnx`
- `public/models/Xenova/whisper-base.en/onnx/model.onnx_data`
- `public/transformers-wasm/*.wasm` (4 files)

**File Sizes (Approximate):**
- Total model files: ~140MB
- WASM files: ~37MB

### 2. Test Build Process

```bash
# Clean previous build
rm -rf out public/models public/transformers-wasm

# Run build (prebuild script runs automatically)
yarn build
```

**Expected Output:**
- Prebuild script executes before build
- Model files downloaded (or skipped if already present)
- WASM files copied
- Next.js build completes successfully
- Output directory contains all files

**Verify Output:**
```bash
# Check model files in output
ls -la out/models/Xenova/whisper-base.en/

# Check WASM files in output
ls -la out/transformers-wasm/

# Verify directory structure
tree out -L 3  # or use `find out -type f`
```

## Build Environment Requirements

### Network Access
The build environment **MUST** have access to:
- `huggingface.co` - For downloading model files

### Build Time
- **First build**: 5-10 minutes (includes model download)
- **Subsequent builds**: 2-3 minutes (models cached)

### Disk Space
- Minimum: 300MB free space
- Recommended: 500MB+ (for build artifacts and node_modules)

## Deployment Testing

### 1. Cloudflare Workers Deployment

```bash
# Build the application
yarn build

# Deploy to Cloudflare Workers
wrangler pages deploy out
```

**Deployment Checks:**
- Upload size should be ~180MB+ (includes models and WASM)
- Deployment should complete successfully
- No size limit errors (if errors occur, consider using R2 storage)

### 2. Runtime Testing

After deployment, test the application:

1. **Open the deployed application URL**
2. **Load an audio file**
3. **Verify model loading:**
   - Check browser console for errors
   - Should NOT see CORS errors
   - Should see model loading from same origin (e.g., `/models/Xenova/whisper-base.en/`)

4. **Verify WASM loading:**
   - Check Network tab in DevTools
   - WASM files should load from `/transformers-wasm/`
   - No CORS errors for WASM files

5. **Test transcription:**
   - Process an audio file
   - Verify segments are transcribed
   - Check transcription quality

## Troubleshooting

### Build Fails: "ENOTFOUND huggingface.co"

**Cause:** Build environment cannot access HuggingFace

**Solution:**
- Check firewall/proxy settings
- Ensure build environment has internet access
- Whitelist `huggingface.co` if needed

### Build Fails: "ENOSPC: no space left on device"

**Cause:** Insufficient disk space

**Solution:**
- Clean up disk space
- Remove unused Docker images/containers
- Increase disk allocation for build environment

### Deployment Fails: "Asset too large"

**Cause:** Model files exceed Cloudflare Workers size limits

**Solutions:**
1. Use a smaller model:
   ```javascript
   // In config/model.config.js
   const MODEL_ID = 'Xenova/whisper-tiny'; // ~40MB instead of ~140MB
   ```

2. Use Cloudflare R2 storage:
   - Upload models to R2 bucket
   - Serve with CORS headers
   - Update worker to load from R2

### Runtime: Still seeing CORS errors

**Possible Causes:**
1. Build script didn't run
2. Files not included in deployment
3. Incorrect model path configuration

**Debug Steps:**
```bash
# 1. Verify files in build output
ls -la out/models/
ls -la out/transformers-wasm/

# 2. Check worker configuration
grep "localModelPath" workers/stt-worker.ts
# Should show: env.localModelPath = "/models/";

# 3. Check model ID consistency
grep "MODEL_ID" config/model.config.js
grep "MODEL_ID" contexts/TranscriptionContext.tsx
# Both should match
```

### Transcription Not Working

**Check Browser Console:**
- Look for error messages
- Verify model files are loading (Network tab)
- Check for WebAssembly errors

**Common Issues:**
1. Browser doesn't support WebAssembly
2. WASM files missing or corrupted
3. Model files incomplete

**Solution:**
```bash
# Clean and rebuild
rm -rf out public/models public/transformers-wasm
yarn build
```

## Performance Expectations

### Model Loading (First Time)
- **whisper-tiny**: 5-10 seconds
- **whisper-base**: 10-15 seconds
- **whisper-small**: 30-60 seconds

### Transcription Speed
- **whisper-tiny**: ~1x real-time (1 minute audio = 1 minute processing)
- **whisper-base**: ~2-3x real-time
- **whisper-small**: ~5-10x real-time

## CI/CD Integration

If using CI/CD, ensure the pipeline:

1. Has internet access to HuggingFace
2. Has sufficient disk space (~500MB)
3. Runs `yarn build` (prebuild script runs automatically)
4. Includes `out/` directory in deployment artifact
5. Doesn't timeout during model download (increase timeout if needed)

### GitHub Actions Example

```yaml
- name: Build
  run: yarn build
  timeout-minutes: 15  # Allow time for model download

- name: Deploy
  run: wrangler pages deploy out
```

## Rollback Plan

If issues occur in production:

1. **Immediate:** Revert to previous deployment
2. **Debug:** Check logs and error messages
3. **Alternative:** Deploy with CDN-based model loading (original approach)
   - Revert changes to `workers/stt-worker.ts`
   - Remove prebuild script
   - Deploy and accept CORS errors (known issue)

## Success Criteria

✅ Build completes successfully  
✅ Model files present in `out/models/`  
✅ WASM files present in `out/transformers-wasm/`  
✅ Deployment succeeds without size errors  
✅ No CORS errors in browser console  
✅ Model loads from same origin  
✅ Transcription works correctly  
✅ Performance is acceptable  

## Questions or Issues?

If you encounter any issues not covered in this guide:

1. Check browser console for detailed error messages
2. Review build logs for download failures
3. Verify file sizes and checksums
4. Test with a smaller model first (whisper-tiny)
5. Report issues with full error logs and environment details
