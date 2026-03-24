/**
 * Setup Cloudflare infrastructure for local development and production.
 *
 * What this script does:
 *  1. Verifies wrangler is installed and authenticated
 *  2. Creates R2 bucket "whisper-models" if it doesn't exist
 *  3. Enables public dev URL on the bucket
 *  4. Collects R2 API credentials (prompts if not already in .env.local)
 *  5. Writes all env vars to .env.local
 *  6. Configures CORS on the R2 bucket
 *  7. Creates Cloudflare Pages project if it doesn't exist
 *  8. Sets NEXT_PUBLIC_R2_MODEL_BASE_URL as a build env var in Pages
 *
 * Env vars written to .env.local:
 *   NEXT_PUBLIC_R2_MODEL_BASE_URL  — public URL for the browser to fetch models
 *   CLOUDFLARE_ACCOUNT_ID          — used by download-models.js for direct R2 upload
 *   R2_ACCESS_KEY_ID               — R2 API token key ID
 *   R2_SECRET_ACCESS_KEY           — R2 API token secret
 *
 * Create R2 API token at:
 *   Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token
 *   Permissions: Object Read & Write for bucket "whisper-models"
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BUCKET_NAME = 'whisper-models';
const PAGES_PROJECT = 'listening-tool';
const ENV_FILE = path.join(__dirname, '../.env.local');

function run(cmd, opts = {}) {
  return execSync(cmd, { encoding: 'utf8', stdio: 'pipe', ...opts });
}

function step(msg) {
  console.log(`\n→ ${msg}`);
}

// Synchronous stdin prompt (no async needed)
function prompt(question) {
  process.stdout.write(question);
  const buf = Buffer.alloc(1024);
  let str = '';
  try {
    let n;
    while ((n = fs.readSync(0, buf, 0, 1)) > 0) {
      const ch = buf.subarray(0, n).toString();
      str += ch;
      if (ch === '\n') break;
    }
  } catch { /* stdin may not be a tty */ }
  return str.trim();
}

// Read current .env.local into a key→value map
function readEnv() {
  if (!fs.existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    fs.readFileSync(ENV_FILE, 'utf8')
      .split('\n')
      .filter(l => l.includes('=') && !l.startsWith('#'))
      .map(l => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)])
  );
}

// Write key→value map back to .env.local
function writeEnv(vars) {
  const content = Object.entries(vars).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
  fs.writeFileSync(ENV_FILE, content);
}

// ── 1. Check wrangler ────────────────────────────────────────────────────────
step('Checking wrangler installation...');
try {
  const version = run('wrangler --version').trim();
  console.log(`  ${version}`);
} catch {
  console.error('  ✗ wrangler not found. Install it with: npm install -g wrangler');
  process.exit(1);
}

// ── 2. Check authentication + extract account ID ─────────────────────────────
step('Checking Cloudflare authentication...');
let detectedAccountId = null;
try {
  const whoami = run('wrangler whoami');
  // Account ID is a 32-char hex string
  const idMatch = whoami.match(/[0-9a-f]{32}/i);
  if (idMatch) detectedAccountId = idMatch[0];
  const nameMatch = whoami.match(/You are logged in with an (.+) token/i) ||
                    whoami.match(/account\s+(.+)/i);
  console.log(nameMatch ? `  Logged in (${nameMatch[1].trim()})` : '  Authenticated');
  if (detectedAccountId) console.log(`  Account ID: ${detectedAccountId}`);
} catch {
  console.error('  ✗ Not authenticated. Run: wrangler login');
  process.exit(1);
}

// ── 3. Create R2 bucket if missing ──────────────────────────────────────────
step(`Creating R2 bucket "${BUCKET_NAME}" (if not exists)...`);
try {
  const list = run('wrangler r2 bucket list');
  if (list.includes(BUCKET_NAME)) {
    console.log(`  ✓ Bucket "${BUCKET_NAME}" already exists`);
  } else {
    run(`wrangler r2 bucket create ${BUCKET_NAME}`);
    console.log(`  ✓ Bucket "${BUCKET_NAME}" created`);
  }
} catch (err) {
  console.error('  ✗ Failed to create bucket:', err.message);
  process.exit(1);
}

// ── 4. Enable / get public dev URL ──────────────────────────────────────────
step('Enabling public dev URL...');
let publicUrl = null;

try {
  const output = run(`wrangler r2 bucket dev-url enable ${BUCKET_NAME}`);
  console.log('  ' + output.trim().split('\n').join('\n  '));
  const match = output.match(/https?:\/\/[^\s]+/);
  if (match) publicUrl = match[0].replace(/\/$/, '');
} catch (err) {
  console.warn('  ⚠ Could not enable dev URL automatically:', err.stderr?.trim() || err.message);
}

if (!publicUrl) {
  try {
    const info = run(`wrangler r2 bucket dev-url get ${BUCKET_NAME}`);
    const match = info.match(/https?:\/\/[^\s]+/);
    if (match) publicUrl = match[0].replace(/\/$/, '');
  } catch { /* ignore */ }
}

if (!publicUrl) {
  console.error([
    '',
    '  ✗ Could not determine the public dev URL.',
    '  Run: wrangler r2 bucket dev-url enable ' + BUCKET_NAME,
    '  Then set manually in .env.local:',
    '    NEXT_PUBLIC_R2_MODEL_BASE_URL=https://<account-id>.r2.dev',
    '',
  ].join('\n'));
  process.exit(1);
}

