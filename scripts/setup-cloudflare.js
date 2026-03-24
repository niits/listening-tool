/**
 * Setup Cloudflare infrastructure for local development and production.
 *
 * What this script does:
 *  1. Verifies wrangler is installed and authenticated
 *  2. Creates R2 bucket "whisper-models" if it doesn't exist
 *  3. Enables public dev URL on the bucket
 *  4. Writes NEXT_PUBLIC_R2_MODEL_BASE_URL to .env.local (local builds)
 *  5. Creates Cloudflare Pages project if it doesn't exist
 *  6. Sets NEXT_PUBLIC_R2_MODEL_BASE_URL as a build env var in Pages (CI builds)
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

// ── 1. Check wrangler ────────────────────────────────────────────────────────
step('Checking wrangler installation...');
try {
  const version = run('wrangler --version').trim();
  console.log(`  ${version}`);
} catch {
  console.error('  ✗ wrangler not found. Install it with: npm install -g wrangler');
  process.exit(1);
}

// ── 2. Check authentication ──────────────────────────────────────────────────
step('Checking Cloudflare authentication...');
try {
  const whoami = run('wrangler whoami');
  const match = whoami.match(/You are logged in with an (.+) token/i) ||
                whoami.match(/account\s+(.+)/i);
  console.log(match ? `  Logged in (${match[1].trim()})` : '  Authenticated');
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
  // Try enabling (idempotent — safe to run even if already enabled)
  const output = run(`wrangler r2 bucket dev-url enable ${BUCKET_NAME}`);
  console.log('  ' + output.trim().split('\n').join('\n  '));

  // Parse URL from output
  const match = output.match(/https?:\/\/[^\s]+/);
  if (match) publicUrl = match[0].replace(/\/$/, '');
} catch (err) {
  console.warn('  ⚠ Could not enable dev URL automatically:', err.stderr?.trim() || err.message);
}

// If not parsed from enable output, try fetching existing URL
if (!publicUrl) {
  try {
    const info = run(`wrangler r2 bucket dev-url get ${BUCKET_NAME}`);
    const match = info.match(/https?:\/\/[^\s]+/);
    if (match) publicUrl = match[0].replace(/\/$/, '');
  } catch {
    // ignore
  }
}

if (!publicUrl) {
  console.error([
    '',
    '  ✗ Could not determine the public dev URL.',
    '  Please run: wrangler r2 bucket dev-url enable ' + BUCKET_NAME,
    '  Then copy the URL and set it manually in .env.local:',
    '    NEXT_PUBLIC_R2_MODEL_BASE_URL=https://<account-id>.r2.dev',
    '',
  ].join('\n'));
  process.exit(1);
}

console.log(`  Public URL: ${publicUrl}`);

// ── 5. Write .env.local ──────────────────────────────────────────────────────
step('Writing .env.local...');
const envLine = `NEXT_PUBLIC_R2_MODEL_BASE_URL=${publicUrl}`;

let envContent = '';
if (fs.existsSync(ENV_FILE)) {
  envContent = fs.readFileSync(ENV_FILE, 'utf8');
  if (envContent.includes('NEXT_PUBLIC_R2_MODEL_BASE_URL=')) {
    // Replace existing line
    envContent = envContent.replace(/^NEXT_PUBLIC_R2_MODEL_BASE_URL=.*/m, envLine);
    console.log('  Updated existing NEXT_PUBLIC_R2_MODEL_BASE_URL in .env.local');
  } else {
    // Append
    envContent = envContent.trimEnd() + '\n' + envLine + '\n';
    console.log('  Added NEXT_PUBLIC_R2_MODEL_BASE_URL to existing .env.local');
  }
} else {
  envContent = envLine + '\n';
  console.log('  Created .env.local');
}

fs.writeFileSync(ENV_FILE, envContent);

// ── 6. Configure R2 CORS ────────────────────────────────────────────────────
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

// ── 7. Create Pages project ──────────────────────────────────────────────────
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
  console.warn(`  Create it manually: wrangler pages project create ${PAGES_PROJECT} --production-branch main`);
}

// ── 8. Set build env var in Pages ────────────────────────────────────────────
step(`Setting NEXT_PUBLIC_R2_MODEL_BASE_URL in Pages "${PAGES_PROJECT}" (production)...`);
try {
  run(
    `wrangler pages secret put NEXT_PUBLIC_R2_MODEL_BASE_URL --project-name ${PAGES_PROJECT} --env production`,
    { input: publicUrl + '\n' }
  );
  console.log('  ✓ Set in production environment');
} catch (err) {
  console.warn('  ⚠ Could not set env var automatically:', err.stderr?.trim() || err.message);
  console.warn('  Set it manually in the Cloudflare Pages dashboard:');
  console.warn('  Settings → Environment variables → Add variable (Production)');
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
  1. yarn build    # Downloads Whisper models + builds static site to ./out
  2. yarn deploy   # Deploys ./out to Cloudflare Pages

For CI builds via Cloudflare Pages dashboard, confirm the build env var is set
(Settings → Environment variables → Production):
  NEXT_PUBLIC_R2_MODEL_BASE_URL=${publicUrl}
`);
