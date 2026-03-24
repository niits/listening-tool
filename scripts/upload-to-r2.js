/**
 * Upload Whisper model files to Cloudflare R2
 *
 * Prerequisites:
 *   1. Run `node scripts/download-models.js` first to download model files locally
 *   2. Ensure `wrangler` is authenticated (`wrangler login`)
 *   3. R2 bucket `whisper-models` must exist (`wrangler r2 bucket create whisper-models`)
 *
 * Usage:
 *   node scripts/upload-to-r2.js
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { MODEL_ID } = require('../config/model.config.js');

const BUCKET_NAME = 'whisper-models';
const LOCAL_MODEL_DIR = path.join(__dirname, '../public/models', MODEL_ID);

const CONTENT_TYPES = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.model': 'application/octet-stream',
};

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return CONTENT_TYPES[ext] || 'application/octet-stream';
}

function getAllFiles(dir, baseDir = dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function existsInR2(r2Key) {
  try {
    execSync(`wrangler r2 object head "${BUCKET_NAME}/${r2Key}"`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function uploadFile(localPath, r2Key) {
  if (existsInR2(r2Key)) {
    console.log(`✓ Already in R2, skipping: ${r2Key}`);
    return 'skipped';
  }

  const contentType = getContentType(localPath);
  const fileSize = fs.statSync(localPath).size;
  const fileSizeMB = (fileSize / 1024 / 1024).toFixed(1);

  process.stdout.write(`Uploading: ${r2Key} (${fileSizeMB}MB)...`);

  const cmd = [
    'wrangler r2 object put',
    `"${BUCKET_NAME}/${r2Key}"`,
    `--file "${localPath}"`,
    `--content-type "${contentType}"`,
    `--cache-control "${CACHE_CONTROL}"`,
  ].join(' ');

  execSync(cmd, { stdio: 'pipe' });
  console.log(' done');
  return 'uploaded';
}

async function main() {
  console.log('='.repeat(60));
  console.log(`Uploading ${MODEL_ID} to R2 bucket: ${BUCKET_NAME}`);
  console.log('='.repeat(60));
  console.log('');

  if (!fs.existsSync(LOCAL_MODEL_DIR)) {
    console.error(`✗ Model directory not found: ${LOCAL_MODEL_DIR}`);
    console.error('Run `node scripts/download-models.js` first.');
    process.exit(1);
  }

  const files = getAllFiles(LOCAL_MODEL_DIR);
  if (files.length === 0) {
    console.error('✗ No files found in model directory.');
    process.exit(1);
  }

  console.log(`Found ${files.length} files to upload.\n`);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const localPath of files) {
    const relativePath = path.relative(path.join(__dirname, '../public/models'), localPath);
    const r2Key = relativePath.split(path.sep).join('/');

    try {
      const result = uploadFile(localPath, r2Key);
      if (result === 'skipped') skipped++;
      else uploaded++;
    } catch (err) {
      console.error(`\n✗ Failed: ${r2Key}`);
      console.error(`  ${err.message}`);
      failed++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Upload complete: ${uploaded} uploaded, ${skipped} skipped (already in R2), ${failed} failed`);
  console.log('='.repeat(60));

  if (failed > 0) {
    process.exit(1);
  }
}

main();