console.log(`  Public URL: ${publicUrl}`);

// ── 5. Collect R2 API credentials ────────────────────────────────────────────
step('Collecting R2 API credentials...');
const currentEnv = readEnv();

let accountId = currentEnv.CLOUDFLARE_ACCOUNT_ID || detectedAccountId || '';
let accessKeyId = currentEnv.R2_ACCESS_KEY_ID || '';
let secretKey = currentEnv.R2_SECRET_ACCESS_KEY || '';

const alreadyHasCreds = accountId && accessKeyId && secretKey;

if (alreadyHasCreds) {
  console.log('  ✓ R2 credentials already present in .env.local');
} else {
  console.log([
    '',
    '  R2 API credentials are needed for direct uploads (download-models.js).',
    '  Create a token at:',
    '    Cloudflare Dashboard → R2 → Manage R2 API Tokens → Create API Token',
    '    Permissions: Object Read & Write  |  Bucket: ' + BUCKET_NAME,
    '',
  ].join('\n'));

  if (!accountId) {
    accountId = prompt('  CLOUDFLARE_ACCOUNT_ID : ');
  } else {
    console.log(`  CLOUDFLARE_ACCOUNT_ID : ${accountId} (auto-detected)`);
  }

  accessKeyId = prompt('  R2_ACCESS_KEY_ID      : ');
  secretKey   = prompt('  R2_SECRET_ACCESS_KEY  : ');

  if (!accountId || !accessKeyId || !secretKey) {
    console.warn('\n  ⚠ Credentials incomplete — skipping. Set them manually in .env.local.');
    accountId = accountId || '';
    accessKeyId = accessKeyId || '';
    secretKey = secretKey || '';
  }
}

// ── 6. Write .env.local ──────────────────────────────────────────────────────
step('Writing .env.local...');
const envVars = {
  ...currentEnv,
  NEXT_PUBLIC_R2_MODEL_BASE_URL: publicUrl,
  ...(accountId  && { CLOUDFLARE_ACCOUNT_ID: accountId }),
  ...(accessKeyId && { R2_ACCESS_KEY_ID: accessKeyId }),
  ...(secretKey   && { R2_SECRET_ACCESS_KEY: secretKey }),
};
writeEnv(envVars);
console.log('  ✓ .env.local updated');

// ── 7. Configure R2 CORS ────────────────────────────────────────────────────
step(`Configuring CORS on R2 bucket "${BUCKET_NAME}"...`);
const corsRules = JSON.stringify([
  {
    allowedOrigins: ['*'],
    allowedMethods: ['GET', 'HEAD'],
    allowedHeaders: ['*'],
    maxAgeSeconds: 86400,
  },
]);
const corsTmpFile = path.join(__dirname, '../.cors-rules-tmp.json');
try {
  fs.writeFileSync(corsTmpFile, corsRules);
  run(`wrangler r2 bucket cors put ${BUCKET_NAME} --file ${corsTmpFile}`);
  console.log('  ✓ CORS configured (GET/HEAD from any origin)');
} catch (err) {
  console.warn('  ⚠ Could not set CORS automatically:', err.stderr?.trim() || err.message);
  console.warn('  Set it manually in the Cloudflare R2 dashboard → CORS policy');
} finally {
  if (fs.existsSync(corsTmpFile)) fs.unlinkSync(corsTmpFile);
}

// ── 8. Create Pages project ──────────────────────────────────────────────────
step(`Creating Cloudflare Pages project "${PAGES_PROJECT}" (if not exists)...`);
try {
  const list = run('wrangler pages project list');
  if (list.includes(PAGES_PROJECT)) {
    console.log(`  ✓ Pages project "${PAGES_PROJECT}" already exists`);
  } else {
    run(`wrangler pages project create ${PAGES_PROJECT} --production-branch main`);
    console.log(`  ✓ Pages project "${PAGES_PROJECT}" created`);
  }
} catch (err) {
  console.warn('  ⚠ Could not verify/create Pages project:', err.stderr?.trim() || err.message);
  console.warn(`  Create manually: wrangler pages project create ${PAGES_PROJECT} --production-branch main`);
}

// ── 9. Set build env var in Pages ────────────────────────────────────────────
step(`Setting NEXT_PUBLIC_R2_MODEL_BASE_URL in Pages "${PAGES_PROJECT}" (production)...`);
try {
  run(
    `wrangler pages secret put NEXT_PUBLIC_R2_MODEL_BASE_URL --project-name ${PAGES_PROJECT} --env production`,
    { input: publicUrl + '\n' }
  );
  console.log('  ✓ Set in production environment');
} catch (err) {
  console.warn('  ⚠ Could not set automatically:', err.stderr?.trim() || err.message);
  console.warn('  Set manually: Settings → Environment variables → Add variable (Production)');
  console.warn(`    NEXT_PUBLIC_R2_MODEL_BASE_URL = ${publicUrl}`);
}

// ── Done ─────────────────────────────────────────────────────────────────────
console.log('\n' + '='.repeat(60));
console.log('Cloudflare setup complete!');
console.log('='.repeat(60));
console.log(`
  Bucket       : ${BUCKET_NAME}
  Dev URL      : ${publicUrl}
  Pages project: ${PAGES_PROJECT}
  Env file     : .env.local

Next steps:
  1. yarn build    # Download models → upload to R2 → build static site
  2. yarn deploy   # Deploy ./out to Cloudflare Pages
`);
