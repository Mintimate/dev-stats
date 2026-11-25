import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function importTypeScriptModule(entryPoint, plugins = []) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
    plugins,
  });
  const source = result.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
}

const cacheModule = await importTypeScriptModule("agents/_cache.ts");
const leaderboardModule = await importTypeScriptModule("agents/leaderboard.ts");

class MemoryBlobStore {
  values = new Map();

  async get(key) {
    await Promise.resolve();
    return this.values.get(key) ?? null;
  }

  async setJSON(key, value, options = {}) {
    await Promise.resolve();
    if (options.onlyIfNew && this.values.has(key)) throw new Error("Precondition failed");
    this.values.set(key, structuredClone(value));
  }

  async delete(key) {
    await Promise.resolve();
    this.values.delete(key);
  }

  async list() {
    return { blobs: Array.from(this.values.keys(), (key) => ({ key })) };
  }
}

test("concurrent refresh requests elect exactly one lease owner", async () => {
  const store = new MemoryBlobStore();
  const now = 1_800_000_000_000;
  const results = await Promise.all([
    cacheModule.acquireRefreshLease(store, "github", "Mintimate", "readme", "run-a", now),
    cacheModule.acquireRefreshLease(store, "github", "mintimate", "readme", "run-b", now),
  ]);

  assert.equal(results.filter((result) => result.acquired).length, 1);
  assert.equal(results.filter((result) => !result.acquired).length, 1);
  assert.equal(results[0].lease.runId, results[1].lease.runId);
});

test("only the current lease owner can release the lock", async () => {
  const store = new MemoryBlobStore();
  const result = await cacheModule.acquireRefreshLease(store, "github", "Mintimate", "readme", "owner", Date.now());
  await cacheModule.releaseRefreshLease(store, { ...result.lease, runId: "not-owner" });
  assert.ok(await cacheModule.readRefreshLease(store, "github", "Mintimate", "readme"));
  await cacheModule.releaseRefreshLease(store, result.lease);
  assert.equal(await cacheModule.readRefreshLease(store, "github", "Mintimate", "readme"), null);
});

test("public cache-miss analysis rate limit accepts one concurrent client request", async () => {
  const store = new MemoryBlobStore();
  const now = 1_800_000_000_000;
  const results = await Promise.all([
    cacheModule.acquirePublicAnalysisRateLimit(store, "203.0.113.17", now),
    cacheModule.acquirePublicAnalysisRateLimit(store, "203.0.113.17", now),
  ]);

  assert.equal(results.filter((result) => result.allowed).length, 1);
  assert.equal(results.filter((result) => !result.allowed).length, 1);
  const next = await cacheModule.acquirePublicAnalysisRateLimit(store, "203.0.113.17", now + 2 * 60 * 1000);
  assert.equal(next.allowed, true);
});

test("public refresh responses hide the owner run ID and rate-limit by the EdgeOne client address", async (t) => {
  const store = new MemoryBlobStore();
  const activeRunId = "private-test-identifier";
  await cacheModule.acquireRefreshLease(store, "github", "Mintimate", "readme", activeRunId);
  globalThis.__devStatsTestStore = () => store;
  t.after(() => delete globalThis.__devStatsTestStore);
  const stubs = {
    "@edgeone/pages-blob": "export const getStore = () => globalThis.__devStatsTestStore();",
    "@openai/agents": "export const Agent = {}, OpenAIChatCompletionsModel = {}, run = {}, tool = {};",
    "openai": "export default class OpenAI {}",
  };
  const plugins = [{
    name: "refresh-test-stubs",
    setup(builder) {
      builder.onResolve({ filter: /^(@edgeone\/pages-blob|@openai\/agents|openai)$/ }, ({ path }) => ({ path, namespace: "refresh-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "refresh-stub" }, ({ path }) => ({ contents: stubs[path] }));
    },
  }];

  const [chat, profile] = await Promise.all([
    importTypeScriptModule("agents/chat/index.ts", plugins),
    importTypeScriptModule("agents/profile.ts", plugins),
  ]);
  const requestRefresh = (headers) => chat.onRequest({
    conversation_id: "another-test-run",
    request: {
      headers,
      body: { message: "Review public profile", state: { username: "Mintimate" }, force_reanalyze: true },
    },
    env: { AI_GATEWAY_API_KEY: "test-key", AI_GATEWAY_BASE_URL: "https://example.test", PUBLIC_SITE_URL: "https://example.test" },
  });

  const reply = await requestRefresh({ "EO-Connecting-IP": "203.0.113.11", "CF-Connecting-IP": "203.0.113.12" });
  assert.equal(reply.status, 200);
  const events = await reply.text();
  assert.match(events, /"type":"refresh_joined"/);
  assert.doesNotMatch(events, /private-test-identifier|"run_id"/);

  const limited = await requestRefresh({ "X-Forwarded-For": "203.0.113.13, 203.0.113.11", "X-Real-IP": "203.0.113.14" });
  assert.equal(limited.status, 429);

  const profileResponse = await profile.onRequest({ request: { body: { username: "Mintimate" } } });
  const data = await profileResponse.json();
  assert.equal(data.refresh.status, "running");
  assert.equal("runId" in data.refresh, false);
});

test("per-user leaderboard changes keep newer entries and apply tombstones", () => {
  const base = [
    { platform: "github", username: "alice", score: 70, updatedAt: 100 },
    { platform: "github", username: "bob", score: 80, updatedAt: 100 },
  ];
  const changes = [
    { platform: "github", username: "alice", score: 60, updatedAt: 90 },
    { platform: "github", username: "alice", score: 95, updatedAt: 120 },
    { platform: "github", username: "bob", removed: true, updatedAt: 110 },
  ];

  assert.deepEqual(leaderboardModule.mergeLeaderboardItems(base, changes), [
    { platform: "github", username: "alice", score: 95, updatedAt: 120 },
  ]);
});
