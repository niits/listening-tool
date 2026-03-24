/**
 * Download Whisper model files from HuggingFace
 * 
 * This script automatically fetches all available files from HuggingFace
 * and downloads them to avoid CORS issues when loading from HuggingFace CDN.
 * It also copies WASM files needed by transformers.js.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');
const { execSync } = require('child_process');
const { MODEL_ID } = require('../config/model.config.js');

// Model configuration
// NOTE: MODEL_ID is imported from config/model.config.js to ensure
// consistency with the application code in contexts/TranscriptionContext.tsx
const MODEL_REVISION = 'main';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;
const API_URL = `https://huggingface.co/api/models/${MODEL_ID}/tree/${MODEL_REVISION}`;

// Output directory (Next.js public directory)
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_ID);
const WASM_OUTPUT_DIR = path.join(__dirname, '../public/transformers-wasm');

/**
 * Fetch the list of files from HuggingFace API
 */
function fetchFileList() {
  return new Promise((resolve, reject) => {
    console.log('Fetching file list from HuggingFace API...');
    console.log(`API URL: ${API_URL}`);
    console.log('');

    https.get(API_URL, (response) => {
      let data = '';

      response.on('data', (chunk) => {
        data += chunk;
      });

      response.on('end', () => {
        try {
          const files = JSON.parse(data);

          // Filter to get only files (not directories) and exclude large checkpoint files
          const fileList = files
            .filter(item => item.type === 'file')
            .map(item => item.path)
            .filter(path => {
              // Exclude git-related files and very large checkpoint files
              return !path.startsWith('.git') &&
                !path.includes('checkpoint') &&
                !path.endsWith('.git');
            });

          console.log(`Found ${fileList.length} files to download`);
          resolve(fileList);
        } catch (error) {
          reject(new Error(`Failed to parse API response: ${error.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Copy WASM files from node_modules to public directory
 */
function copyWasmFiles() {
  console.log('');
  console.log('Copying WASM files...');
  console.log('');

  const wasmSourceDir = path.join(__dirname, '../node_modules/@xenova/transformers/dist');
  const wasmFiles = [
    'ort-wasm.wasm',
    'ort-wasm-simd.wasm',
    'ort-wasm-threaded.wasm',
    'ort-wasm-simd-threaded.wasm',
  ];

  // Create WASM output directory
  if (!fs.existsSync(WASM_OUTPUT_DIR)) {
    fs.mkdirSync(WASM_OUTPUT_DIR, { recursive: true });
  }

  for (const file of wasmFiles) {
    const src = path.join(wasmSourceDir, file);
    const dest = path.join(WASM_OUTPUT_DIR, file);

    try {
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`✓ Copied: ${file}`);
      } else {
        console.log(`⚠ Not found: ${file}`);
      }
    } catch (error) {
      console.error(`✗ Failed to copy ${file}:`, error.message);
    }
  }

  console.log('');
  console.log('WASM files copied successfully!');
}

/**
 * Download a file from URL to destination
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    // Create directory if it doesn't exist
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Skip if file already exists
    if (fs.existsSync(dest)) {
      console.log(`✓ Already exists: ${path.relative(OUTPUT_DIR, dest)}`);
      resolve({ status: 'exists' });
      return;
    }

    console.log(`Downloading: ${path.relative(OUTPUT_DIR, dest)}`);

    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      // Handle redirects (301 Moved Permanently, 302 Found, 307 Temporary Redirect, 308 Permanent Redirect)
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
        const redirectUrl = response.headers.location;
        https.get(redirectUrl, (redirectResponse) => {
          // Handle 404 - file doesn't exist on server (this is OK, not all files exist for all models)
          if (redirectResponse.statusCode === 404) {
            fs.unlink(dest, () => { });
            console.log(`⚠ Not available: ${path.relative(OUTPUT_DIR, dest)} (404)`);
            resolve({ status: 'not_found' });
            return;
          }

          if (redirectResponse.statusCode !== 200) {
            fs.unlink(dest, () => { });
            reject(new Error(`HTTP ${redirectResponse.statusCode}`));
            return;
          }

          const totalSize = parseInt(redirectResponse.headers['content-length'], 10);
          let downloadedSize = 0;

          redirectResponse.on('data', (chunk) => {
            downloadedSize += chunk.length;
            const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
            process.stdout.write(`\r  Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
          });

          redirectResponse.pipe(file);

          file.on('finish', () => {
            file.close();
            console.log(''); // New line after progress
            console.log(`✓ Downloaded: ${path.relative(OUTPUT_DIR, dest)}`);
            resolve({ status: 'success' });
          });
        }).on('error', (err) => {
          fs.unlink(dest, (unlinkErr) => {
            if (unlinkErr) {
              console.error(`  Warning: Failed to cleanup ${dest}:`, unlinkErr.message);
            }
          });
          reject(err);
        });
        return;
      }

      if (response.statusCode === 404) {
        fs.unlink(dest, () => { });
        console.log(`⚠ Not available: ${path.relative(OUTPUT_DIR, dest)} (404)`);
        resolve({ status: 'not_found' });
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlink(dest, () => { });
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'], 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize) {
          const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\r  Progress: ${progress}% (${(downloadedSize / 1024 / 1024).toFixed(1)}MB / ${(totalSize / 1024 / 1024).toFixed(1)}MB)`);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        if (totalSize) {
          console.log(''); // New line after progress
        }
        console.log(`✓ Downloaded: ${path.relative(OUTPUT_DIR, dest)}`);
        resolve({ status: 'success' });
      });
    }).on('error', (err) => {
      fs.unlink(dest, (unlinkErr) => {
        if (unlinkErr) {
          console.error(`  Warning: Failed to cleanup ${dest}:`, unlinkErr.message);
        }
      });
      reject(err);
    });
  });
}

const BUCKET_NAME = 'whisper-models';
const CONTENT_TYPES = {
  '.json': 'application/json',
  '.onnx': 'application/octet-stream',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain',
  '.model': 'application/octet-stream',
};

function getContentType(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

function getAllLocalFiles(dir, results = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) getAllLocalFiles(full, results);
    else results.push(full);
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

function uploadFileToR2(localPath) {
  const relativePath = path.relative(path.join(__dirname, '../public/models'), localPath);
  const r2Key = relativePath.split(path.sep).join('/');
  const contentType = getContentType(localPath);
  const sizeMB = (fs.statSync(localPath).size / 1024 / 1024).toFixed(1);

  process.stdout.write(`Uploading: ${r2Key} (${sizeMB}MB)...`);
  execSync(
    `wrangler r2 object put "${BUCKET_NAME}/${r2Key}" --file "${localPath}" --content-type "${contentType}" --cache-control "public, max-age=31536000, immutable"`,
    { stdio: 'pipe' }
  );
  console.log(' done');
}

/**
 * Main function:
 *  - R2 mode: check R2 first, only download files missing from R2, upload them, remove locals
 *  - Local mode: download files missing locally, keep for bundling
 */
async function downloadModels() {
  const useR2 = !!process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL;

  console.log('='.repeat(60));
  console.log(`Whisper model: ${MODEL_ID}`);
  console.log(useR2
    ? 'R2 mode — skipping files already in R2, uploading new ones'
    : 'Local mode — bundling model files into artifact');
  console.log('='.repeat(60));
  console.log('');

  // Fetch file list from HuggingFace API
  let fileList;
  try {
    fileList = await fetchFileList();
  } catch (error) {
    console.error('✗ Failed to fetch file list from HuggingFace:', error.message);
    copyWasmFiles();
    console.log('\n' + '='.repeat(60));
    console.log('Build preparation complete (WASM only — model will load remotely at runtime)');
    console.log('='.repeat(60));
    return;
  }

  // In R2 mode: determine which files are already in R2 and skip them
  let filesToDownload = fileList;
  let r2SkipCount = 0;

  if (useR2) {
    console.log('Checking R2 for existing files...');
    filesToDownload = [];
    for (const file of fileList) {
      const r2Key = `${MODEL_ID}/${file}`;
      if (existsInR2(r2Key)) {
        console.log(`✓ Already in R2: ${r2Key}`);
        r2SkipCount++;
      } else {
        filesToDownload.push(file);
      }
    }
    console.log('');

    if (filesToDownload.length === 0) {
      console.log(`✓ All ${fileList.length} model files already in R2 — skipping download`);
      copyWasmFiles();
      console.log('\n' + '='.repeat(60));
      console.log('Build preparation complete!');
      console.log('='.repeat(60));
      return;
    }

    console.log(`${r2SkipCount} files already in R2. Downloading ${filesToDownload.length} new files...`);
  }

  console.log('');
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  let successCount = 0, existsCount = 0, notFoundCount = 0, failCount = 0;

  for (const file of filesToDownload) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(OUTPUT_DIR, file);
    try {
      const result = await downloadFile(url, dest);
      if (result.status === 'success') successCount++;
      else if (result.status === 'exists') existsCount++;
      else if (result.status === 'not_found') notFoundCount++;
    } catch (error) {
      console.error(`✗ Failed to download ${file}:`, error.message);
      failCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Downloaded: ${successCount}, cached locally: ${existsCount}, not found: ${notFoundCount}, failed: ${failCount}`);
  console.log('='.repeat(60));

  // Verify critical files (only for those we actually downloaded)
  if (!useR2 || filesToDownload.length > 0) {
    const criticalFiles = ['config.json', 'tokenizer_config.json', 'tokenizer.json'];
    const criticalToCheck = useR2
      ? criticalFiles.filter(f => filesToDownload.includes(f))
      : criticalFiles;

    if (criticalToCheck.length > 0) {
      console.log('');
      console.log('Verifying critical files...');
      let allPresent = true;
      for (const file of criticalToCheck) {
        const filePath = path.join(OUTPUT_DIR, file);
        if (fs.existsSync(filePath)) {
          console.log(`✓ ${file}`);
        } else {
          console.log(`✗ MISSING: ${file}`);
          allPresent = false;
        }
      }
      if (!allPresent) {
        console.log('\n✗ Build failed: critical model files are missing.');
        process.exit(1);
      }
    }
  }

  // Upload newly downloaded files to R2, then remove locals
  if (useR2 && fs.existsSync(OUTPUT_DIR)) {
    console.log('');
    console.log('='.repeat(60));
    console.log(`Uploading ${filesToDownload.length} new files to R2 bucket: ${BUCKET_NAME}`);
    console.log('='.repeat(60));
    console.log('');

    let uploaded = 0, failed = 0;
    for (const localPath of getAllLocalFiles(OUTPUT_DIR)) {
      try {
        uploadFileToR2(localPath);
        uploaded++;
      } catch (err) {
        console.error(` ✗ failed: ${err.stderr?.toString() || err.message}`);
        failed++;
      }
    }

    console.log('');
    console.log(`R2 upload: ${uploaded} uploaded, ${failed} failed`);
    if (failed > 0) {
      console.error('✗ Upload failures. Build aborted.');
      process.exit(1);
    }

    fs.rmSync(OUTPUT_DIR, { recursive: true, force: true });
    console.log('✓ Local model files removed (served from R2)');
  }

  copyWasmFiles();

  console.log('');
  console.log('='.repeat(60));
  console.log('Build preparation complete!');
  console.log('='.repeat(60));
}

// Run the download
downloadModels().catch((error) => {
  console.error('Download failed:', error);
  process.exit(1);
});

