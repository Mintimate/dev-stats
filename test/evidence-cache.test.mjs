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
  return import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
}

const evidenceCache = await importTypeScriptModule("agents/chat/_evidence-cache.ts");

class MemoryStore {
  values = new Map();

  async get(key) {
    return this.values.get(key) ?? null;
  }

  async setJSON(key, value) {
    this.values.set(key, structuredClone(value));
  }
}

const analysis = {
  version: "v1",
  platform: "github",
  username: "ExampleDev",
  score: 72.5,
  objective_rating: "高级",
  dimension_scores: { maturity: 12, original_projects: 13, contributions: 14, influence: 11, activity: 16, community: 8 },
  top_repos: [{ name: "project", stars: 42, contributions_desc: "Owner" }],
  evidence_summary: "sample",
  coverage: { sampled_repos: 3, external_contribution_repos: 1, activity_signals: 2 },
};

test("evidence cache shares a GitHub snapshot across username casing and modes", async () => {
  const store = new MemoryStore();
  const now = 1_800_000_000_000;

  await evidenceCache.writeEvidenceCache(store, "github", "ExampleDev", { user: { login: "ExampleDev" } }, analysis, 60_000, now);
  const cached = await evidenceCache.readEvidenceCache(store, "github", "exampledev", now + 1);

  assert.equal(cached?.analysis.score, 72.5);
  assert.equal(cached?.inspected.user.login, "ExampleDev");
  assert.equal(evidenceCache.buildEvidenceCacheKey("github", "ExampleDev"), evidenceCache.buildEvidenceCacheKey("github", "exampledev"));
});

test("evidence cache never returns an expired snapshot", async () => {
  const store = new MemoryStore();
  const now = 1_800_000_000_000;

  await evidenceCache.writeEvidenceCache(store, "cnb", "Mintimate", { user: { username: "Mintimate" } }, { ...analysis, platform: "cnb", username: "Mintimate" }, 10, now);
  const cached = await evidenceCache.readEvidenceCache(store, "cnb", "Mintimate", now + 10);

  assert.equal(cached, null);
});
