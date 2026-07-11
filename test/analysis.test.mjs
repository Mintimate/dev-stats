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

const analysis = await importTypeScriptModule("agents/chat/_analysis.ts");
const statsUrl = await importTypeScriptModule("src/lib/statsUrl.ts");

const githubEvidence = {
  user: {
    login: "ExampleDev",
    name: "Example Dev",
    bio: "Builds useful things",
    blog: "https://example.dev",
    created_at: "2016-01-01T00:00:00Z",
    followers: 450,
    following: 100,
    public_repos: 25,
  },
  repos: [
    { name: "flagship", description: "A production-ready tool", language: "TypeScript", stargazers_count: 1200, forks_count: 90, size: 900, pushed_at: new Date().toISOString(), fork: false, archived: false },
    { name: "library", description: "Reusable library", language: "Go", stargazers_count: 120, forks_count: 12, size: 400, pushed_at: new Date().toISOString(), fork: false, archived: false },
    { name: "old-fork", stargazers_count: 5000, forks_count: 800, size: 100, pushed_at: new Date().toISOString(), fork: true, archived: false },
  ],
  contributions: [
    { name: "open-source/core", stargazers_count: 30000, pr_count: 7 },
  ],
};

test("deterministic GitHub analysis excludes forks and includes external contribution evidence", () => {
  const result = analysis.createDeterministicAnalysis("github", githubEvidence, "exampledev");

  assert.equal(result.username, "ExampleDev");
  assert.ok(result.score >= 10 && result.score <= 100);
  assert.equal(result.dimension_scores.original_projects <= 20, true);
  assert.equal(result.top_repos.some((repo) => repo.name === "old-fork"), false);
  assert.equal(result.top_repos.some((repo) => repo.name === "open-source/core"), true);
  assert.equal(result.coverage.sampled_repos, 3);
});

test("README validation overrides all model-controlled rating fields", () => {
  const trusted = analysis.createDeterministicAnalysis("github", githubEvidence, "exampledev");
  const draft = analysis.validateReadmeDraft({
    title: "Example README",
    markdown: "# Example",
    score: 100,
    objective_rating: "夯",
    dimension_scores: { maturity: 20 },
    top_repos: [{ name: "invented/repo", stars: 999999, contributions_desc: "Owner" }],
    badges: ["#真实信号"],
  }, trusted);

  assert.equal(draft.score, trusted.score);
  assert.equal(draft.objective_rating, trusted.objective_rating);
  assert.deepEqual(draft.dimension_scores, trusted.dimension_scores);
  assert.deepEqual(draft.top_repos, trusted.top_repos);
  assert.equal(draft.analysis_version, "v1");
});

test("README card normalization replaces known third-party cards but preserves unrelated badges", () => {
  const markdown = [
    "# Example Dev",
    "![Custom badge](https://img.shields.io/badge/TypeScript-blue)",
    "![GitHub Stats](https://github-readme-stats.vercel.app/api?username=exampledev)",
    "![Streak](https://streak-stats.demolab.com?user=exampledev)",
  ].join("\n");
  const normalized = analysis.replaceReadmeStatsCards(markdown, {
    platform: "github",
    username: "ExampleDev",
    siteOrigin: "https://stats.example.dev",
    theme: "github_dark",
  });

  assert.match(normalized, /https:\/\/stats\.example\.dev\/api\?username=ExampleDev&theme=github_dark&show_icons=true/);
  assert.match(normalized, /https:\/\/stats\.example\.dev\/api\/top-langs\?username=ExampleDev&theme=github_dark&layout=compact/);
  assert.doesNotMatch(normalized, /github-readme-stats\.vercel\.app|streak-stats\.demolab\.com/);
  assert.match(normalized, /img\.shields\.io/);
});

test("manual Stats links retain the deployed hostname for README export", () => {
  globalThis.window = { location: { origin: "https://stats.example.dev" } };
  const config = {
    platform: "github",
    username: "Mintimate/oh-my-rime",
    card: "stats",
    repo: "dev-stats",
    theme: "github_dark",
    custom_title: "",
    layout: "normal",
    langs_count: 8,
    activity_count: 5,
    card_width: 0,
    show_icons: true,
    hide_border: false,
    include_all_commits: false,
    prs_merged: false,
    hide_title: false,
    hide_rank: false,
    disable_animations: false,
    text_bold: true,
    agent_mode: "stats",
  };
  const url = statsUrl.buildStatsUrl(config);

  assert.equal(url, "https://stats.example.dev/api?username=Mintimate%2Foh-my-rime&theme=github_dark&show_icons=true");
  assert.match(statsUrl.buildMarkdown(config, url), /https:\/\/stats\.example\.dev\/api\?/);
});

test("Stats recipes export every supported card and fall back from CNB organization cards", () => {
  globalThis.window = { location: { origin: "https://stats.example.dev" } };
  const recipe = {
    platform: "cnb",
    username: "Mintimate",
    cards: ["stats", "org", "top-langs", "stats"],
    theme: "github_dark",
    options: {},
  };
  const markdown = statsUrl.buildMarkdownForRecipe(recipe);
  const config = statsUrl.recipeToConfig({ ...recipe, cards: ["org"] }, {
    platform: "github",
    username: "Mintimate",
    card: "org",
    repo: "dev-stats",
    theme: "default",
    custom_title: "",
    layout: "normal",
    langs_count: 8,
    activity_count: 5,
    card_width: 0,
    show_icons: true,
    hide_border: false,
    include_all_commits: false,
    prs_merged: false,
    hide_title: false,
    hide_rank: false,
    disable_animations: false,
    text_bold: true,
    agent_mode: "stats",
  });

  assert.match(markdown, /\/api\?username=Mintimate&platform=cnb/);
  assert.match(markdown, /\/api\/top-langs\?username=Mintimate&platform=cnb/);
  assert.doesNotMatch(markdown, /\/api\/org/);
  assert.equal(config.card, "stats");
});

test("GitHub repository cards never use an external contribution path as the owner repository", () => {
  const trusted = analysis.createDeterministicAnalysis("github", githubEvidence, "exampledev");
  const result = analysis.validateStatsRecipe({
    cards: ["stats", "pin"],
    options: { repo: "open-source/core" },
  }, trusted);

  assert.equal(result.recipe.options.repo, "flagship");
});

test("CNB recipe validation removes unsupported org cards and invented repositories", () => {
  const trusted = analysis.createDeterministicAnalysis("cnb", {
    user: { username: "Mintimate", follower_count: 10, follow_count: 2, public_repo_count: 2, created_at: "2020-01-01T00:00:00Z" },
    totals: { stars: 30, forks: 5, commits: 100, pull_requests: 8, issues: 2, active_days: 15 },
    top_repos: [{ path: "Mintimate/project", name: "project", description: "Useful project", star_count: 20, fork_count: 3, language: "TypeScript", updated_at: new Date().toISOString() }],
  }, "Mintimate");
  const result = analysis.validateStatsRecipe({
    cards: ["stats", "org", "pin", "repo-languages"],
    options: { repo: "made-up/repo" },
  }, trusted);

  assert.equal(result.recipe.platform, "cnb");
  assert.equal(result.recipe.cards.includes("org"), false);
  assert.equal(result.recipe.options.repo, "Mintimate/project");
});
