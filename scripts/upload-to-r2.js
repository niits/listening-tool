#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * upload-to-r2.js
 *
 * Downloads Whisper model files from HuggingFace and ONNX Runtime WASM
 * binaries from node_modules, then uploads them to the Cloudflare R2 bucket
 * "listening-tool-models".
 *
 * Usage:
 *   node scripts/upload-to-r2.js
 *
 * Prerequisites:
 *   - wrangler is authenticated (run `wrangler login` once)
 *   - node_modules is installed (yarn install)
 *   - R2 bucket exists (run `yarn r2:bucket` once)
 */

const { execFileSync } = require("child_process");
const { existsSync, mkdirSync, createWriteStream } = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");

const BUCKET = "listening-tool-models";
const MODEL_ID = "Xenova/whisper-base.en";
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/main`;
const TMP_DIR = path.join(__dirname, ".r2-upload-tmp");

// Model files to download from HuggingFace Hub
const MODEL_FILES = [
  "config.json",
  "tokenizer.json",
  "tokenizer_config.json",
  "preprocessor_config.json",
  "onnx/encoder_model.onnx",
  "onnx/decoder_model_merged.onnx",
  "onnx/encoder_model_quantized.onnx",
  "onnx/decoder_model_merged_quantized.onnx",
];

// WASM binaries + JS glue modules from node_modules/onnxruntime-web/dist.
// The .mjs files are dynamically import()-ed by onnxruntime-web and must be
// served with Content-Type: text/javascript — see functions/transformers-wasm/[[all]].js.
const WASM_FILES = [
  "ort-wasm-simd-threaded.wasm",
  "ort-wasm-simd-threaded.jsep.wasm",
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.jsep.mjs",
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    mkdirSync(path.dirname(dest), { recursive: true });
    const file = createWriteStream(dest);
    const get = (u) => {
      const client = u.startsWith("http://") ? http : https;
      client
        .get(u, (res) => {
          if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
            res.resume(); // drain the response body before following redirect
            // Resolve relative Location headers against the current URL
            const location = new URL(res.headers.location, u).toString();
            get(location);
            return;
          }
          if (res.statusCode !== 200) {
            reject(new Error(`HTTP ${res.statusCode} for ${u}`));
            return;
          }
          res.pipe(file);
          file.on("finish", () => file.close(resolve));
        })
        .on("error", reject);
    };
    get(url);
  });
}

function r2put(localPath, r2Key) {
  console.log(`  uploading → ${r2Key}`);
  const args = ["wrangler", "r2", "object", "put", `${BUCKET}/${r2Key}`, "-f", localPath, "--remote"];
  // Dynamic import() enforces MIME type — .mjs must be text/javascript
  if (localPath.endsWith(".mjs")) {
    args.push("--content-type", "text/javascript");
  }
  // Use execFileSync (not execSync) so arguments are never shell-interpolated
  execFileSync("npx", args, { stdio: "inherit" });
}

async function main() {
  mkdirSync(TMP_DIR, { recursive: true });

  // --- Upload model files ---
  console.log("\n=== Downloading model files from HuggingFace ===");
  for (const file of MODEL_FILES) {
    const url = `${HF_BASE}/${file}`;
    const localPath = path.join(TMP_DIR, "model", file);
    const r2Key = `models/${MODEL_ID}/${file}`;
    console.log(`Downloading ${file}...`);
    await download(url, localPath);
    r2put(localPath, r2Key);
  }

  // --- Upload WASM files ---
  console.log("\n=== Uploading WASM files from node_modules ===");
  const wasmDir = path.join(__dirname, "../node_modules/onnxruntime-web/dist");
  if (!existsSync(wasmDir)) {
    console.warn(
      "WARNING: could not find onnxruntime-web/dist — skipping WASM upload."
    );
    console.warn("Run `yarn install` first, then re-run this script.");
  } else {
    for (const file of WASM_FILES) {
      const localPath = path.join(wasmDir, file);
      if (!existsSync(localPath)) {
        console.warn(`  skipping ${file} (not found)`);
        continue;
      }
      r2put(localPath, `transformers-wasm/${file}`);
    }
  }

  console.log("\n=== Upload complete ===");
  console.log(`All files are now in R2 bucket: "${BUCKET}"`);
  console.log(
    "Deploy with: yarn build && npx wrangler pages deploy out"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
