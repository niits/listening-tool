# Testing and Deployment Guide

## Local Development

```bash
yarn dev
```

Access at `http://localhost:3000`. Hot reload enabled.

---

## Code Quality Checks

```bash
yarn typecheck    # TypeScript only
yarn lint         # ESLint
yarn lint:fix     # ESLint auto-fix
yarn format       # Prettier
```

Run `yarn typecheck && yarn lint` before every commit.

---

## Build

### 1. Download Whisper Models (prebuild)

```bash
node scripts/download-models.js
```

Downloads all ONNX + config files into `public/models/` and copies WASM binaries from `node_modules` into `public/transformers-wasm/`.

**Expected files after download:**
- `public/models/Xenova/whisper-base.en/` — ~140MB
- `public/transformers-wasm/` — ~37MB (4 WASM files)

**Requirements:** internet access to `huggingface.co`, 500MB+ free disk space.

### 2. Full Build

```bash
yarn build        # runs download-models.js then next build
```

Verify output:
```bash
ls out/models/Xenova/whisper-base.en/
ls out/transformers-wasm/
```

---

## Deploy to Cloudflare Pages

```bash
yarn build
wrangler pages deploy out
```

Expected upload: ~180MB (models + WASM + app).

### Post-Deploy Checklist

After deploying, verify in browser:

- [ ] No CORS errors in console
- [ ] Network tab: model files load from `/models/`, WASM from `/transformers-wasm/`
- [ ] Audio URL input → processing page loads
- [ ] Segments detected and transcribed
- [ ] Practice mode: scoring and word diff display correctly
- [ ] IndexedDB: audio and transcripts persisted across refresh

---

## Model Configuration

Change the model in one place only:

```typescript
// config/model.config.ts
export const MODEL_ID = 'Xenova/whisper-base.en';
```

| Model | Size | Notes |
|---|---|---|
| `Xenova/whisper-tiny` | ~40MB | Fastest, less accurate |
| `Xenova/whisper-base.en` | ~140MB | **Default** — good balance |
| `Xenova/whisper-small` | ~240MB | Better accuracy, slower |
| `Xenova/whisper-medium` | ~770MB | High accuracy, very slow |

---

## Cloudflare Pages — Yarn Version

Cloudflare Pages build image v3 **không tự detect yarn version từ `yarn.lock`**. Phải set thủ công:

**Trong Cloudflare Pages dashboard** → Settings → Environment variables:
```
YARN_VERSION = 4
```

Hoặc khai báo trong `package.json`:
```json
{
  "packageManager": "yarn@4.x.x"
}
```

Cả hai cách đều cần `YARN_VERSION` env var để Cloudflare Pages kích hoạt đúng phiên bản.

> Tham khảo: [Cloudflare Pages Build Image](https://developers.cloudflare.com/pages/configuration/build-image/)

## CI/CD (GitHub Actions)

```yaml
- name: Build
  run: yarn build
  timeout-minutes: 15   # Allow time for model download on first run

- name: Deploy
  run: wrangler pages deploy out
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
```

Cache `public/models/` between runs to avoid re-downloading 140MB on every build.

---

## Troubleshooting

**Build fails — cannot reach huggingface.co**
→ Check firewall/proxy; build environment needs outbound HTTPS to `huggingface.co`

**Build fails — no space left**
→ Need ~500MB free; clear Docker images or old build artifacts

**Deployment fails — asset too large**
→ Switch to a smaller model (`whisper-tiny`), or host models on Cloudflare R2 and set `NEXT_PUBLIC_R2_MODEL_BASE_URL` env var

**CORS errors in production**
→ Verify `out/models/` and `out/transformers-wasm/` exist; models must be served from the same origin as the app

**Transcription not working**
→ Check browser console; verify WebAssembly is enabled; try `whisper-tiny` first to isolate model size issues

---

## Performance Reference

### Model Load Time (cold start, first visit)

| Model | Time |
|---|---|
| whisper-tiny | 5–10s |
| whisper-base | 10–15s |
| whisper-small | 30–60s |

Subsequent loads are instant (browser caches model files).

### Transcription Speed

| Model | Speed ratio |
|---|---|
| whisper-tiny | ~1× realtime |
| whisper-base | ~2–3× realtime |
| whisper-small | ~5–10× realtime |

Example: a 5-minute audio file with `whisper-base` takes ~10–15 minutes to fully transcribe. Users can start practicing after the first 10 segments (~30–60s).
