import { createNhostClient } from '@nhost/nhost-js';
import { GraphQLClient, gql } from 'graphql-request';

const SUBDOMAIN = 'luttcgrgbhoixswtzfxv';
const REGION = 'ap-south-1';

const nhost = createNhostClient({
  subdomain: SUBDOMAIN,
  region: REGION
});

async function main() {
  console.log("Starting Live Phase 2 Validation...");

  const users = [
    { email: 'nickvanessa5+ownera@gmail.com', password: 'VocalTestPassword123!', role: 'owner', org: 'A' },
    { email: 'nickvanessa5+editora@gmail.com', password: 'VocalTestPassword123!', role: 'editor', org: 'A' },
    { email: 'nickvanessa5+viewera@gmail.com', password: 'VocalTestPassword123!', role: 'viewer', org: 'A' },
    { email: 'nickvanessa5+ownerb@gmail.com', password: 'VocalTestPassword123!', role: 'owner', org: 'B' },
  ];

  const sessions = {};
  
  // 1. Register & Login Users
  console.log("1. Authenticating test users...");
  for (const u of users) {
    let session, error;
    
    // Try sign in first
    try {
      const res = await nhost.auth.signInEmailPassword({ email: u.email, password: u.password });
      session = res.session;
      error = res.error;
    } catch (err) {
      error = err;
    }

    if (error && (error.message.toLowerCase().includes('invalid') || error.message.toLowerCase().includes('incorrect'))) {
      console.log(` - User ${u.email} not found or incorrect password. Attempting sign up...`);
      try {
        const signupRes = await nhost.auth.signUpEmailPassword({ email: u.email, password: u.password });
        session = signupRes.data; // Note: signUpEmailPassword returns { data: session } in some SDK versions, or { session }
        error = signupRes.error;
      } catch (err) {
        error = err;
      }
    }
    
    if (error) {
      console.error(`Failed to authenticate ${u.email}:`, error);
      process.exit(1);
    }
    
    if (!session) {
      console.error(`No session returned for ${u.email}. Verification is required!`);
      process.exit(1);
    }
    
    sessions[u.email] = session;
    console.log(` - Authenticated ${u.email} (${session.user.id})`);
  }

  const ownerA = sessions[users[0].email];
  const editorA = sessions[users[1].email];
  const viewerA = sessions[users[2].email];
  const ownerB = sessions[users[3].email];

  // 2. Seed Organizations via Cloud Functions
  console.log("\n2. Seeding Organizations via Cloud Functions...");
  
  async function seedOrg(name, slug, accessToken) {
    const res = await fetch(`https://${SUBDOMAIN}.functions.${REGION}.nhost.run/v1/seed-org`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${accessToken}` },
      body: JSON.stringify({ name, slug })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(JSON.stringify(data));
    return data.data.insert_organizations_one.id;
  }

  async function addMember(orgId, userId, role, ownerAccessToken) {
    const res = await fetch(`https://${SUBDOMAIN}.functions.${REGION}.nhost.run/v1/add-member`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ownerAccessToken}` },
      body: JSON.stringify({ orgId, userId, role })
    });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(JSON.stringify(data));
  }

  let orgA_Id, orgB_Id;
  try {
    orgA_Id = await seedOrg('Org A', 'org-a-' + Date.now(), ownerA.accessToken);
    console.log(` - Created Org A: ${orgA_Id}`);
    
    orgB_Id = await seedOrg('Org B', 'org-b-' + Date.now(), ownerB.accessToken);
    console.log(` - Created Org B: ${orgB_Id}`);

    await addMember(orgA_Id, editorA.user.id, 'editor', ownerA.accessToken);
    console.log(` - Added Editor A to Org A`);
    
    await addMember(orgA_Id, viewerA.user.id, 'viewer', ownerA.accessToken);
    console.log(` - Added Viewer A to Org A`);
  } catch (err) {
    console.error("Failed to seed orgs:", err);
    process.exit(1);
  }

  // Helper for GraphQL
  function getGqlClient(accessToken) {
    return new GraphQLClient(`https://${SUBDOMAIN}.graphql.${REGION}.nhost.run/v1/graphql`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
  }

  const clientOwnerA = getGqlClient(ownerA.accessToken);
  const clientEditorA = getGqlClient(editorA.accessToken);
  const clientViewerA = getGqlClient(viewerA.accessToken);
  const clientOwnerB = getGqlClient(ownerB.accessToken);

  // 3. Create Seed Data
  console.log("\n3. Creating initial Workflow Data...");
  const CREATE_WORKFLOW = gql`
    mutation ($orgId: uuid!, $name: String!) {
      insert_workflows_one(object: { org_id: $orgId, name: $name, description: "Test" }) {
        id
      }
    }
  `;

  const CREATE_STEP = gql`
    mutation ($workflowId: uuid!, $name: String!, $type: String!, $pos: Int!) {
      insert_workflow_steps_one(object: { workflow_id: $workflowId, name: $name, type: $type, position: $pos }) {
        id
      }
    }
  `;

  let workflowB_Id, stepB_Id;
  let workflowA_Id, stepA_Id;
  try {
    const resA = await clientOwnerA.request(CREATE_WORKFLOW, { orgId: orgA_Id, name: "Workflow A" });
    workflowA_Id = resA.insert_workflows_one.id;
    console.log(` - Created Workflow A: ${workflowA_Id}`);

    const resStepA = await clientOwnerA.request(CREATE_STEP, { workflowId: workflowA_Id, name: "Step A", type: "http_request", pos: 1 });
    stepA_Id = resStepA.insert_workflow_steps_one.id;
    console.log(` - Created Step A: ${stepA_Id}`);

    const resB = await clientOwnerB.request(CREATE_WORKFLOW, { orgId: orgB_Id, name: "Workflow B" });
    workflowB_Id = resB.insert_workflows_one.id;
    console.log(` - Created Workflow B: ${workflowB_Id}`);

    const resStepB = await clientOwnerB.request(CREATE_STEP, { workflowId: workflowB_Id, name: "Step B", type: "http_request", pos: 1 });
    stepB_Id = resStepB.insert_workflow_steps_one.id;
    console.log(` - Created Step B: ${stepB_Id}`);
  } catch (err) {
    console.error("Failed creating seed data:", err.message);
  }

  // Wait for a second just in case
  await new Promise(r => setTimeout(r, 1000));

  console.log("\n--- EXECUTING SECURITY MATRIX ---");

  let fails = 0;
  const runTest = async (testName, operation, expectedPass = false, shouldChangeState = false) => {
    console.log(`\nTEST: ${testName}`);
    try {
      const res = await operation();
      
      // If we expect failure but it succeeded
      if (!expectedPass) {
        // Did it just return null because of a read filter?
        const isDataNull = Object.values(res)[0] === null || Object.values(res)[0]?.length === 0;
        if (isDataNull) {
          console.log(` ✅ PASS: Filtered (returned null/empty)`);
        } else {
          console.error(` ❌ FAIL: Operation succeeded but was expected to be denied.`);
          console.error(`    Result:`, JSON.stringify(res));
          fails++;
        }
      } else {
        // We expect it to pass
        const isDataNull = Object.values(res)[0] === null;
        if (isDataNull) {
          console.error(` ❌ FAIL: Operation succeeded but returned null (filtered).`);
          fails++;
        } else {
          console.log(` ✅ PASS: Allowed as expected.`);
        }
      }
    } catch (err) {
      if (!expectedPass) {
        console.log(` ✅ PASS: Blocked (${err.response?.errors?.[0]?.message || 'Denied'})`);
      } else {
        console.error(` ❌ FAIL: Operation was blocked but should have passed.`);
        console.error(`    Error:`, err.response?.errors?.[0]?.message || err.message);
        fails++;
      }
    }
  };

  // Test 1: Cross-org workflow read
  await runTest('1. Org A user reads Org B workflow', async () => {
    return clientEditorA.request(gql`query { workflows_by_pk(id: "${workflowB_Id}") { id } }`);
  }, false);

  // Test 2: Cross-org workflow_step read
  await runTest('2. Org A user reads Org B workflow_step', async () => {
    return clientEditorA.request(gql`query { workflow_steps_by_pk(id: "${stepB_Id}") { id } }`);
  }, false);

  // Test 3: Cross-org workflow_run read (no seed data, just querying)
  await runTest('3. Org A user reads Org B workflow_run', async () => {
    return clientEditorA.request(gql`query { workflow_runs(where: { workflow_id: { _eq: "${workflowB_Id}" }}) { id } }`);
  }, false);

  // Test 4: Cross-org step_run read (no seed data, querying)
  await runTest('4. Org A user reads Org B step_run', async () => {
    return clientEditorA.request(gql`query { step_runs(where: { workflow_run: { workflow_id: { _eq: "${workflowB_Id}" }}}) { id } }`);
  }, false);

  // Test 5: Editor creating db_write step
  await runTest('5. Editor A creates db_write step', async () => {
    return clientEditorA.request(CREATE_STEP, { workflowId: workflowA_Id, name: "Bad Step", type: "db_write", pos: 2 });
  }, false);

  // Test 6: Editor creating notify step
  await runTest('6. Editor A creates notify step', async () => {
    return clientEditorA.request(CREATE_STEP, { workflowId: workflowA_Id, name: "Bad Step", type: "notify", pos: 2 });
  }, false);

  // Test 7: Editor creating webhook trigger
  await runTest('7. Editor A creates webhook trigger', async () => {
    return clientEditorA.request(gql`
      mutation {
        insert_workflow_triggers_one(object: { workflow_id: "${workflowA_Id}", type: "webhook" }) {
          id
        }
      }
    `);
  }, false);

  // Test 8: Viewer creating workflow
  await runTest('8. Viewer A creates workflow', async () => {
    return clientViewerA.request(CREATE_WORKFLOW, { orgId: orgA_Id, name: "Viewer Workflow" });
  }, false);

  // Test 9: Viewer modifying workflow
  await runTest('9. Viewer A modifies workflow', async () => {
    return clientViewerA.request(gql`
      mutation {
        update_workflows_by_pk(pk_columns: {id: "${workflowA_Id}"}, _set: { name: "Hacked" }) {
          id
        }
      }
    `);
  }, false);

  // Test 10: Changing workflow.org_id
  await runTest('10. Owner A changing workflow.org_id to Org B', async () => {
    return clientOwnerA.request(gql`
      mutation {
        update_workflows_by_pk(pk_columns: {id: "${workflowA_Id}"}, _set: { org_id: "${orgB_Id}" }) {
          id
        }
      }
    `);
  }, false);

  // Test 11: Attaching workflow_step to Org B workflow
  await runTest('11. Owner A attaching workflow_step to Org B workflow', async () => {
    return clientOwnerA.request(CREATE_STEP, { workflowId: workflowB_Id, name: "Hacked Step", type: "http_request", pos: 1 });
  }, false);

  // --- Positive RBAC tests ---
  console.log("\n--- POSITIVE RBAC TESTS ---");
  await runTest('P1. Owner A updates workflow', async () => {
    return clientOwnerA.request(gql`mutation { update_workflows_by_pk(pk_columns: {id: "${workflowA_Id}"}, _set: { name: "Updated by Owner" }) { id name } }`);
  }, true);

  await runTest('P2. Editor A updates workflow', async () => {
    return clientEditorA.request(gql`mutation { update_workflows_by_pk(pk_columns: {id: "${workflowA_Id}"}, _set: { name: "Updated by Editor" }) { id name } }`);
  }, true);

  await runTest('P3. Editor A creates http_request step', async () => {
    return clientEditorA.request(CREATE_STEP, { workflowId: workflowA_Id, name: "Editor Step", type: "http_request", pos: 3 });
  }, true);

  console.log(`\nTotal failures: ${fails}`);
  if (fails > 0) {
    console.error("Some security tests failed. We must fix and redeploy.");
  } else {
    console.log("All security tests passed!");
  }
}

main().catch(console.error);
