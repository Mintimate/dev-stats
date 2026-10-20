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

const { recipeFromEvent } = await importTypeScriptModule("src/lib/agentLogic.ts");
const { recipeCards } = await importTypeScriptModule("src/lib/statsUrl.ts");
const recipe = {
  platform: "github",
  username: "ExampleDev",
  cards: ["stats", "top-langs", "pin"],
  theme: "default",
  rationale: "Based on public projects.",
  options: { repo: "example-project", show_icons: true },
};

test("stats recipe tool events preserve nested recipe fields", () => {
  assert.deepEqual(recipeFromEvent({ type: "stats_recipe", ok: true, recipe }), recipe);
});

test("stats recipe fallback and final-output events accept flat fields without leaking envelope fields", () => {
  assert.deepEqual(recipeFromEvent({ type: "stats_recipe", ...recipe }), recipe);
  assert.deepEqual(recipeFromEvent({ type: "stats_recipe", ok: true, ...recipe }), recipe);
});

test("partial recipes retain the fields used to fill in the active analysis target", () => {
  assert.deepEqual(
    recipeFromEvent({ type: "stats_recipe", recipe: { cards: ["stats"] } }),
    { cards: ["stats"] },
  );
  const cnbRecipe = { ...recipe, platform: "cnb", username: "ExampleCNB" };
  assert.deepEqual(recipeFromEvent({ type: "stats_recipe", ...cnbRecipe }), cnbRecipe);
});

test("an empty card list retains the existing default-card behavior", () => {
  const emptyRecipe = { ...recipe, cards: [] };
  assert.deepEqual(recipeFromEvent({ type: "stats_recipe", recipe: emptyRecipe }), emptyRecipe);
  const parsed = recipeFromEvent({ type: "stats_recipe", ...emptyRecipe });
  assert.deepEqual(parsed, emptyRecipe);
  assert.deepEqual(recipeCards(parsed), ["stats"]);
});

test("invalid or unsuccessful events cannot become a displayable stats result", () => {
  const invalidEvents = [
    null,
    undefined,
    "stats_recipe",
    [],
    new Date(),
    { type: "readme_draft", ...recipe },
    { type: "stats_recipe", ok: false, recipe },
    { type: "stats_recipe" },
    { type: "stats_recipe", recipe: null },
    { type: "stats_recipe", recipe: "invalid" },
    { type: "stats_recipe", recipe: [] },
    { type: "stats_recipe", recipe: new Date() },
    { type: "stats_recipe", recipe: Object.create(recipe) },
    { type: "stats_recipe", ...recipe, recipe: null },
  ];
  for (const event of invalidEvents) assert.equal(recipeFromEvent(event), undefined);
});

test("malformed recipe fields are rejected in both event formats", () => {
  const malformedRecipes = [
    {},
    { ...recipe, cards: undefined },
    { ...recipe, cards: "stats" },
    { ...recipe, cards: ["stats", 42] },
    { ...recipe, cards: ["unsupported-card"] },
    { ...recipe, platform: "unknown" },
    { ...recipe, username: 42 },
    { ...recipe, theme: {} },
    { ...recipe, rationale: [] },
    { ...recipe, options: null },
    { ...recipe, options: [] },
    { ...recipe, options: "show_icons=true" },
  ];
  for (const malformed of malformedRecipes) {
    assert.equal(recipeFromEvent({ type: "stats_recipe", recipe: malformed }), undefined);
    assert.equal(recipeFromEvent({ type: "stats_recipe", ...malformed }), undefined);
  }
});
