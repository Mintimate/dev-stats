import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";

const bundle = await build({
  entryPoints: ["src/hooks/useManualStats.ts"],
  bundle: true,
  platform: "node",
  format: "cjs",
  external: ["react"],
  write: false,
});

test("star history exports a chart only for a separate GitHub owner and repository name", () => {
  const state = [];
  let cursor = 0;
  let previewEffect;
  const module = { exports: {} };
  vm.runInNewContext(bundle.outputFiles[0].text, {
    module,
    URL,
    window: {
      location: { origin: "https://stats.example" },
      setTimeout(callback) { callback(); },
      clearTimeout() {},
    },
    require(name) {
      assert.equal(name, "react");
      return {
        useState(initial) {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (update) => {
            state[index] = typeof update === "function" ? update(state[index]) : update;
          }];
        },
        useEffect(effect) { previewEffect = effect; },
        useMemo(compute) { return compute(); },
      };
    },
  });

  function render() {
    cursor = 0;
    return module.exports.useManualStats();
  }

  for (const [username, repo] of [
    ["Mintimate", "Mintimate/oh-my-rime"],
    ["Mintimate", "https://github.com/Mintimate/oh-my-rime"],
    ["Mintimate", ".."],
    ["https://github.com/Mintimate", "oh-my-rime"],
  ]) {
    render().updateConfig({ card: "star-history", username, repo });
    assert.ok(render().validationMessage);
    previewEffect();
    const preview = render();
    assert.equal(preview.previewUrl, "");
    assert.equal(preview.markdown, "");
  }

  render().updateConfig({ username: " Mintimate ", repo: " oh-my-rime " });
  render();
  previewEffect();
  const preview = render();
  const url = new URL(preview.previewUrl);
  assert.equal(preview.validationMessage, "");
  assert.equal(url.pathname, "/api/star-history");
  assert.equal(url.searchParams.get("username"), "Mintimate");
  assert.equal(url.searchParams.get("repo"), "oh-my-rime");
  assert.match(preview.markdown, /\]\(https:\/\/github\.com\/Mintimate\/oh-my-rime\)$/);
});
