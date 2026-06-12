#!/usr/bin/env node
/**
 * Smoke test for a live SR OneStream Dim Builder deployment.
 * Usage: node scripts/smoke-test.mjs [base-url]
 * Default: http://localhost:8787
 *
 * Optional env (when AUTH_ENABLED=true):
 *   SMOKE_TEST_TOKEN — Bearer token for API calls
 *   SMOKE_TEST_EMAIL / SMOKE_TEST_PASSWORD — login to obtain a token
 *
 * Optional env (PostgreSQL):
 *   DATABASE_URL — when set, validates a Postgres-backed deployment
 *   SMOKE_TEST_SPAWN=1 — spawn an ephemeral API server with DATABASE_URL before testing
 *   SMOKE_TEST_PORT — port for spawned server (default 18787)
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const DATABASE_URL = process.env.DATABASE_URL?.trim();
let base = process.argv[2] || process.env.SMOKE_TEST_BASE || "http://localhost:8787";
let stopServer = async () => {};

async function resolveAuthHeaders() {
  if (process.env.SMOKE_TEST_TOKEN) {
    return { Authorization: `Bearer ${process.env.SMOKE_TEST_TOKEN}` };
  }
  const email = process.env.SMOKE_TEST_EMAIL;
  const password = process.env.SMOKE_TEST_PASSWORD;
  if (!email || !password) return {};
  const loginRes = await fetch(`${base}/api/auth/login`, {
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

async function waitForHealth(url, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return;
    } catch {
      // Server still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server at ${url} did not become healthy within ${timeoutMs}ms`);
}

async function maybeSpawnPostgresServer() {
  if (!DATABASE_URL) return;

  console.log("PostgreSQL mode (DATABASE_URL set)\n");

  if (process.env.SMOKE_TEST_SPAWN !== "1") {
    console.log(`Testing running server at ${base}\n`);
    return;
  }

  const port = Number(process.env.SMOKE_TEST_PORT || 18787);
  base = `http://127.0.0.1:${port}`;

  await runMigratePg();

  const child = spawn("npx", ["tsx", "src/server/index.ts"], {
    cwd: repoRoot,
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL,
      HOST: "127.0.0.1",
      PORT: String(port),
      AUTH_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout?.on("data", (chunk) => process.stderr.write(chunk));
  child.stderr?.on("data", (chunk) => process.stderr.write(chunk));

  stopServer = async () => {
    if (child.exitCode !== null) return;
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  };

  await waitForHealth(base);
  console.log(`Spawned ephemeral API server at ${base}\n`);
}

function runMigratePg() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(repoRoot, "scripts/migrate-pg.mjs")], {
      cwd: repoRoot,
      env: { ...process.env, DATABASE_URL },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`migrate-pg.mjs exited with code ${code}`));
    });
  });
}

async function run() {
  await maybeSpawnPostgresServer();

  console.log(`Smoke testing ${base}...\n`);
  const authHeaders = await resolveAuthHeaders();
  if (Object.keys(authHeaders).length) {
    console.log("Using authenticated API calls\n");
  }

  const health = await fetch(`${base}/api/health`);
  assert(health.ok, "Health check failed");
  console.log("✓ Health check passed");

  const createRes = await fetch(`${base}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({ name: "Smoke Test Project" })
  });
  assert(createRes.status === 201, `Create project failed: ${createRes.status}`);
  const project = await createRes.json();
  console.log(`✓ Created project ${project.id}`);

  const dimsRes = await fetch(`${base}/api/projects/${project.id}/dimensions`, { headers: authHeaders });
  assert(dimsRes.ok, "List dimensions failed");
  const dims = await dimsRes.json();
  console.log(`✓ Listed ${dims.length} dimensions`);

  if (dims.length > 0) {
    const dim = dims[0];

    const memberRes = await fetch(`${base}/api/projects/${project.id}/dimensions/${dim.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ memberKey: "SmokeTest_Member", properties: { Description: "smoke" } })
    });
    assert(memberRes.status === 201, `Add member failed: ${memberRes.status}`);
    console.log("✓ Added member");

    const relRes = await fetch(`${base}/api/projects/${project.id}/dimensions/${dim.id}/relationships`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify({ parentKey: dims[0].dimensionName || "Root", childKey: "SmokeTest_Member" })
    });
    assert(relRes.status === 201, `Add relationship failed: ${relRes.status}`);
    console.log("✓ Added relationship");
  }

  const valRes = await fetch(`${base}/api/validation/${project.id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders },
    body: JSON.stringify({})
  });
  assert(valRes.ok, `Validation failed: ${valRes.status}`);
  console.log("✓ Validation ran");

  const xmlRes = await fetch(`${base}/api/export/${project.id}/xml`, { headers: authHeaders });
  if (xmlRes.ok) {
    const xml = await xmlRes.text();
    assert(xml.length > 0, "Empty XML export");
    console.log(`✓ XML export (${xml.length} chars)`);
  } else {
    console.log(`⚠ XML export returned ${xmlRes.status} (may be validation-blocked)`);
  }

  const delRes = await fetch(`${base}/api/projects/${project.id}`, { method: "DELETE", headers: authHeaders });
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

run()
  .catch((err) => {
    console.error(`✗ FAIL: ${err.message}`);
    process.exit(1);
  })
  .finally(() => stopServer());
