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

const cache = await importTypeScriptModule("agents/_cache.ts");

function event(payload) {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

function parse(events) {
  return events.map((raw) => JSON.parse(raw.slice(6).trim()));
}

test("public replay collapses compatibility aliases and repeated summary events", () => {
  const sanitized = parse(cache.sanitizeEventsForPublicReplay([
    event({ type: "agent_status", status: "model_ready", protocol: "openai_agents_sdk", model: "model-a" }),
    event({ type: "tool_called", name: "inspect_github_user", input: { username: "secret" } }),
    event({ type: "tool_call", name: "inspect_github_user", arguments: { username: "secret" } }),
    event({ type: "tool_result", name: "inspect_github_user", content: "private output" }),
    event({ type: "usage", total_tokens: 9025 }),
    event({ type: "readme_draft", is_ghost: false, markdown: "private markdown" }),
    event({ type: "usage", total_tokens: 9025 }),
  ]));

  assert.deepEqual(sanitized.map(({ type }) => type), [
    "agent_status",
    "tool_call",
    "tool_result",
    "usage",
    "readme_draft",
  ]);
  assert.equal(sanitized.filter(({ type }) => type === "tool_call").length, 1);
  assert.equal(sanitized.filter(({ type }) => type === "usage").length, 1);
  assert.equal("input" in sanitized[1], false);
  assert.equal("content" in sanitized[2], false);
  assert.equal("markdown" in sanitized[4], false);
});

test("public replay preserves deterministic analysis fields for the cached terminal", () => {
  const [status] = parse(cache.sanitizeEventsForPublicReplay([
    event({ type: "agent_status", status: "analysis_ready", score: 84.17, rating: "顶流", coverage: { private: true } }),
  ]));

  assert.equal(status.status, "analysis_ready");
  assert.equal(status.score, 84.17);
  assert.equal(status.rating, "顶流");
  assert.equal("coverage" in status, false);
});
