import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";

async function importTypeScriptModule(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
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
