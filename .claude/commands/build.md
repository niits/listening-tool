Run the full production build (downloads Whisper models then builds Next.js):

```bash
yarn build
```

After build, verify:
- `out/models/Xenova/whisper-base.en/` exists with model files (~140MB)
- `out/transformers-wasm/` exists with WASM files (~37MB)
- No TypeScript or build errors

See `docs/testing.md` for full verification steps and troubleshooting.
