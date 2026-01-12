/**
 * Download Whisper model files from HuggingFace
 * 
 * This script downloads the required model files during build time
 * to avoid CORS issues when loading from HuggingFace CDN.
 * It also copies WASM files needed by transformers.js.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

// Model configuration
const MODEL_ID = 'Xenova/whisper-base.en';
const MODEL_REVISION = 'main';
const BASE_URL = `https://huggingface.co/${MODEL_ID}/resolve/${MODEL_REVISION}`;

// Output directory (Next.js public directory)
const OUTPUT_DIR = path.join(__dirname, '../public/models', MODEL_ID);
const WASM_OUTPUT_DIR = path.join(__dirname, '../public/transformers-wasm');

// Required model files for Whisper
const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'preprocessor_config.json',
  'tokenizer_config.json',
  'tokenizer.json',
  'vocab.json',
  'merges.txt',
  // ONNX model files (quantized version for better performance)
  'onnx/model_quantized.onnx',
  'onnx/model.onnx_data',
];

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
      resolve();
      return;
    }

    console.log(`Downloading: ${path.relative(OUTPUT_DIR, dest)}`);
    
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 302 || response.statusCode === 301) {
        const redirectUrl = response.headers.location;
        https.get(redirectUrl, (redirectResponse) => {
          if (redirectResponse.statusCode !== 200) {
            reject(new Error(`Failed to download ${url}: ${redirectResponse.statusCode}`));
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
            resolve();
          });
        }).on('error', (err) => {
          fs.unlink(dest, () => {});
          reject(err);
        });
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
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
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

/**
 * Main function to download all model files
 */
async function downloadModels() {
  console.log('='.repeat(60));
  console.log(`Downloading Whisper model: ${MODEL_ID}`);
  console.log(`Output directory: ${OUTPUT_DIR}`);
  console.log('='.repeat(60));
  console.log('');

  // Create output directory
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  // Download each file
  let successCount = 0;
  let failCount = 0;
  
  for (const file of MODEL_FILES) {
    const url = `${BASE_URL}/${file}`;
    const dest = path.join(OUTPUT_DIR, file);
    
    try {
      await downloadFile(url, dest);
      successCount++;
    } catch (error) {
      console.error(`✗ Failed to download ${file}:`, error.message);
      failCount++;
    }
  }

  console.log('');
  console.log('='.repeat(60));
  console.log(`Model download complete! (${successCount} succeeded, ${failCount} failed)`);
  console.log('='.repeat(60));
  
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

