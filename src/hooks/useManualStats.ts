import { useMemo, useState } from "react";
import { defaultConfig } from "../lib/constants";
import { buildMarkdown, buildStatsUrl, profileUrlFor, recipeToConfig } from "../lib/statsUrl";
import type { ManualConfig, Platform, StatsRecipe } from "../lib/types";

export function useManualStats() {
  const [config, setConfig] = useState<ManualConfig>(defaultConfig);

  const previewUrl = useMemo(() => buildStatsUrl(config), [config]);
  const markdown = useMemo(() => buildMarkdown(config, previewUrl), [config, previewUrl]);
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
    updateConfig,
    setPlatform,
    resetOptions,
    syncUsername,
    applyRecipe,
  };
}
