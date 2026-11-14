import { useEffect, useMemo, useState } from "react";
import { defaultConfig } from "../lib/constants";
import { buildMarkdown, buildStatsUrl, cardNeedsRepo, platformSupportsCard, profileUrlFor, recipeToConfig } from "../lib/statsUrl";
import type { ManualConfig, Platform, StatsRecipe } from "../lib/types";

function validateManualConfig(config: ManualConfig) {
  const username = config.username.trim();
  const needsRepo = cardNeedsRepo(config.card);
  const repo = needsRepo ? config.repo.trim() : "";
  const isStarHistory = config.card === "star-history";
  if (!username) {
    return isStarHistory
      ? "请输入仓库所有者后再生成预览。"
      : "请输入开发者或组织用户名后再生成预览。";
  }
  if (needsRepo && !repo) {
    return "当前卡片需要填写目标仓库名。";
  }
  if (isStarHistory && !/^[A-Za-z0-9-]{1,39}$/.test(username)) {
    return "请输入 GitHub 仓库所有者的用户名，例如 Mintimate。";
  }
  if (isStarHistory && (!/^[A-Za-z0-9_.-]{1,100}$/.test(repo) || repo === "." || repo === "..")) {
    return "请填写仓库名，例如 oh-my-rime。所有者请填在上方。";
  }
  return "";
}

export function useManualStats() {
  const [config, setConfig] = useState<ManualConfig>(defaultConfig);
  const [previewConfig, setPreviewConfig] = useState<ManualConfig>(defaultConfig);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewConfig(config), 300);
    return () => window.clearTimeout(timer);
  }, [config]);

  const validationMessage = validateManualConfig(config);
  const previewUrl = useMemo(() => validateManualConfig(previewConfig) ? "" : buildStatsUrl(previewConfig), [previewConfig]);
  const markdown = useMemo(() => previewUrl ? buildMarkdown(previewConfig, previewUrl) : "", [previewConfig, previewUrl]);
  const profileUrl = useMemo(() => profileUrlFor(config), [config]);

  function updateConfig(patch: Partial<ManualConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function setPlatform(platform: Platform) {
    setConfig((current) => ({
      ...current,
      platform,
      card: platformSupportsCard(platform, current.card) ? current.card : "stats",
    }));
  }

  function resetOptions() {
    setConfig(defaultConfig);
  }

  function syncUsername(username: string) {
    updateConfig({ username });
  }

  function applyRecipe(recipe: StatsRecipe) {
    setConfig((current) => recipeToConfig(recipe, current));
  }

  return {
    config,
    previewUrl,
    markdown,
    profileUrl,
    previewPending: previewConfig !== config,
    validationMessage,
    updateConfig,
    setPlatform,
    resetOptions,
    syncUsername,
    applyRecipe,
  };
}
