import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/hooks/useImagePreview.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["react"],
  write: false,
  logLevel: "silent",
});
const hookScript = new vm.Script(bundle.outputFiles[0].text);

function createHarness() {
  let cursor = 0;
  let src = "";
  let attachedRef;
  const cells = [];
  const layoutEffects = new Map();
  const passiveEffects = new Map();

  function registerEffect(queue, effect, dependencies) {
    const index = cursor++;
    if (!(index in cells)) cells[index] = { dependencies: undefined, cleanup: undefined };
    const previous = cells[index].dependencies;
    if (!previous || dependencies.some((value, i) => !Object.is(value, previous[i]))) {
      queue.set(index, { effect, dependencies });
    }
  }

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
    useLayoutEffect(effect, dependencies) {
      registerEffect(layoutEffects, effect, dependencies);
    },
    useEffect(effect, dependencies) {
      registerEffect(passiveEffects, effect, dependencies);
    },
  };
  const exports = {};
  const context = vm.createContext({
    exports,
    module: { exports },
    require(name) {
      assert.equal(name, "react");
      return react;
    },
  });
  hookScript.runInContext(context);

  function snapshot() {
    cursor = 0;
    return context.module.exports.useImagePreview(src);
  }

  function attach(ref, node) {
    if (typeof ref === "function") ref(node);
    else if (ref) ref.current = node;
  }

  // Model an image commit separately from effects so cached/early events can
  // arrive before either effect phase. A retained request can emit late events
  // after its node has been replaced, without a network or browser dependency.
  function commit(nextSrc, { complete = false, naturalWidth = 0 } = {}) {
    src = nextSrc;
    const preview = snapshot();
    const node = src ? { src, complete, naturalWidth } : null;
    attach(attachedRef, null);
    attachedRef = preview.imageProps.ref;
    attach(attachedRef, node);
    return {
      key: preview.imageKey,
      load() {
        assert.ok(node, "only mounted images can load");
        node.complete = true;
        node.naturalWidth = 640;
        preview.imageProps.onLoad({ currentTarget: node });
      },
      fail() {
        assert.ok(node, "only mounted images can fail");
        node.complete = true;
        node.naturalWidth = 0;
        preview.imageProps.onError({ currentTarget: node });
      },
    };
  }

  function flush(queue) {
    for (const [index, { effect, dependencies }] of queue) {
      queue.delete(index);
      cells[index].cleanup?.();
      cells[index].dependencies = dependencies;
      cells[index].cleanup = effect();
    }
  }

  return {
    commit,
    snapshot,
    flushEffects() {
      flush(layoutEffects);
      flush(passiveEffects);
    },
  };
}

function assertReady(harness) {
  const preview = harness.snapshot();
  assert.equal(preview.loading, false, "the loading overlay must be hidden");
  assert.equal(preview.error, "", "a successful/empty preview must not show an error");
}

function assertLoading(harness) {
  const preview = harness.snapshot();
  assert.equal(preview.loading, true, "the current image must keep its loading overlay");
  assert.equal(preview.error, "", "old errors must not cover the current image");
}

function assertFailed(harness) {
  const preview = harness.snapshot();
  assert.equal(preview.loading, false, "failure must stop the loading overlay");
  assert.match(preview.error, /预览加载失败/, "failure must expose the retry message");
}

test("an already cached image becomes ready without a new load event", () => {
  const harness = createHarness();
  harness.commit("/cached.svg", { complete: true, naturalWidth: 640 });
  harness.flushEffects();
  assertReady(harness);

  // Revealing an already mounted, CSS-hidden manual panel only rerenders it.
  harness.snapshot();
  harness.flushEffects();
  assertReady(harness);
});

test("a load event before the first effects cannot restart the loading overlay", () => {
  const harness = createHarness();
  const image = harness.commit("/early.svg");
  image.load();
  harness.flushEffects();
  assertReady(harness);
});

test("a new source loaded before effects stays ready after the source change", () => {
  const harness = createHarness();
  const first = harness.commit("/first.svg");
  harness.flushEffects();
  first.load();
  assertReady(harness);

  const second = harness.commit("/cached-next.svg");
  second.load();
  harness.flushEffects();
  assertReady(harness);
});

test("ordinary asynchronous loading shows progress until the image succeeds", () => {
  const harness = createHarness();
  const image = harness.commit("/slow.svg");
  harness.flushEffects();
  assertLoading(harness);

  image.load();
  assertReady(harness);
});

test("asynchronous failure stops progress and a successful new image clears the error", () => {
  const harness = createHarness();
  const failed = harness.commit("/failed.svg");
  harness.flushEffects();
  failed.fail();
  assertFailed(harness);

  const replacement = harness.commit("/replacement.svg");
  harness.flushEffects();
  assertLoading(harness);
  replacement.load();
  assertReady(harness);
});

test("an already complete broken image shows failure without waiting for an event", () => {
  const harness = createHarness();
  harness.commit("/broken.svg", { complete: true, naturalWidth: 0 });
  harness.flushEffects();
  assertFailed(harness);
});

test("rapid A to B to A changes reject late events even when an old URL matches", () => {
  const harness = createHarness();
  const firstA = harness.commit("/a.svg");
  harness.flushEffects();
  const oldB = harness.commit("/b.svg");
  harness.flushEffects();
  const currentA = harness.commit("/a.svg");
  harness.flushEffects();
  assertLoading(harness);

  firstA.load();
  assertLoading(harness);
  firstA.fail();
  assertLoading(harness);
  oldB.load();
  oldB.fail();
  assertLoading(harness);

  currentA.load();
  assertReady(harness);
  firstA.fail();
  assertReady(harness);
});

test("same URL retry replaces the image and ignores the previous attempt's events", () => {
  const harness = createHarness();
  const failed = harness.commit("/retry.svg");
  harness.flushEffects();
  failed.fail();
  assertFailed(harness);

  harness.snapshot().retry();
  const retry = harness.commit("/retry.svg");
  assert.notEqual(retry.key, failed.key, "retry must mount a fresh image node");
  harness.flushEffects();
  assertLoading(harness);

  failed.load();
  assertLoading(harness);
  failed.fail();
  assertLoading(harness);
  retry.load();
  assertReady(harness);
  failed.fail();
  assertReady(harness);
});

test("clearing the source removes loading and errors and rejects detached events", () => {
  const harness = createHarness();
  const old = harness.commit("/clear.svg");
  harness.flushEffects();
  old.fail();
  assertFailed(harness);

  harness.commit("");
  harness.flushEffects();
  assertReady(harness);
  old.load();
  old.fail();
  assertReady(harness);

  const emptyKey = harness.snapshot().imageKey;
  harness.snapshot().retry();
  assert.equal(harness.snapshot().imageKey, emptyKey, "an empty source cannot retry");
  assertReady(harness);
});
