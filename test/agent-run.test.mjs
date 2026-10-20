import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/hooks/useAgentRun.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["react"],
  write: false,
  logLevel: "silent",
});
const hookScript = new vm.Script(bundle.outputFiles[0].text);

function createHarness(overrides = {}) {
  let cursor = 0;
  const cells = [];
  // Exercise public hook actions and SSE handling without a DOM or real timers.
  // Each snapshot represents the next render after synchronous state updates.
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = typeof initial === "function" ? initial() : initial;
      return [cells[index], (value) => {
        cells[index] = typeof value === "function" ? value(cells[index]) : value;
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in cells)) cells[index] = { current: initial };
      return cells[index];
    },
    useEffect() {},
  };
  let config = { platform: "github", username: "Alice", agent_mode: "readme", ...overrides };
  let globalStatus;
  let request = () => { throw new Error("No mock response configured"); };
  const exports = {};
  const context = vm.createContext({
    exports,
    module: { exports },
    require(name) {
      assert.equal(name, "react");
      return react;
    },
    crypto: webcrypto,
    performance,
    AbortController,
    TextDecoder,
    URL,
    window: { setInterval: () => 1, clearInterval() {}, dispatchEvent() {} },
    CustomEvent: class { constructor(type) { this.type = type; } },
    fetch(path, init) {
      if (path === "/stop") return Promise.resolve(new Response("ok"));
      assert.equal(path, "/chat", "all requests must use the mock transport");
      return request(init);
    },
  });
  hookScript.runInContext(context);

  function snapshot() {
    cursor = 0;
    return context.module.exports.useAgentRun(
      config,
      (username) => { config = { ...config, username }; },
      (status) => { globalStatus = status; },
    );
  }

  function stream() {
    let controller;
    const body = new ReadableStream({ start(next) { controller = next; } });
    // Deliberately allow writes after abort to reproduce a delayed old response.
    request = async () => new Response(body);
    return {
      emit(event) {
        controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
      },
      end() { controller.close(); },
    };
  }

  async function complete(events, mode = "readme") {
    const source = stream();
    const pending = snapshot().runAgent(mode);
    events.forEach(source.emit);
    source.end();
    await pending;
    return snapshot();
  }

  return {
    snapshot,
    stream,
    complete,
    get globalStatus() { return globalStatus; },
    failRequest(message) { request = async () => { throw new Error(message); }; },
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));
const recipe = { cards: ["stats"], theme: "default", rationale: "Synthetic test recipe" };
const draft = (username) => ({
  type: "readme_draft",
  title: `${username} report`,
  markdown: `# ${username}`,
  score: 72,
  roast_summary: `${username} roast`,
  dimension_scores: {},
});

test("initial hook state has no fabricated report or result identity", () => {
  const agent = createHarness().snapshot();
  assert.equal(agent.result.kind, "none");
  assert.equal(agent.resultTarget, null);
  assert.equal(agent.lastRecipe, null);
  assert.equal(agent.status, "idle");
});

test("a report received without tool events does not mark unrelated tools completed", async () => {
  const harness = createHarness();
  const agent = await harness.complete([draft("Alice")]);
  assert.equal(agent.status, "done");
  assert.equal(agent.resultTarget.username, "Alice");
  assert.equal(agent.toolchain.compose_draft, "completed");
  assert.equal(agent.toolchain.inspect_user, "idle");
  assert.equal(agent.toolchain.fetch_readme, "idle");
  assert.equal(agent.toolchain.browser_fetch, "idle");
});

test("refresh preserves the previous report and recipe until the new report arrives", async () => {
  const harness = createHarness();
  await harness.complete([{ type: "stats_recipe", recipe }, draft("Alice")]);
  const source = harness.stream();
  const pending = harness.snapshot().runAgent("readme", false, { platform: "cnb", username: "MixedCase" });
  source.emit({ type: "tool_call", name: "compose_readme_draft" });
  source.emit({ type: "stats_recipe", recipe });
  await tick();

  let agent = harness.snapshot();
  assert.equal(agent.running, true);
  assert.equal(agent.runTarget.platform, "cnb");
  assert.equal(agent.runTarget.username, "MixedCase");
  assert.equal(agent.resultTarget.platform, "github");
  assert.equal(agent.resultTarget.username, "Alice");
  assert.equal(agent.result.data.title, "Alice report");
  assert.equal(agent.lastRecipe.username, "Alice");
  assert.equal(agent.toolchain.compose_draft, "active");
  assert.equal(agent.toolchain.inspect_user, "idle");
  assert.notEqual(agent.resultRunId, agent.runId);

  source.emit(draft("MixedCase"));
  source.end();
  await pending;
  agent = harness.snapshot();
  assert.equal(agent.resultTarget.platform, "cnb");
  assert.equal(agent.resultTarget.username, "MixedCase");
  assert.equal(agent.lastRecipe.platform, "cnb");
  assert.equal(agent.lastRecipe.username, "MixedCase");
  assert.equal(agent.resultRunId, agent.runId);
});

