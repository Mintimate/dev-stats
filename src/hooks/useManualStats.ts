import { useEffect, useMemo, useState } from "react";
import { defaultConfig } from "../lib/constants";
import { buildMarkdown, buildStatsUrl, profileUrlFor, recipeToConfig } from "../lib/statsUrl";
import type { ManualConfig, Platform, StatsRecipe } from "../lib/types";

export function useManualStats() {
  const [config, setConfig] = useState<ManualConfig>(defaultConfig);
  const [previewConfig, setPreviewConfig] = useState<ManualConfig>(defaultConfig);

  useEffect(() => {
    const timer = window.setTimeout(() => setPreviewConfig(config), 300);
    return () => window.clearTimeout(timer);
  }, [config]);

  const validationMessage = useMemo(() => {
    if (!config.username.trim()) return "请输入开发者或组织用户名后再生成预览。";
    if ((config.card === "pin" || config.card === "repo-languages") && !config.repo.trim()) {
      return "当前卡片需要填写目标仓库名。";
    }
    return "";
  }, [config.card, config.repo, config.username]);
  const previewIsValid = previewConfig.username.trim()
    && (!(previewConfig.card === "pin" || previewConfig.card === "repo-languages") || previewConfig.repo.trim());
  const previewUrl = useMemo(() => previewIsValid ? buildStatsUrl(previewConfig) : "", [previewConfig, previewIsValid]);
  const markdown = useMemo(() => previewUrl ? buildMarkdown(previewConfig, previewUrl) : "", [previewConfig, previewUrl]);
  const profileUrl = useMemo(() => profileUrlFor(config), [config]);

  function updateConfig(patch: Partial<ManualConfig>) {
    setConfig((current) => ({ ...current, ...patch }));
  }

  function setPlatform(platform: Platform) {
    setConfig((current) => ({
      ...current,
      platform,
      card: platform === "cnb" && current.card === "org" ? "stats" : current.card,
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
