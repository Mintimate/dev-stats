import type { CardType, ManualConfig, Platform, StatsRecipe } from "./types";

export function profileUrlFor(config: Pick<ManualConfig, "platform" | "username">) {
  const name = encodeURIComponent(config.username || "Mintimate");
  return config.platform === "cnb" ? `https://cnb.cool/u/${name}` : `https://github.com/${name}`;
}

export function endpointFor(card: string) {
  if (card === "stats") return "/api";
  if (card === "org") return "/api/org";
  return `/api/${card}`;
}

export function buildStatsUrl(config: ManualConfig, cardOverride?: CardType) {
  const card = cardOverride || config.card;
  const url = new URL(endpointFor(card), window.location.origin);
  const isOrg = card === "org";

  if (isOrg) url.searchParams.set("org", config.username || "edgeone");
  else url.searchParams.set("username", config.username || "Mintimate");

  if (config.platform !== "github") url.searchParams.set("platform", config.platform);
  if (config.theme) url.searchParams.set("theme", config.theme);
  if (config.custom_title) url.searchParams.set("custom_title", config.custom_title);
  if (config.show_icons) url.searchParams.set("show_icons", "true");
  if (config.hide_border) url.searchParams.set("hide_border", "true");
  if (config.hide_title) url.searchParams.set("hide_title", "true");
  if (config.hide_rank) url.searchParams.set("hide_rank", "true");
  if (config.disable_animations) url.searchParams.set("disable_animations", "true");
  if (!config.text_bold) url.searchParams.set("text_bold", "false");
  if (config.card_width > 0) url.searchParams.set("card_width", String(config.card_width));

  if (card === "stats") {
    if (config.include_all_commits) url.searchParams.set("include_all_commits", "true");
    if (config.prs_merged) url.searchParams.set("show", "prs_merged");
  }

  if (card === "top-langs" || card === "repo-languages") {
    url.searchParams.set("langs_count", String(config.langs_count || 8));
    if (config.layout !== "normal") url.searchParams.set("layout", config.layout);
  }

  if (card === "recent-activity") url.searchParams.set("activity_count", String(config.activity_count || 5));

  if (card === "pin" || card === "repo-languages") {
    url.searchParams.set("repo", config.repo || "dev-stats");
  }

  // 手动面板导出的 Markdown 会被粘贴到 GitHub/CNB 等站外 README；必须保留当前部署域名，
  // 否则 `/api?...` 会被解释为目标仓库的相对路径而无法渲染。
  return url.toString();
}

export function buildMarkdown(config: ManualConfig, url: string) {
  const label = `${config.platform} ${config.card}`;
  const target =
    config.platform === "cnb"
      ? `https://cnb.cool/u/${encodeURIComponent(config.username || "")}`
      : `https://github.com/${encodeURIComponent(config.username || "")}`;
  return `[![${label}](${url})](${target})`;
}

export function recipeToConfig(recipe: StatsRecipe, fallback: ManualConfig): ManualConfig {
  const options = recipe.options || {};
  return {
    ...fallback,
    platform: (recipe.platform || fallback.platform) as Platform,
    username: recipe.username || fallback.username,
    card: recipe.cards?.[0] || fallback.card,
    theme: recipe.theme || fallback.theme,
    repo: String(options.repo || fallback.repo),
    custom_title: String(options.custom_title || fallback.custom_title),
    layout: String(options.layout || fallback.layout),
    langs_count: Number(options.langs_count || fallback.langs_count),
    activity_count: Number(options.activity_count || fallback.activity_count),
    card_width: Number(options.card_width || fallback.card_width),
    show_icons: typeof options.show_icons === "boolean" ? options.show_icons : fallback.show_icons,
    hide_border: typeof options.hide_border === "boolean" ? options.hide_border : fallback.hide_border,
    include_all_commits:
      typeof options.include_all_commits === "boolean" ? options.include_all_commits : fallback.include_all_commits,
    prs_merged: typeof options.prs_merged === "boolean" ? options.prs_merged : fallback.prs_merged,
    hide_title: typeof options.hide_title === "boolean" ? options.hide_title : fallback.hide_title,
    hide_rank: typeof options.hide_rank === "boolean" ? options.hide_rank : fallback.hide_rank,
    disable_animations:
      typeof options.disable_animations === "boolean" ? options.disable_animations : fallback.disable_animations,
    text_bold: typeof options.text_bold === "boolean" ? options.text_bold : fallback.text_bold,
  };
}

export function buildUrlForRecipeCard(recipe: StatsRecipe, card: CardType) {
  const config = recipeToConfig({ ...recipe, cards: [card] }, {
    platform: recipe.platform || "github",
    username: recipe.username || "Mintimate",
    card,
    repo: "dev-stats",
    theme: recipe.theme || "github_dark",
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
  return buildStatsUrl(config, card);
}
