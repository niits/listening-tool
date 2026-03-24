/**
 * Download Whisper model files and prepare for build.
 *
 * Modes:
 *  - R2 mode  (NEXT_PUBLIC_R2_MODEL_BASE_URL is set):
 *    Downloads each file to a temp path, uploads via wrangler, removes temp.
 *    Requires: wrangler authenticated (wrangler login)
 *  - Local mode (no env var):
 *    Downloads files to public/models/ for bundling in the static artifact.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const os = require('os');
const path = require('path');
const { MODEL_ID } = require('../config/model.config.js');

const MODEL_REVISION = 'main';
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;
const HF_API  = `https://huggingface.co/api/models/${MODEL_ID}/tree/${MODEL_REVISION}`;
const OUTPUT_DIR     = path.join(__dirname, '../public/models', MODEL_ID);
const WASM_OUTPUT_DIR = path.join(__dirname, '../public/transformers-wasm');
const BUCKET_NAME   = 'whisper-models';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPES = {
  '.json':  'application/json',
  '.onnx':  'application/octet-stream',
  '.wasm':  'application/wasm',
  '.txt':   'text/plain',
  '.md':    'text/markdown',
  '.model': 'application/octet-stream',
};

function contentType(file) {
  return CONTENT_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

// ── HTTP GET following redirects (handles relative Location headers) ───────
function get(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location;
        res.resume();
        get(loc.startsWith('http') ? loc : `https://huggingface.co${loc}`)
          .then(resolve).catch(reject);
        return;
      }
      resolve(res);
    }).on('error', reject);
  });
}

// ── Fetch model file list from HuggingFace API ─────────────────────────────
async function fetchFileList() {
  process.stdout.write('Fetching file list from HuggingFace... ');
  const res = await get(HF_API);
  const data = await new Promise((resolve, reject) => {
    let buf = '';
    res.on('data', c => buf += c);
    res.on('end', () => resolve(buf));
    res.on('error', reject);
  });
  const files = JSON.parse(data)
    .filter(f => f.type === 'file')
    .map(f => f.path)
    .filter(p => !p.startsWith('.git') && !p.includes('checkpoint'));
  console.log(`${files.length} files`);
  return files;
}

// ── Download a file from HuggingFace to local path ─────────────────────────
async function download(hfUrl, dest) {
  if (fs.existsSync(dest)) return 'exists';
  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const res = await get(hfUrl);
  if (res.statusCode === 404) { res.resume(); return 'not_found'; }
  if (res.statusCode !== 200) { res.resume(); throw new Error(`HTTP ${res.statusCode}`); }

  const total = parseInt(res.headers['content-length'], 10);
  let done = 0;
  const file = fs.createWriteStream(dest);

  await new Promise((resolve, reject) => {
    res.on('data', chunk => {
      done += chunk.length;
      if (total) process.stdout.write(
        `\r  ${((done / total) * 100).toFixed(1)}%` +
        ` (${(done / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB)`
      );
    });
    res.pipe(file);
    file.on('finish', () => { if (total) process.stdout.write('\n'); resolve(); });
    file.on('error', reject);
  });

  return 'downloaded';
}

// ── R2: check if object already exists ─────────────────────────────────────
function existsInR2(r2Key) {
  try {
    execSync(`wrangler r2 object head "${BUCKET_NAME}/${r2Key}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

// ── R2: upload local file then remove it ───────────────────────────────────
function uploadToR2(localPath, r2Key) {
  const type = contentType(r2Key);
  execSync(
    `wrangler r2 object put "${BUCKET_NAME}/${r2Key}"` +
    ` --file "${localPath}"` +
    ` --content-type "${type}"` +
    ` --cache-control "${CACHE_CONTROL}"`,
    { stdio: 'pipe' }
  );
}

// ── Copy WASM binaries from node_modules ──────────────────────────────────
function copyWasm() {
  console.log('\nCopying WASM files...');
  const src = path.join(__dirname, '../node_modules/@xenova/transformers/dist');
  if (!fs.existsSync(WASM_OUTPUT_DIR)) fs.mkdirSync(WASM_OUTPUT_DIR, { recursive: true });
  for (const f of ['ort-wasm.wasm', 'ort-wasm-simd.wasm', 'ort-wasm-threaded.wasm', 'ort-wasm-simd-threaded.wasm']) {
    const s = path.join(src, f);
    if (fs.existsSync(s)) { fs.copyFileSync(s, path.join(WASM_OUTPUT_DIR, f)); console.log(`  ✓ ${f}`); }
    else console.log(`  ⚠ not found: ${f}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  const useR2 = !!process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL;

  console.log('='.repeat(60));
  console.log(`Model: ${MODEL_ID}`);
  console.log(useR2 ? `R2 mode  → upload to ${BUCKET_NAME} via wrangler` : 'Local mode → bundle into artifact');
  console.log('='.repeat(60) + '\n');

  let fileList;
  try {
    fileList = await fetchFileList();
  } catch (err) {
    console.error('✗ Failed to fetch file list:', err.message);
    copyWasm();
    return;
  }

  if (useR2) {
    let uploaded = 0, skipped = 0, failed = 0;

    for (const file of fileList) {
      const r2Key = `${MODEL_ID}/${file}`;
      process.stdout.write(`  ${r2Key} ... `);

      if (existsInR2(r2Key)) {
        console.log('skip');
        skipped++;
        continue;
      }

      const tmp = path.join(os.tmpdir(), `whisper-model-${path.basename(file)}`);
      try {
        console.log('downloading');
        const status = await download(`${HF_BASE}/${file}`, tmp);

        if (status === 'not_found') {
          console.log('  ⚠ not on HuggingFace');
        } else {
          process.stdout.write('  uploading via wrangler...');
          uploadToR2(tmp, r2Key);
          console.log(' done');
          uploaded++;
        }
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        failed++;
      } finally {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Uploaded: ${uploaded}  Skipped: ${skipped}  Failed: ${failed}`);
    if (failed > 0) { console.error('✗ Upload failures. Build aborted.'); process.exit(1); }

  } else {
    if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    let downloaded = 0, cached = 0, notFound = 0, failed = 0;

    for (const file of fileList) {
      const dest = path.join(OUTPUT_DIR, file);
      console.log(`Downloading: ${file}`);
      try {
        const status = await download(`${HF_BASE}/${file}`, dest);
        if (status === 'downloaded') downloaded++;
        else if (status === 'exists') { console.log('  ✓ already exists'); cached++; }
        else { console.log('  ⚠ not available (404)'); notFound++; }
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        failed++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Downloaded: ${downloaded}  Cached: ${cached}  Not found: ${notFound}  Failed: ${failed}`);

    const critical = ['config.json', 'tokenizer_config.json', 'tokenizer.json'];
    const missing = critical.filter(f => !fs.existsSync(path.join(OUTPUT_DIR, f)));
    if (missing.length > 0) {
      console.error(`\n✗ Missing critical files: ${missing.join(', ')}`);
      process.exit(1);
    }
  }

  copyWasm();
  console.log('\n' + '='.repeat(60));
  console.log('Build preparation complete!');
  console.log('='.repeat(60));
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
