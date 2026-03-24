/**
 * Download Whisper model files and prepare for build.
 *
 * Modes:
 *  - R2 mode  (CLOUDFLARE_ACCOUNT_ID + R2_ACCESS_KEY_ID + R2_SECRET_ACCESS_KEY):
 *    Streams files directly HuggingFace → R2. No local disk used for models.
 *  - Local mode (no R2 credentials):
 *    Downloads files to public/models/ for bundling in the static artifact.
 *
 * R2 credentials — add to .env.local (never commit):
 *   CLOUDFLARE_ACCOUNT_ID=...
 *   R2_ACCESS_KEY_ID=...       (from R2 → Manage R2 API Tokens)
 *   R2_SECRET_ACCESS_KEY=...
 */

const crypto = require('crypto');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { MODEL_ID } = require('../config/model.config.js');

const MODEL_REVISION = 'main';
const HF_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;
const HF_API = `https://huggingface.co/api/models/${MODEL_ID}/tree/${MODEL_REVISION}`;
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_ID);
const WASM_OUTPUT_DIR = path.join(__dirname, '../public/transformers-wasm');
const BUCKET_NAME = 'whisper-models';
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
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

// ── AWS SigV4 signing for R2 S3-compatible API ─────────────────────────────
// extraHeaders: plain object of additional headers to sign (e.g. { host })
// Always adds x-amz-date and x-amz-content-sha256 (UNSIGNED-PAYLOAD).
function sigV4(method, r2Path, extraHeaders, secretKey, accessKeyId) {
  const now = new Date();
  const datetime = now.toISOString().replace(/[:-]/g, '').replace(/\.\d{3}/, '');
  const dateStr = datetime.slice(0, 8);

  const toSign = {
    ...extraHeaders,
    'x-amz-content-sha256': 'UNSIGNED-PAYLOAD',
    'x-amz-date': datetime,
  };

  const entries = Object.entries(toSign).sort(([a], [b]) => a.localeCompare(b));
  const canonicalHeaders = entries.map(([k, v]) => `${k}:${v}`).join('\n') + '\n';
  const signedHeaders = entries.map(([k]) => k).join(';');
  const canonicalReq = [method, r2Path, '', canonicalHeaders, signedHeaders, 'UNSIGNED-PAYLOAD'].join('\n');

  const credentialScope = `${dateStr}/auto/s3/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256', datetime, credentialScope,
    crypto.createHash('sha256').update(canonicalReq).digest('hex'),
  ].join('\n');

  const signingKey = ['auto', 's3', 'aws4_request'].reduce(
    (key, part) => crypto.createHmac('sha256', key).update(part).digest(),
    crypto.createHmac('sha256', `AWS4${secretKey}`).update(dateStr).digest()
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    ...Object.fromEntries(entries),
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ── Check if object already exists in R2 ──────────────────────────────────
function existsInR2(r2Key, { accountId, accessKeyId, secretKey }) {
  return new Promise((resolve) => {
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const r2Path = `/${BUCKET_NAME}/${r2Key}`;
    const headers = sigV4('HEAD', r2Path, { host }, secretKey, accessKeyId);
    const req = https.request(
      { hostname: host, path: r2Path, method: 'HEAD', headers },
      (res) => { resolve(res.statusCode === 200); res.resume(); }
    );
    req.on('error', () => resolve(false));
    req.end();
  });
}

// ── Stream HuggingFace → R2 directly ──────────────────────────────────────
async function streamToR2(hfUrl, r2Key, { accountId, accessKeyId, secretKey }) {
  const res = await get(hfUrl);
  if (res.statusCode === 404) { res.resume(); return 'not_found'; }
  if (res.statusCode !== 200) { res.resume(); throw new Error(`HF HTTP ${res.statusCode}`); }

  const contentLength = parseInt(res.headers['content-length'], 10);
  if (!contentLength) throw new Error('content-length missing — cannot stream to R2');

  const host = `${accountId}.r2.cloudflarestorage.com`;
  const r2Path = `/${BUCKET_NAME}/${r2Key}`;
  const type = contentType(r2Key);
  const signed = sigV4('PUT', r2Path, { host }, secretKey, accessKeyId);

  await new Promise((resolve, reject) => {
    const req = https.request({
      hostname: host, path: r2Path, method: 'PUT',
      headers: {
        ...signed,
        'content-type': type,
        'content-length': contentLength,
        'cache-control': CACHE_CONTROL,
      },
    }, (r2Res) => {
      let body = '';
      r2Res.on('data', c => body += c);
      r2Res.on('end', () => {
        if (r2Res.statusCode >= 200 && r2Res.statusCode < 300) resolve();
        else reject(new Error(`R2 PUT ${r2Res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);

    let done = 0;
    res.on('data', chunk => {
      done += chunk.length;
      process.stdout.write(`\r  ${((done / contentLength) * 100).toFixed(1)}% (${(done / 1048576).toFixed(1)}/${(contentLength / 1048576).toFixed(1)} MB)`);
    });
    res.on('end', () => process.stdout.write('\n'));
    res.pipe(req);
  });

  return 'uploaded';
}

// ── Download to local disk (local mode) ───────────────────────────────────
async function downloadLocal(hfUrl, dest) {
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
      if (total) process.stdout.write(`\r  ${((done / total) * 100).toFixed(1)}% (${(done / 1048576).toFixed(1)}/${(total / 1048576).toFixed(1)} MB)`);
    });
    res.pipe(file);
    file.on('finish', () => { if (total) process.stdout.write('\n'); resolve(); });
    file.on('error', reject);
  });

  return 'downloaded';
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
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretKey = process.env.R2_SECRET_ACCESS_KEY;
  const creds = { accountId, accessKeyId, secretKey };
  const useR2 = !!(accountId && accessKeyId && secretKey);

  console.log('='.repeat(60));
  console.log(`Model: ${MODEL_ID}`);
  console.log(useR2 ? `R2 mode  → streaming HuggingFace → ${BUCKET_NAME}` : 'Local mode → bundling into artifact');
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

      const exists = await existsInR2(r2Key, creds);
      if (exists) { console.log('skip'); skipped++; continue; }

      console.log('uploading');
      try {
        const status = await streamToR2(`${HF_BASE}/${file}`, r2Key, creds);
        if (status === 'not_found') console.log(`  ⚠ not on HuggingFace`);
        else { console.log(`  ✓ done`); uploaded++; }
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        failed++;
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
        const status = await downloadLocal(`${HF_BASE}/${file}`, dest);
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
