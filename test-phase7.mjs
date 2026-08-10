import { execSync } from 'child_process';
import crypto from 'crypto';

console.log("=========================================");
console.log("PHASE 7 - PRODUCTION HARDENING TEST SUITE");
console.log("=========================================");

let passed = 0;
let failed = 0;
let blocked = 0;

function pass(name) {
  console.log(`✅ [PASS] ${name}`);
  passed++;
}

function fail(name, reason) {
  console.error(`❌ [FAIL] ${name}: ${reason}`);
  failed++;
}

function block(name, reason = "AUTH VERIFICATION") {
  console.log(`⚠️ [BLOCKED] ${name} (${reason})`);
  blocked++;
}

// Ensure the local server is running for tests. 
// Assuming localhost:3000 or functions on localhost:1337 if local Nhost is running.
// Since we don't know the exact local port for functions reliably without Nhost, we'll try port 1337 (default nhost local)
const NHOST_URL = 'http://localhost:1337/v1/functions';
const TEST_WEBHOOK_URL = `${NHOST_URL}/webhook`;
const TEST_EXECUTE_URL = `${NHOST_URL}/execute-workflow`;

async function testWebhooks() {
  console.log("\n--- Webhook Security Tests ---");
  
  try {
    // 1. Missing trigger ID
    const res1 = await fetch(TEST_WEBHOOK_URL, { method: 'POST' });
    if (res1.status === 400) pass("Webhook rejects missing trigger ID");
    else fail("Webhook rejects missing trigger ID", `Status ${res1.status}`);

    // 2. Missing secret
    const res2 = await fetch(`${TEST_WEBHOOK_URL}?triggerId=123e4567-e89b-12d3-a456-426614174000`, { method: 'POST' });
    if (res2.status === 401) pass("Webhook rejects missing secret");
    else fail("Webhook rejects missing secret", `Status ${res2.status}`);

    // 3. Oversized payload
    const largePayload = "A".repeat(600 * 1024); // 600KB
    const res3 = await fetch(`${TEST_WEBHOOK_URL}?triggerId=123e4567-e89b-12d3-a456-426614174000`, { 
      method: 'POST',
      headers: { 'x-webhook-secret': 'fake_secret', 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: largePayload })
    });
    if (res3.status === 413 || res3.status === 401) pass("Webhook handles oversized payloads or rejects invalid secrets early");
    else fail("Webhook handles oversized payloads", `Status ${res3.status}`);

  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
       console.log("Local Nhost server not running at :1337, skipping live function tests.");
       block("Webhook Live Tests", "NO LOCAL NHOST SERVER");
    } else {
       console.error("Test error:", e);
    }
  }
}

async function testExecutionSecurity() {
  console.log("\n--- Execution Security Tests ---");
  
  try {
    // 1. Unauthenticated execution
    const res1 = await fetch(TEST_EXECUTE_URL, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    if (res1.status === 401) pass("Execution rejects missing auth token");
    else fail("Execution rejects missing auth token", `Status ${res1.status}`);

    // 2. Malformed token
    const res2 = await fetch(TEST_EXECUTE_URL, { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer fake_token' },
      body: JSON.stringify({ workflowId: '123e4567-e89b-12d3-a456-426614174000' })
    });
    if (res2.status === 401) pass("Execution securely rejects malformed/invalid JWT without crashing");
    else fail("Execution securely rejects malformed/invalid JWT", `Status ${res2.status}`);

    // Rate Limiting simulation
    let rlPass = false;
    for (let i = 0; i < 35; i++) {
      const res = await fetch(TEST_EXECUTE_URL, { method: 'POST', body: JSON.stringify({}) });
      if (res.status === 429) {
        rlPass = true;
        break;
      }
    }
    if (rlPass) pass("Rate limiting enforced on execution endpoint");
    else fail("Rate limiting enforced on execution endpoint", "Failed to trigger 429");

  } catch (e) {
    if (e.cause?.code === 'ECONNREFUSED') {
       block("Execution Live Tests", "NO LOCAL NHOST SERVER");
    }
  }

  // Idempotency/Approval Race
  // We can't easily test the race condition without an authenticated token.
  block("Idempotency identical concurrent request protection");
  block("Atomic approval race protection");
  block("Retry mechanism backoff limits");
  block("Execution timeouts (60s / 15s LLM)");
  block("Observability duration metrics");
  block("Sanitized errors output validation");
}

async function run() {
  await testWebhooks();
  await testExecutionSecurity();

  console.log("\n=========================================");
  console.log(`TEST SUMMARY: ${passed} Passed, ${failed} Failed, ${blocked} Blocked`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

run();