for (const shape of ["flat", "nested"]) {
  test(`Stats mode renders a ${shape} stats_recipe event`, async () => {
    const harness = createHarness({ platform: "cnb", username: "MixedCase" });
    const event = shape === "flat"
      ? { type: "stats_recipe", ...recipe }
      : { type: "stats_recipe", recipe };
    const agent = await harness.complete([event], "stats");
    assert.equal(agent.status, "done");
    assert.equal(agent.result.kind, "stats");
    assert.equal(agent.result.recipe.platform, "cnb");
    assert.equal(agent.result.recipe.username, "MixedCase");
    assert.deepEqual(Array.from(agent.result.recipe.cards), ["stats"]);
    assert.equal(agent.result.summary, recipe.rationale);
    assert.equal(agent.toolchain.compose_recipe, "completed");
    assert.equal(agent.toolchain.inspect_user, "idle");
  });
}

for (const failure of ["network", "SSE"]) {
  test(`${failure} failure keeps the previous report and error status after finalization`, async () => {
    const harness = createHarness();
    await harness.complete([draft("Alice")]);
    harness.snapshot().setAgentUsername("Bob");
    const message = `Synthetic ${failure} failure`;
    if (failure === "network") {
      harness.failRequest(message);
      await harness.snapshot().runAgent("readme");
    } else {
      await harness.complete([{ type: "error_message", content: message }]);
    }
    const agent = harness.snapshot();
    assert.equal(agent.status, "error");
    assert.equal(harness.globalStatus.tone, "is-error");
    assert.equal(agent.progress, message);
    assert.equal(agent.resultTarget.username, "Alice");
    assert.equal(agent.runTarget.username, "Bob");
    assert.equal(agent.result.data.title, "Alice report");
  });
}

for (const existingReport of [false, true]) {
  test(`an empty response is an error ${existingReport ? "with" : "without"} an older report`, async () => {
    const harness = createHarness();
    if (existingReport) await harness.complete([draft("Alice")]);
    const agent = await harness.complete([]);
    assert.equal(agent.status, "error");
    assert.equal(harness.globalStatus.tone, "is-error");
    assert.equal(agent.result.kind, existingReport ? "readme" : "none");
    if (existingReport) assert.equal(agent.result.data.title, "Alice report");
  });
}

test("stopping a run remains stopped when its stream finishes", async () => {
  const harness = createHarness();
  const source = harness.stream();
  const pending = harness.snapshot().runAgent("readme");
  await tick();
  await harness.snapshot().stopAgent();
  source.end();
  await pending;
  assert.equal(harness.snapshot().status, "stopped");
  assert.equal(harness.snapshot().result.kind, "none");
  assert.equal(harness.globalStatus.label, "分析已停止");
});

test("a delayed aborted stream cannot replace or finalize a newer run", async () => {
  const harness = createHarness();
  await harness.complete([draft("Alice")]);
  const oldSource = harness.stream();
  const oldPending = harness.snapshot().runAgent("readme");
  await tick();
  await harness.snapshot().stopAgent();
  harness.snapshot().setAgentUsername("Bob");
  const source = harness.stream();
  const pending = harness.snapshot().runAgent("readme");
  oldSource.emit(draft("late Alice"));
  oldSource.end();
  await oldPending;

  let agent = harness.snapshot();
  assert.equal(agent.status, "running");
  assert.equal(agent.runTarget.username, "Bob");
  assert.equal(agent.resultTarget.username, "Alice");
  assert.equal(agent.result.data.title, "Alice report");
  assert.equal(harness.globalStatus.tone, "is-running");
  source.emit(draft("Bob"));
  source.end();
  await pending;
  agent = harness.snapshot();
  assert.equal(agent.status, "done");
  assert.equal(agent.resultTarget.username, "Bob");
  assert.equal(agent.result.data.title, "Bob report");
});

test("explicit reset clears the report and ignores delayed stream events", async () => {
  const harness = createHarness();
  await harness.complete([{ type: "stats_recipe", recipe }, draft("Alice")]);
  const source = harness.stream();
  const pending = harness.snapshot().runAgent("readme");
  await tick();
  harness.snapshot().resetAgent();
  source.emit(draft("late Alice"));
  source.end();
  await pending;
  const agent = harness.snapshot();
  assert.equal(agent.result.kind, "none");
  assert.equal(agent.resultTarget, null);
  assert.equal(agent.lastRecipe, null);
  assert.equal(agent.status, "idle");
});
