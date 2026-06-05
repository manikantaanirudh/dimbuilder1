#!/usr/bin/env node
/**
 * Smoke test for a live SR OneStream Dim Builder deployment.
 * Usage: node scripts/smoke-test.mjs [base-url]
 * Default: http://localhost:8787
 *
 * Optional env (when AUTH_ENABLED=true):
 *   SMOKE_TEST_TOKEN — Bearer token for API calls
 *   SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD — login to obtain a token
 */
const BASE = process.argv[2] || process.env.SMOKE_TEST_BASE || "http://localhost:8787";

async function resolveAuthHeaders() {
  if (process.env.SMOKE_TEST_TOKEN) {
    return { Authorization: `Bearer ${process.env.SMOKE_TEST_TOKEN}` };
  }
  const email = process.env.SMOKE_TEST_EMAIL;
  const password = process.env.SMOKE_TEST_PASSWORD;
  if (!email || !password) return {};
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password })
  });
  if (!loginRes.ok) {
    throw new Error(`Login failed: ${loginRes.status}`);
  }
  const { token } = await loginRes.json();
  if (!token) throw new Error("Login response missing token");
  return { Authorization: `Bearer ${token}` };
}

async function run() {
  console.log(`Smoke testing ${BASE}...\n`);
  const authHeaders = await resolveAuthHeaders();
  if (Object.keys(authHeaders).length) {
    console.log("Using authenticated API calls\n");
  }

  const health = await fetch(`${BASE}/api/health`);
  assert(health.ok, "Health check failed");
  console.log("✓ Health check passed");

  const createRes = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ name: "Smoke Test Project" })
  });
  assert(createRes.status === 201, `Create project failed: ${createRes.status}`);
  const project = await createRes.json();
  console.log(`✓ Created project ${project.id}`);

  const dimsRes = await fetch(`${BASE}/api/projects/${project.id}/dimensions`, { headers: authHeaders });
  assert(dimsRes.ok, "List dimensions failed");
  const dims = await dimsRes.json();
  console.log(`✓ Listed ${dims.length} dimensions`);

  if (dims.length > 0) {
    const dim = dims[0];

    const memberRes = await fetch(`${BASE}/api/projects/${project.id}/dimensions/${dim.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ memberKey: "SmokeTest_Member", properties: { Description: "smoke" } })
    });
    assert(memberRes.status === 201, `Add member failed: ${memberRes.status}`);
    console.log("✓ Added member");

    const relRes = await fetch(`${BASE}/api/projects/${project.id}/dimensions/${dim.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ parentKey: dims[0].dimensionName || "Root", childKey: "SmokeTest_Member" })
    });
    assert(relRes.status === 201, `Add relationship failed: ${relRes.status}`);
    console.log("✓ Added relationship");
  }

  const valRes = await fetch(`${BASE}/api/validation/${project.id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({})
  });
  assert(valRes.ok, `Validation failed: ${valRes.status}`);
  console.log("✓ Validation ran");

  const xmlRes = await fetch(`${BASE}/api/export/${project.id}/xml`, { headers: authHeaders });
  if (xmlRes.ok) {
    const xml = await xmlRes.text();
    assert(xml.length > 0, "Empty XML export");
    console.log(`✓ XML export (${xml.length} chars)`);
  } else {
    console.log(`⚠ XML export returned ${xmlRes.status} (may be validation-blocked)`);
  }

  const delRes = await fetch(`${BASE}/api/projects/${project.id}`, { method: "DELETE", headers: authHeaders });
  assert(delRes.ok || delRes.status === 204, `Delete failed: ${delRes.status}`);
  console.log("✓ Deleted project");

  console.log("\n✓ All smoke tests passed!");
}

function assert(condition, message) {
  if (!condition) {
    console.error(`✗ FAIL: ${message}`);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(`✗ FAIL: ${err.message}`);
  process.exit(1);
});
