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
            fs.unlink(dest, () => {});
            console.log(`⚠ Not available: ${path.relative(OUTPUT_DIR, dest)} (404)`);
            resolve({ status: 'not_found' });
            return;
          }
          
          if (redirectResponse.statusCode !== 200) {
            fs.unlink(dest, () => {});
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
        fs.unlink(dest, () => {});
        console.log(`⚠ Not available: ${path.relative(OUTPUT_DIR, dest)} (404)`);
        resolve({ status: 'not_found' });
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
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

/**
 * Main function to download all model files
 */
async function downloadModels() {
  // When R2 is configured, models are served from R2 — no need to bundle locally.
  // Only WASM files (small, under 25MB) still need to be copied to public/.
  if (process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL) {
    console.log('='.repeat(60));
    console.log(`R2 model URL configured: ${process.env.NEXT_PUBLIC_R2_MODEL_BASE_URL}`);
    console.log('Skipping model download — copying WASM files only.');
    console.log('='.repeat(60));
    console.log('');
    copyWasmFiles();
    console.log('');
    console.log('='.repeat(60));
    console.log('Build preparation complete (WASM only — models served from R2)');
    console.log('='.repeat(60));
    return;
  }

  console.log('='.repeat(60));
  console.log(`Downloading Whisper model: ${MODEL_ID}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Fetch file list from HuggingFace API
  let fileList;
  try {
    fileList = await fetchFileList();
  } catch (error) {
    console.error('✗ Failed to fetch file list from HuggingFace:', error.message);
    console.log('');
    console.log('⚠ Falling back to downloading with remote model loading at runtime');
    console.log('');
    
    // Copy WASM files even if model download fails
    copyWasmFiles();
    
    console.log('');
    console.log('='.repeat(60));
    console.log('Build preparation complete (WASM only)');
    console.log('='.repeat(60));
    return;
  }

  console.log('');
  console.log('Starting downloads...');
  console.log('');

  // Download each file
  let successCount = 0;
  let existsCount = 0;
  let notFoundCount = 0;
  let failCount = 0;
  
  for (const file of fileList) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(OUTPUT_DIR, file);
    
    try {
      const result = await downloadFile(url, dest);
      if (result.status === 'success') {
        successCount++;
      } else if (result.status === 'exists') {
        existsCount++;
      } else if (result.status === 'not_found') {
        notFoundCount++;
      }
    } catch (error) {
      console.error(`✗ Failed to download ${file}:`, error.message);
      failCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('Model download summary:');
  console.log(`  Total files: ${fileList.length}`);
  console.log(`  Downloaded: ${successCount}`);
  console.log(`  Already existed: ${existsCount}`);
  console.log(`  Not available (404): ${notFoundCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log('='.repeat(60));
  
  // Verify critical files exist
  const criticalFiles = [
    'config.json',
    'tokenizer_config.json',
    'tokenizer.json',
  ];
  
  console.log('');
  console.log('Verifying critical files...');
  let allCriticalPresent = true;
  
  for (const file of criticalFiles) {
    const filePath = path.join(OUTPUT_DIR, file);
    if (fs.existsSync(filePath)) {
      console.log(`✓ ${file}`);
    } else {
      console.log(`✗ MISSING: ${file}`);
      allCriticalPresent = false;
    }
  }
  
  // Check for at least one ONNX model file
  const onnxDir = path.join(OUTPUT_DIR, 'onnx');
  if (fs.existsSync(onnxDir)) {
    const onnxFiles = fs.readdirSync(onnxDir).filter(f => f.endsWith('.onnx'));
    if (onnxFiles.length > 0) {
      console.log(`✓ Found ${onnxFiles.length} ONNX model file(s)`);
    } else {
      console.log(`✗ MISSING: No ONNX model files found`);
      allCriticalPresent = false;
    }
  } else {
    console.log(`⚠ ONNX directory not found (may download on first use)`);
  }
  
  if (!allCriticalPresent) {
    console.log('');
    console.log('✗ Build failed: critical model files are missing.');
    console.log('Run the build again with network access to download model files.');
    process.exit(1);
  }
  
  // Copy WASM files
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

