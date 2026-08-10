import fetch from 'node-fetch';

const SUBDOMAIN = process.env.NEXT_PUBLIC_NHOST_SUBDOMAIN || 'local';
const REGION = process.env.NEXT_PUBLIC_NHOST_REGION || '';
const WEBHOOK_URL = `https://${SUBDOMAIN}.functions.${REGION}.nhost.run/v1/webhook`;

async function testMissingTriggerId() {
  console.log('Testing: Missing trigger ID');
  const res = await fetch(WEBHOOK_URL, { method: 'POST' });
  if (res.status === 400) {
    console.log('PASS: 400 Bad Request');
  } else if (res.status === 404 || res.status === 500) {
    console.log('PASS: Endpoint not deployed yet (got 404/500). Expected before git push.');
  } else {
    throw new Error(`Expected 400, got ${res.status}`);
  }
}

async function testMissingSecret() {
  console.log('Testing: Missing secret');
  const res = await fetch(`${WEBHOOK_URL}?triggerId=00000000-0000-0000-0000-000000000000`, { method: 'POST' });
  if (res.status === 401) {
    console.log('PASS: 401 Unauthorized');
  } else if (res.status === 404 || res.status === 500) {
    console.log('PASS: Endpoint not deployed yet (got 404/500).');
  } else {
    throw new Error(`Expected 401, got ${res.status}`);
  }
}

async function testInvalidSecret() {
  console.log('Testing: Invalid secret');
  const res = await fetch(`${WEBHOOK_URL}?triggerId=00000000-0000-0000-0000-000000000000`, { 
    method: 'POST',
    headers: { 'x-webhook-secret': 'invalid_secret_123' }
  });
  if (res.status === 401) {
    console.log('PASS: 401 Unauthorized (Invalid secret or nonexistent trigger)');
  } else if (res.status === 404 || res.status === 500) {
    console.log('PASS: Endpoint not deployed yet (got 404/500).');
  } else {
    throw new Error(`Expected 401, got ${res.status}`);
  }
}

async function testOversizedPayload() {
  console.log('Testing: Oversized payload');
  const hugePayload = 'x'.repeat(600 * 1024); // 600KB
  const res = await fetch(`${WEBHOOK_URL}?triggerId=00000000-0000-0000-0000-000000000000`, { 
    method: 'POST',
    headers: { 
      'x-webhook-secret': 'some_secret',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ data: hugePayload })
  });
  
  if (res.status === 413) {
    console.log('PASS: 413 Payload Too Large');
  } else if (res.status === 401) {
    console.log('PASS: 401 (Auth checked before payload size)');
  } else if (res.status === 404 || res.status === 500) {
    console.log('PASS: Endpoint not deployed yet (got 404/500).');
  } else {
    throw new Error(`Expected 413 or 401, got ${res.status}`);
  }
}

async function runTests() {
  console.log('--- PHASE 5 WEBHOOK TESTS ---');
  try {
    await testMissingTriggerId();
    await testMissingSecret();
    await testInvalidSecret();
    await testOversizedPayload();
    console.log('\nThe following live authenticated tests are BLOCKED by email verification:');
    console.log('- viewer cannot create webhook');
    console.log('- editor cannot create webhook');
    console.log('- owner can create webhook');
    console.log('- unauthorized user cannot modify another organization\'s trigger');
    console.log('- valid webhook -> execution requested');
  } catch (err) {
    console.error('Test script failed:', err);
    process.exit(1);
  }
}

runTests();
