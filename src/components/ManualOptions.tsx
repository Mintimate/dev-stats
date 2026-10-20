import { cardOptions, themes } from "../lib/constants";
import { PlatformSegment } from "./PlatformSegment";
import type { CardType, ManualConfig } from "../lib/types";

const THEME_DESCRIPTIONS: Record<string, string> = {
  github_dark: "GitHub 经典暗色", default: "默认经典浅色", transparent: "透明背景无边框",
  tokyonight: "东京之夜", dracula: "德拉科拉", catppuccin_mocha: "摩卡猫",
  rose_pine: "蔷薇松木", vue: "Vue 浅色", "vue-dark": "Vue 暗色",
  radical: "炫红暗色", graywhite: "极简灰白", ambient_gradient: "弥散渐变",
};

export function ManualOptions({ config, updateConfig, setPlatform, resetOptions }: {
  config: ManualConfig;
  updateConfig: (patch: Partial<ManualConfig>) => void;
  setPlatform: (platform: ManualConfig["platform"]) => void;
  resetOptions: () => void;
}) {
  const needsRepo = config.card === "pin" || config.card === "repo-languages";
  const needsLangLayout = config.card === "top-langs" || config.card === "repo-languages";
  const availableCardOptions = cardOptions.filter((option) => config.platform !== "cnb" || option.value !== "org");
  const displayOptions = [
    { key: "show_icons", label: "显示图标" }, { key: "hide_border", label: "隐藏外边框" },
    { key: "hide_title", label: "隐藏卡片标题" }, { key: "hide_rank", label: "隐藏评级排名" },
    { key: "disable_animations", label: "禁用动画效果" }, { key: "text_bold", label: "加粗文本" },
    ...(config.card === "stats" ? [
      { key: "include_all_commits", label: "包含所有提交" }, { key: "prs_merged", label: "统计已合并 PR" },
    ] : []),
  ];

  return (
    <section className="panel manual-options">
      <div className="panel-head">
        <div><h2 className="panel-title">给主页配张卡</h2><span className="panel-note">数据负责说话，配色由你决定。</span></div>
        <button className="btn subtle" type="button" onClick={resetOptions}>恢复默认</button>
      </div>
      <div className="manual-fields">
        <div className="field"><span className="field-label">代码平台</span><PlatformSegment platform={config.platform} onChange={setPlatform} /></div>
        <div className="field">
          <label htmlFor="username">开发者 / 组织用户名</label>
          <input id="username" value={config.username} placeholder="例如 Mintimate" autoComplete="off" onChange={(event) => updateConfig({ username: event.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="card-type">统计卡片</label>
          <select id="card-type" value={config.card} onChange={(event) => updateConfig({ card: event.target.value as CardType })}>
            {availableCardOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="theme">配色主题</label>
          <select id="theme" value={config.theme} onChange={(event) => updateConfig({ theme: event.target.value })}>
            {themes.map((theme) => <option key={theme} value={theme}>{THEME_DESCRIPTIONS[theme] || theme} · {theme}</option>)}
          </select>
        </div>
        {needsRepo && <div className="field">
          <label htmlFor="repo">仓库名</label>
          <input id="repo" value={config.repo} placeholder="例如 dev-stats" autoComplete="off" onChange={(event) => updateConfig({ repo: event.target.value })} />
        </div>}
      </div>
      <details className="manual-advanced">
        <summary>高级选项 <span>标题、布局与显示设置</span></summary>
        <div className="manual-fields">
          <div className="field">
            <label htmlFor="custom-title">自定义标题</label>
            <input id="custom-title" value={config.custom_title} placeholder="留空使用默认标题" onChange={(event) => updateConfig({ custom_title: event.target.value })} />
          </div>
          {needsLangLayout && <>
            <div className="field">
              <label htmlFor="layout">语言卡片布局</label>
              <select id="layout" value={config.layout} onChange={(event) => updateConfig({ layout: event.target.value })}>
                <option value="normal">默认布局</option><option value="compact">紧凑布局</option>
                <option value="donut">环形图</option><option value="donut-vertical">垂直环形图</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="langs-count">展示语言数量</label>
              <input id="langs-count" type="number" min={1} max={20} value={config.langs_count} onChange={(event) => updateConfig({ langs_count: Number(event.target.value || 0) })} />
            </div>
          </>}
          {config.card === "recent-activity" && <div className="field">
            <label htmlFor="activity-count">最近动态条数</label>
            <input id="activity-count" type="number" min={1} max={20} value={config.activity_count} onChange={(event) => updateConfig({ activity_count: Number(event.target.value || 0) })} />
          </div>}
          <div className="field">
            <label htmlFor="card-width">卡片宽度</label>
            <input id="card-width" type="number" min={0} max={1200} value={config.card_width} onChange={(event) => updateConfig({ card_width: Number(event.target.value || 0) })} />
            <span className="field-help">单位 px，0 表示使用默认宽度。</span>
          </div>
          <div className="manual-toggles">
            {displayOptions.map(({ key, label }) => <label className="manual-toggle" key={key} htmlFor={`flag-${key}`}>
              <input id={`flag-${key}`} type="checkbox" checked={Boolean(config[key as keyof ManualConfig])} onChange={(event) => updateConfig({ [key]: event.target.checked } as Partial<ManualConfig>)} />
              <span>{label}</span>
            </label>)}
          </div>
        </div>
      </details>
    </section>
  );
}
