/**
 * Single source of truth for the Whisper model.
 * Change MODEL_ID here to switch models — all other code reads from this file.
 *
 * In production (Cloudflare Pages), model files are served via Pages Functions
 * that proxy requests to the R2 bucket. This avoids CORS issues and keeps
 * everything on the same origin.
 */

export const MODEL_ID = "Xenova/whisper-base.en";

/** Base URL for ONNX model files (config.json, tokenizer.json, onnx/*.onnx) */
export const MODEL_BASE_URL = "/models/";

/** Base URL for ONNX Runtime WASM binaries */
export const WASM_BASE_URL = "/transformers-wasm/";
