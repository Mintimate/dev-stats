import { cardOptions, themes } from "../lib/constants";
import { PlatformSegment } from "./PlatformSegment";
import type { CardType, ManualConfig } from "../lib/types";

const THEME_DESCRIPTIONS: Record<string, string> = {
  github_dark: "GitHub 经典暗色",
  default: "默认经典浅色",
  transparent: "透明背景无边框",
  tokyonight: "东京之夜 (暗色)",
  dracula: "经典德拉科拉 (暗色)",
  catppuccin_mocha: "摩卡猫 (猫咪暗色)",
  rose_pine: "蔷薇松木 (微红暗色)",
  vue: "Vue 官方经典浅色",
  "vue-dark": "Vue 官方经典暗色",
  radical: "激进炫红 (暗色)",
  graywhite: "极简灰白双色",
  ambient_gradient: "炫彩弥散渐变 (霓虹)",
};

export function ManualOptions({
  config,
  updateConfig,
  setPlatform,
  resetOptions,
}: {
  config: ManualConfig;
  updateConfig: (patch: Partial<ManualConfig>) => void;
  setPlatform: (platform: ManualConfig["platform"]) => void;
  resetOptions: () => void;
}) {
  const needsRepo = config.card === "pin" || config.card === "repo-languages";
  const availableCardOptions = cardOptions.filter((option) => config.platform !== "cnb" || option.value !== "org");
  // top-langs 与 repo-languages 都需要 layout 与 langs_count，合并为单一判定。
  const needsLangLayout = config.card === "top-langs" || config.card === "repo-languages";
  const needsActivityCount = config.card === "recent-activity";

  const displayOptions = [
    { key: "show_icons", label: "显示图标" },
    { key: "hide_border", label: "隐藏外边框" },
    { key: "hide_title", label: "隐藏卡片标题" },
    { key: "hide_rank", label: "隐藏评级排名" },
    { key: "disable_animations", label: "禁用动画效果" },
    { key: "text_bold", label: "加粗文本" },
    ...(config.card === "stats" ? [
      { key: "include_all_commits", label: "包含所有提交" },
      { key: "prs_merged", label: "统计已合并 PR" }
    ] : [])
  ];

  let row = 1;
  const getLine = () => String(row++).padStart(2, "0");

  return (
    <section className="panel">
      <div className="panel-head">
        <div className="panel-title-group">
          <div className="panel-window-controls">
            <span className="dot dot-close" />
            <span className="dot dot-minimize" />
            <span className="dot dot-expand" />
          </div>
          <div>
            <h2 className="panel-title">Config Compiler (参数配置编译器)</h2>
            <span className="panel-note">// 参数变化将即时触发实时渲染管线，更新编译预览与 Markdown</span>
          </div>
        </div>
        <button className="btn subtle" type="button" onClick={resetOptions}>git reset --hard</button>
      </div>
      <div className="editor-container">

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">const</span> <span className="code-var">TARGET_PLATFORM</span> = <PlatformSegment platform={config.platform} onChange={setPlatform} /><span className="code-operator">;</span> <span className="code-comment">// 目标托管平台</span>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">const</span> <span className="code-var">DEVELOPER_ID</span> = <span className="code-string">"</span>
            <input id="username" value={config.username} placeholder="e.g. Mintimate" autoComplete="off" onChange={(event) => updateConfig({ username: event.target.value })} />
            <span className="code-string">"</span><span className="code-operator">;</span> <span className="code-comment">// 开发者/组织用户名</span>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">const</span> <span className="code-var">WIDGET_MODULE</span> = <span className="code-type">Widget</span><span className="code-operator">.</span>
            <select id="card-type" value={config.card} onChange={(event) => updateConfig({ card: event.target.value as CardType })}>
              {availableCardOptions.map((option) => {
                const chineseLabel = option.label.split(" (")[0];
                const codeVal = option.value.toUpperCase().replace(/-/g, "_");
                return (
                  <option key={option.value} value={option.value}>
                    {codeVal} // {chineseLabel}
                  </option>
                );
              })}
            </select>
            <span className="code-operator">;</span> <span className="code-comment">// 统计卡片类型 (当前: {cardOptions.find(c => c.value === config.card)?.label})</span>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">const</span> <span className="code-var">THEME_SCHEME</span> = <span className="code-type">Theme</span><span className="code-operator">.</span>
            <select id="theme" value={config.theme} onChange={(event) => updateConfig({ theme: event.target.value })}>
              {themes.map((theme) => {
                const label = THEME_DESCRIPTIONS[theme] || theme;
                const codeVal = theme.toUpperCase().replace(/-/g, "_");
                return (
                  <option key={theme} value={theme}>
                    {codeVal} // {label}
                  </option>
                );
              })}
            </select>
            <span className="code-operator">;</span> <span className="code-comment">// 视觉卡片配色主题</span>
          </div>
        </div>

        {needsRepo && (
          <div className="editor-row">
            <div className="editor-row-gutter">{getLine()}</div>
            <div className="editor-row-content">
              <span className="code-keyword">const</span> <span className="code-var">TARGET_REPOSITORY</span> = <span className="code-string">"</span>
              <input id="repo" value={config.repo} placeholder="e.g. dev-stats" autoComplete="off" onChange={(event) => updateConfig({ repo: event.target.value })} />
              <span className="code-string">"</span><span className="code-operator">;</span> <span className="code-comment">// 关联的具体项目仓库名</span>
            </div>
          </div>
        )}

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">let</span> <span className="code-var">CUSTOM_HEADER</span> = <span className="code-string">"</span>
            <input id="custom-title" value={config.custom_title} placeholder="// 留空则使用默认配置" onChange={(event) => updateConfig({ custom_title: event.target.value })} />
            <span className="code-string">"</span><span className="code-operator">;</span> <span className="code-comment">// 自定义标题头名称</span>
          </div>
        </div>

        {needsLangLayout && (
          <div className="editor-row">
            <div className="editor-row-gutter">{getLine()}</div>
            <div className="editor-row-content">
              <span className="code-keyword">let</span> <span className="code-var">GRID_LAYOUT</span> = <span className="code-type">Layout</span><span className="code-operator">.</span>
              <select id="layout" value={config.layout} onChange={(event) => updateConfig({ layout: event.target.value })}>
                <option value="normal">NORMAL // 默认布局</option>
                <option value="compact">COMPACT // 紧凑布局</option>
                <option value="donut">DONUT // 环形图布局</option>
                <option value="donut-vertical">DONUT_VERTICAL // 垂直环形图布局</option>
              </select>
              <span className="code-operator">;</span> <span className="code-comment">// 布局排列排版方式</span>
            </div>
          </div>
        )}

        {needsLangLayout && (
          <div className="editor-row">
            <div className="editor-row-gutter">{getLine()}</div>
            <div className="editor-row-content">
              <span className="code-keyword">let</span> <span className="code-var">LANG_LIMIT</span> = <span className="code-number"></span>
              <input
                id="langs-count"
                type="number"
                min={1}
                max={20}
                value={config.langs_count}
                onChange={(event) => updateConfig({ langs_count: Number(event.target.value || 0) })}
              />
              <span className="code-operator">;</span> <span className="code-comment">// 限制展示的编程语言总数</span>
            </div>
          </div>
        )}

        {needsActivityCount && (
          <div className="editor-row">
            <div className="editor-row-gutter">{getLine()}</div>
            <div className="editor-row-content">
              <span className="code-keyword">let</span> <span className="code-var">ACT_LIMIT</span> = <span className="code-number"></span>
              <input
                id="activity-count"
                type="number"
                min={1}
                max={20}
                value={config.activity_count}
                onChange={(event) => updateConfig({ activity_count: Number(event.target.value || 0) })}
              />
              <span className="code-operator">;</span> <span className="code-comment">// 限制展示的动态日志总条数</span>
            </div>
          </div>
        )}

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">let</span> <span className="code-var">CANVAS_WIDTH</span> = <span className="code-number"></span>
            <input
              id="card-width"
              type="number"
              min={0}
              max={1200}
              value={config.card_width}
              onChange={(event) => updateConfig({ card_width: Number(event.target.value || 0) })}
            />
            <span className="code-operator">;</span> <span className="code-comment">// 自定义画布宽度限制 (0为自适应)</span>
          </div>
        </div>

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-keyword">const</span> <span className="code-var">FEATURE_FLAGS</span> = <span className="code-operator">{'{'}</span>
          </div>
        </div>

        {displayOptions.map(({ key, label }) => (
          <div className="editor-row" key={key}>
            <div className="editor-row-gutter">{getLine()}</div>
            <div className="editor-row-content indent-1">
              <span className="code-key">"{key}"</span><span className="code-operator">:</span>
              <input
                type="checkbox"
                checked={Boolean(config[key as keyof ManualConfig])}
                onChange={(event) => updateConfig({ [key]: event.target.checked } as Partial<ManualConfig>)}
              />
              <span className="code-operator">,</span> <span className="code-comment">// {label}</span>
            </div>
          </div>
        ))}

        <div className="editor-row">
          <div className="editor-row-gutter">{getLine()}</div>
          <div className="editor-row-content">
            <span className="code-operator">{'};'}</span>
          </div>
        </div>

      </div>
    </section>
  );
}
