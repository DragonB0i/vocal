import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log("==========================================");
console.log(" PHASE 13 STATIC ONBOARDING VALIDATION ");
console.log("==========================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
  console.log(`✅ PASSED: ${name}`);
  passed++;
}

function fail(name, reason) {
  console.log(`❌ FAILED: ${name}`);
  console.log(`   Reason: ${reason}`);
  failed++;
}

try {
  const addMemberCode = fs.readFileSync(path.join(__dirname, 'functions', 'add-member.ts'), 'utf8');
  if (addMemberCode.includes('req.body') && addMemberCode.includes('email')) {
    pass("add-member.ts modified to accept email");
  } else {
    fail("add-member.ts modified to accept email", "Email parsing missing");
  }
  
  if (addMemberCode.includes('FindUserByEmail')) {
    pass("add-member.ts securely queries auth.users by email");
  } else {
    fail("add-member.ts securely queries auth.users by email", "Missing FindUserByEmail query");
  }
} catch (e) {
  fail("add-member.ts exists", e.message);
}

try {
  const contextCode = fs.readFileSync(path.join(__dirname, 'src', 'components', 'layout', 'OrganizationContext.tsx'), 'utf8');
  if (contextCode.includes('Create Your Workspace') && contextCode.includes('seed-org')) {
    pass("OrganizationContext includes Onboarding UI and calls seed-org");
  } else {
    fail("OrganizationContext includes Onboarding UI", "Missing UI or seed-org call");
  }
} catch (e) {
  fail("OrganizationContext exists", e.message);
}

try {
  const teamCode = fs.readFileSync(path.join(__dirname, 'src', 'app', '(app)', 'settings', 'team', 'page.tsx'), 'utf8');
  if (teamCode.includes('GetTeamMembers') && teamCode.includes('add-member')) {
    pass("Team page includes member listing and invite form");
  } else {
    fail("Team page includes member listing and invite form", "Missing query or add-member call");
  }
} catch (e) {
  fail("Team page exists", e.message);
}

console.log("\n==========================================");
console.log(` TOTALS: ${passed} PASSED | ${failed} FAILED`);
console.log("==========================================\n");

if (failed > 0) {
  process.exit(1);
}
