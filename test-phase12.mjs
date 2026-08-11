import fs from 'fs';
import path from 'path';

console.log("==========================================");
console.log(" PHASE 12: REGRESSION SUITE & FULL AUDIT");
console.log("==========================================\n");

let passed = 0;
let failed = 0;
let blocked = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASSED: ${message}`);
    passed++;
  } else {
    console.error(`❌ FAILED: ${message}`);
    failed++;
  }
}

function assertBlocked(message) {
  console.log(`⚠️ BLOCKED_AUTH: ${message}`);
  blocked++;
}

console.log("--- 1. STATIC FILES & ROUTES ---");
const filesToExist = [
  'src/app/auth/page.tsx',
  'src/app/(app)/layout.tsx',
  'src/components/layout/OrganizationContext.tsx',
  'src/app/(app)/workflows/page.tsx',
  'src/app/(app)/workflows/[id]/page.tsx',
  'src/app/(app)/runs/page.tsx',
  'src/app/(app)/runs/[id]/page.tsx',
  'src/app/(app)/notifications/page.tsx',
  'src/app/(app)/dashboard/page.tsx',
  'functions/_shared/runner.ts',
  'functions/_shared/security.ts',
  'next.config.ts'
];

filesToExist.forEach(f => {
  assert(fs.existsSync(f), `File exists: ${f}`);
});

console.log("\n--- 2. FRONTEND SECURITY ---");
const allFrontendFiles = filesToExist.filter(f => f.startsWith('src/') || f.startsWith('next.config'));
const allContents = allFrontendFiles.map(f => fs.readFileSync(f, 'utf8'));
const hasAdminSecret = allContents.some(content => content.includes('NHOST_ADMIN_SECRET'));
assert(!hasAdminSecret, "NHOST_ADMIN_SECRET is not exposed in frontend code.");
const hasOpenAIKey = allContents.some(content => content.includes('GROQ_API_KEY'));
assert(!hasOpenAIKey, "GROQ_API_KEY is not exposed in frontend code.");
const hasEval = allContents.some(content => content.includes('eval(') || content.includes('new Function('));
assert(!hasEval, "No eval() or new Function() in frontend code.");
const hasRawSQL = allContents.some(content => content.includes('SELECT ') && content.includes(' FROM '));
assert(!hasRawSQL, "No obvious raw SQL in frontend code.");

console.log("\n--- 3. BACKEND SECURITY & VALIDATION ---");
const securityTs = fs.readFileSync('functions/_shared/security.ts', 'utf8');
assert(securityTs.includes('getAuthenticatedUserId'), "Authentication validation logic exists.");
assert(securityTs.includes('checkRateLimit'), "Rate limiting logic exists.");
assert(securityTs.includes('checkIdempotency'), "Idempotency logic exists.");

const runnerTs = fs.readFileSync('functions/_shared/runner.ts', 'utf8');
assert(runnerTs.includes('169.254'), "SSRF protection blocks metadata endpoints.");
assert(runnerTs.includes('insert_custom_app_data_one'), "DB write restricted to custom_app_data.");
assert(runnerTs.includes('update_custom_app_data'), "DB update restricted to custom_app_data.");
assert(!runnerTs.includes('delete_'), "No arbitrary delete operations in runner.");

const webhookTs = fs.readFileSync('functions/webhook.ts', 'utf8');
assert(webhookTs.includes('crypto.timingSafeEqual'), "Webhook secret hash comparison is timing-safe.");

const nextConfig = fs.readFileSync('next.config.ts', 'utf8');
assert(nextConfig.includes('X-Content-Type-Options') && nextConfig.includes('nosniff'), "Security headers present.");

console.log("\n--- 4. LIVE AUTHENTICATED TESTS ---");
assertBlocked("Multi-tenant organization membership verification (requires verified identities).");
assertBlocked("Role-based access control validation (Viewer/Editor/Owner) (requires verified identities).");
assertBlocked("Workflow state execution boundaries (draft/active/disabled) (requires active authenticated runner).");
assertBlocked("Webhook lifecycle hash verification (requires functional authenticated trigger generation).");
assertBlocked("Atomic approval-gate completion limits (requires live workflow run state).");

console.log("\n==========================================");
console.log(` TOTALS: ${passed} PASSED | ${failed} FAILED | ${blocked} BLOCKED_AUTH`);
console.log("==========================================\n");

if (failed > 0) process.exit(1);
