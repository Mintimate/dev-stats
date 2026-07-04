import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RadarChart } from "./components/RadarChart";
import { ShareModal } from "./components/ShareModal";
import { useAgentRun } from "./hooks/useAgentRun";
import { useImagePreview } from "./hooks/useImagePreview";
import { useManualStats } from "./hooks/useManualStats";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import type { LeaderboardItem } from "./components/LeaderboardPanel";
import { cardMetadata, cardOptions, themes, toolchainItems } from "./lib/constants";
import { renderMarkdown } from "./lib/markdown";
import { buildUrlForRecipeCard } from "./lib/statsUrl";
import type { AgentMode, CardType, GlobalStatus, ManualConfig, ReadmeResult, StatsRecipe, ViewName } from "./lib/types";
import "./styles.css";

function TopBar({
  view,
  setView,
  config,
  status,
}: {
  view: ViewName;
  setView: (view: ViewName) => void;
  config: ManualConfig;
  status: GlobalStatus;
}) {
  const selectedCard = cardOptions.find((item) => item.value === config.card)?.label || config.card;

  return (
    <header className="topbar">
      <div className="brand">
        <div className="mark">
          <img src="/favicon.svg" alt="GS Logo" />
        </div>
        <div>
          <h1>DevStats 统计工坊</h1>
          <p className="sub">GitHub / CNB 主页 README 与统计卡片生成台</p>
        </div>
      </div>
      <div className="topbar-tools">
        <nav className="primary-nav" aria-label="主视图">
          <button className={`nav-btn ${view === "agent" ? "active" : ""}`} type="button" onClick={() => setView("agent")}>
            AI 分析
          </button>
          <button className={`nav-btn ${view === "manual" ? "active" : ""}`} type="button" onClick={() => setView("manual")}>
            手动配置
          </button>
        </nav>
        <div className="context-strip" aria-label="当前上下文">
          <span className="context-chip">
            <span className="context-label">平台</span>
            <span className="context-value">{config.platform === "github" ? "GitHub" : "CNB"}</span>
          </span>
          <span className="context-chip">
            <span className="context-label">卡片</span>
            <span className="context-value">{selectedCard}</span>
          </span>
          <span className={`context-chip status ${status.tone || ""}`}>
            <span className="context-label">状态</span>
            <span className="context-value">{status.label}</span>
          </span>
        </div>
      </div>
    </header>
  );
}

function PlatformSegment({
  platform,
  disabled,
  onChange,
}: {
  platform: ManualConfig["platform"];
  disabled?: boolean;
  onChange: (platform: ManualConfig["platform"]) => void;
}) {
  return (
    <div className="segmented">
      <button type="button" data-platform="github" disabled={disabled} className={platform === "github" ? "active" : ""} onClick={() => onChange("github")}>
        GitHub
      </button>
      <button type="button" data-platform="cnb" disabled={disabled} className={platform === "cnb" ? "active" : ""} onClick={() => onChange("cnb")}>
        CNB
      </button>
    </div>
  );
}

function AgentPanel({
  config,
  agent,
  setPlatform,
}: {
  config: ManualConfig;
  agent: ReturnType<typeof useAgentRun>;
  setPlatform: (platform: ManualConfig["platform"]) => void;
}) {
  const eventStreamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (eventStreamRef.current) eventStreamRef.current.scrollTop = eventStreamRef.current.scrollHeight;
  }, [agent.events]);

  const ledClass = agent.status === "running" ? "running" : agent.status === "done" ? "done" : agent.status === "error" || agent.status === "stopped" ? "error" : "";
  const ledText = agent.status === "running" ? "运行中" : agent.status === "done" ? "已完成" : agent.status === "stopped" ? "已停止" : agent.status === "error" ? "运行出错" : "未启动";

  return (
    <aside className="panel agent-left">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">AI 分析台</h2>
          <span className="panel-note">选择目标后启动自动分析，过程以运行纪要展示</span>
        </div>
      </div>
      <form className="launch-form" onSubmit={(event) => event.preventDefault()}>
        <div className="launch-grid">
          <div className="field">
            <label>平台</label>
            <PlatformSegment
              platform={config.platform}
              disabled={agent.running}
              onChange={(platform) => {
                setPlatform(platform);
                agent.clearCacheBadges();
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-username">用户名 / 组织</label>
            <input id="agent-username" value={agent.agentUsername} disabled={agent.running} autoComplete="off" onChange={(event) => agent.setAgentUsername(event.target.value)} />
          </div>
        </div>
        <div className="task-grid">
          {[
            { mode: "readme" as AgentMode, title: "生成主页 README", text: "浏览主页、读取 Profile README，并输出可复制 Markdown", cached: agent.cacheBadges.readme },
            { mode: "stats" as AgentMode, title: "推荐卡片配方", text: "分析公开资料，生成可应用到手动面板的卡片方案", cached: agent.cacheBadges.stats },
          ].map((item) => (
            <button key={item.mode} className="task-btn" type="button" disabled={agent.running} onClick={() => void agent.runAgent(item.mode)}>
              <div className="task-btn-header">
                <strong>{item.title}</strong>
                <span className={`cache-badge ${item.cached ? "" : "hidden"}`}>已缓存</span>
              </div>
              <span>{item.text}</span>
            </button>
          ))}
        </div>
      </form>

      <div className={`cache-info-bar ${agent.cacheBadges.visible ? "visible" : ""}`}>
        <span className="cache-info-icon">💾 缓存</span>
        <span className="cache-info-text">
          <strong>{agent.cacheBadges.username || "--"}</strong> 的分析结果已缓存，将直接展示
          {agent.cacheBadges.expiresAt ? (
            <span className="cache-expiry">自动过期：{agent.cacheBadges.expiresAt}{agent.cacheBadges.remaining ? `（${agent.cacheBadges.remaining}）` : ""}</span>
          ) : (
            <span className="cache-expiry">有效期 24h</span>
          )}
        </span>
      </div>

      <div className="toolchain-bar">
        {toolchainItems.map((item) => (
          <div key={item.key} className={`toolchain-item ${agent.toolchain[item.key] === "active" ? "active" : ""} ${agent.toolchain[item.key] === "completed" ? "completed" : ""}`} data-tool={item.key}>
            <span className="toolchain-dot" />
            <div className="toolchain-info">
              <div className="toolchain-name">{item.name}</div>
              <div className="toolchain-desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="terminal">
        <div className="terminal-head">
          <div className={`status-led ${ledClass}`}>{ledText}</div>
          <div className="run-meta">
            <span className={`run-loader ${agent.running ? "" : "hidden"}`}>运行中</span>
            <span>运行 ID: {agent.runId ? agent.runId.slice(0, 8) : "--"}</span>
            <span>{agent.elapsed}</span>
            <span>Tokens: {agent.usage?.total || "--"}</span>
          </div>
        </div>
        <div className="target-line">分析目标: {config.platform === "cnb" ? `https://cnb.cool/u/${config.username || "Mintimate"}` : `https://github.com/${config.username || "Mintimate"}`}</div>
        <div className="run-article">
          <div className="run-kicker">分析简报</div>
          <p className="progress-copy">{agent.progress}</p>
        </div>
        <div className="event-stream" ref={eventStreamRef}>
          {agent.events.map((event) => (
            <div key={event.id} className={`event-line ${event.type || ""}`}>
              <code>{event.command}</code>
              <span>{event.text}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="agent-actions">
        <button className="btn warn" type="button" disabled={!agent.running} onClick={() => void agent.stopAgent()}>
          停止分析
        </button>
        <button className={`btn ghost ${agent.cacheBadges.visible ? "" : "hidden"}`} type="button" title="忽略缓存，重新调用 Agent 分析" disabled={agent.running} onClick={agent.reanalyze}>
          重新分析
        </button>
      </div>
    </aside>
  );
}

const loadingPhases = ["BOOT", "DIG", "ROAST", "POLISH", "SHIP"];

const loadingTips = [
  "正在敲平台 API 的门，假装自己不是爬虫。",
  "正在翻 Commit 记录，看看 README 是门面工程还是精神图腾。",
  "正在清点公开仓库，顺手把多年 TODO 捞出来晒晒。",
  "正在给评分模型上强度，注释、Star、PR 一个都别想躲。",
  "正在端详 Profile 门面，Bio 空着也会被认真记录。",
  "正在分析语言栈：到底是全栈，还是每门都会一点点。",
  "正在酝酿毒舌吐槽，力度调到刚好扎心但不违法。",
  "正在把能力雷达压成几何图形，代码人生突然有了边界。",
  "正在润色 README 草稿，让它像本人但比本人会表达。",
  "正在收尾装箱，准备把这份开发者画像发射出去。",
];

function LoadingOverlay({ running }: { running: boolean }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!running) {
      setIndex(0);
      return undefined;
    }
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % loadingTips.length);
    }, 3000);
    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className={`db-loading-overlay ${running ? "" : "hidden"}`}>
      <div className="loader-content">
        <div className="loader-code">{loadingPhases[index % loadingPhases.length]}</div>
        <p className="loader-tip">{loadingTips[index]}</p>
        <div className="loader-bar">
          <div className="loader-progress" />
        </div>
      </div>
    </div>
  );
}

function ReadmeReport({ result, config }: { result: ReadmeResult; config: ManualConfig }) {
  return (
    <div className="dashboard-grid">
      <div className="db-profile-card">
        <div className="user-header">
          <img
            className="user-avatar"
            src={result.avatarUrl}
            alt="User avatar"
            crossOrigin="anonymous"
            decoding="async"
            onError={(event) => {
              event.currentTarget.src = "favicon.svg";
            }}
          />
          <div className="user-info">
            <h3 className="user-name">{result.user?.nickname || result.user?.name || config.username || "--"}</h3>
            <span className="user-handle">@{config.username || "--"}</span>
          </div>
        </div>
        <p className="user-bio">{result.user?.bio || "--"}</p>
        <div className="score-card">
          <div className="score-main">
            <span className="score-value">{result.score.toFixed(2)}</span>
            <span className="score-total">/ 100</span>
          </div>
          <div className="score-level-badge">
            <span className="level-label">LEVEL</span>
            <span>{result.objective_rating}</span>
          </div>
        </div>
        <div className="badges-container">
          {result.badges.map((badge) => (
            <span className="db-tag" key={badge}>{badge}</span>
          ))}
        </div>
      </div>
      <div className="db-details-card">
        <div className="chart-section">
          <div className="card-title">维度评分</div>
          <div className="radar-container">
            <RadarChart scores={result.dimension_scores} />
          </div>
        </div>
        <div className="repos-section">
          <div className="card-title">贡献过/拥有的明星项目</div>
          <div className="repos-list">
            {result.top_repos.length ? result.top_repos.map((repo) => {
              const repoUrl = config.platform === "cnb" ? `https://cnb.cool/${repo.name}` : `https://github.com/${repo.name}`;
              return (
                <div className="repo-row" key={repo.name}>
                  <a href={repoUrl} target="_blank" className="repo-name-box" rel="noreferrer">{repo.name}</a>
                  <div className="repo-meta">
                    <span className="repo-stars">{repo.stars || 0}</span>
                    <span>{repo.contributions_desc || "Owner"}</span>
                  </div>
                </div>
              );
            }) : <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, padding: 4 }}>暂无明星项目贡献。</p>}
          </div>
        </div>
        <div className="objective-section">
          <div className="card-title">客观评价</div>
          <div className="objective-card" style={{ borderLeft: "3px solid var(--green)" }}>
            <p className="objective-text">{result.objective_summary}</p>
          </div>
        </div>
        <div className="roast-section">
          <div className="card-title" style={{ color: "var(--coral)" }}>毒舌吐槽</div>
          <div className="roast-box">
            <span className="quote-symbol">“</span>
            <p>{result.roast_summary}</p>
          </div>
        </div>
        <div className="promo-section">
          <div className="card-title">核心人设</div>
          <div className="promo-box">{result.promotional_summary}</div>
        </div>
      </div>
    </div>
  );
}

function StatsRecipeDashboard({
  recipe,
  summary,
}: {
  recipe: StatsRecipe;
  summary: string;
}) {
  const cards = recipe.cards?.length ? recipe.cards : ["stats" as CardType];
  const [activeCard, setActiveCard] = useState(cards[0]);
  const activeUrl = buildUrlForRecipeCard(recipe, activeCard);
  const preview = useImagePreview(activeUrl);

  return (
    <div className="stats-recipe-dashboard">
      <div className="recipe-intro">
        <div className="card-title">配置方案分析</div>
        <p className="recipe-rationale">{recipe.rationale || summary || "根据公开仓库特征为您挑选的卡片配方。"}</p>
      </div>
      <div className="recipe-grid">
        <div className="recipe-left">
          <div className="card-title">推荐的 Stats 卡片配方</div>
          <div className={`recipe-cards-list ${preview.loading ? "is-loading" : ""}`}>
            {cards.map((card) => {
              const meta = cardMetadata[card] || { name: card, desc: "自定义统计卡片" };
              return (
                <div key={card} className={`recipe-card-item ${activeCard === card ? "active" : ""}`} onClick={() => setActiveCard(card)}>
                  <div className="recipe-card-header">
                    <span className="recipe-card-name">{meta.name}</span>
                    <div className="recipe-card-pills">
                      <span className="recipe-pill theme-pill">{recipe.theme || "default"}</span>
                      <span className="recipe-pill">{recipe.platform === "cnb" ? "CNB" : "GitHub"}</span>
                    </div>
                  </div>
                  <p className="recipe-card-desc">{meta.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="recipe-right">
          <div className="card-title">卡片实时预览</div>
          <div className={`recipe-preview-box image-preview-frame ${preview.loading ? "is-loading" : ""}`} aria-busy={preview.loading}>
            <img alt="Recommended stats preview" {...preview.imageProps} />
            <div className={`image-loading-overlay ${preview.loading ? "" : "hidden"}`} aria-hidden={!preview.loading}>加载预览中</div>
            <div className="recipe-preview-meta">
              <span className="preview-url-label">实时 API 地址:</span>
              <code className="preview-url-code">{window.location.origin + activeUrl}</code>
            </div>
          </div>
          <div className="recipe-json-section">
            <details className="recipe-json-details">
              <summary>查看 JSON 原生配方数据</summary>
              <pre className="result-code">{JSON.stringify(recipe, null, 2)}</pre>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentResultPanel({
  agent,
  config,
  applyRecipe,
  setView,
  setGlobalStatus,
}: {
  agent: ReturnType<typeof useAgentRun>;
  config: ManualConfig;
  applyRecipe: (recipe: StatsRecipe) => void;
  setView: (view: ViewName) => void;
  setGlobalStatus: (status: GlobalStatus) => void;
}) {
  const [tab, setTab] = useState<"report" | "readme">("report");
  const resultVisible = agent.result.kind !== "none" || agent.running;
  const readme = agent.result.kind === "readme" ? agent.result.data : null;
  const recipe = agent.result.kind === "stats" ? agent.result.recipe : null;
  const title = readme?.title || (recipe ? "卡片配方方案" : "分析结果");
  const summary = readme?.summary || (agent.result.kind === "stats" ? agent.result.summary : "正在等待分析指标数据...");

  const profileUrl = config.platform === "cnb"
    ? `https://cnb.cool/${config.username}`
    : `https://github.com/${config.username}`;

  if (!resultVisible) return null;

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setGlobalStatus({ label: `${label}已复制` });
    } catch {
      setGlobalStatus({ label: "复制失败", tone: "is-error" });
    }
  }

  function downloadReadme(markdown: string) {
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "README.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <aside className="panel agent-right">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">{title}</h2>
          <span className="panel-note">{summary}</span>
        </div>
        <div className="result-actions">
          <button className="btn" type="button" onClick={() => agent.resetAgent()}>返回主页</button>
          <button className="btn" type="button" onClick={() => window.open(profileUrl, "_blank", "noopener,noreferrer")}>前往平台主页</button>
          <span className="result-token-chip">Tokens: {agent.usage?.total || "--"}</span>
          {readme && !readme.is_ghost && (
            <>
              <button className="btn primary" type="button" onClick={() => void copy(readme.markdown, "README 代码")}>复制 README</button>
              <button className="btn" type="button" onClick={() => downloadReadme(readme.markdown)}>下载 README.md</button>
            </>
          )}
          {(recipe || agent.lastRecipe) && (
            <button className="btn" type="button" onClick={() => {
              applyRecipe(recipe || agent.lastRecipe!);
              setView("manual");
            }}>
              应用到手动配置
            </button>
          )}
          <ShareModal result={readme} platform={config.platform} username={config.username} />
        </div>
      </div>
      <div className="result-body">
        <LoadingOverlay running={agent.running} />
        {readme && (
          <>
            <div className="tab-header">
              <div className="segmented">
                <button type="button" className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>画像报告</button>
                <button type="button" className={tab === "readme" ? "active" : ""} onClick={() => setTab("readme")}>README 草稿</button>
              </div>
            </div>
            {tab === "report" ? (
              <ReadmeReport result={readme} config={config} />
            ) : (
              <div className="readme-draft-section">
                <div className="readme-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(readme.markdown) }} />
                <pre className="result-code">{readme.markdown}</pre>
              </div>
            )}
          </>
        )}
        {recipe && <StatsRecipeDashboard recipe={recipe} summary={agent.result.kind === "stats" ? agent.result.summary : ""} />}
      </div>
    </aside>
  );
}

function ManualOptions({
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
  const needsLayout = config.card === "top-langs" || config.card === "repo-languages";
  const needsLangsCount = config.card === "top-langs" || config.card === "repo-languages";
  const needsActivityCount = config.card === "recent-activity";

  const themeDescriptions: Record<string, string> = {
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
              {cardOptions.map((option) => {
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
                const label = themeDescriptions[theme] || theme;
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

        {needsLayout && (
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

        {needsLangsCount && (
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

function PreviewPanel({
  previewUrl,
  markdown,
  setGlobalStatus,
}: {
  previewUrl: string;
  markdown: string;
  setGlobalStatus: (status: GlobalStatus) => void;
}) {
  const preview = useImagePreview(previewUrl);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setGlobalStatus({ label: `[Debugger] ${label}已拷贝至剪贴板` });
    } catch {
      setGlobalStatus({ label: `[Error] 复制 ${label} 失败，请检查 clipboard 权限`, tone: "is-error" });
    }
  }

  return (
    <section className="preview-grid">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-window-controls">
              <span className="dot dot-close" />
              <span className="dot dot-minimize" />
              <span className="dot dot-expand" />
            </div>
            <div>
              <h2 className="panel-title">// Stage.output - 渲染管线输出</h2>
              <span className="panel-note">{previewUrl}</span>
            </div>
          </div>
          <button className="btn subtle" type="button" onClick={() => window.open(previewUrl, "_blank", "noopener")}>curl --open</button>
        </div>
        <div className={`preview-stage image-preview-frame ${preview.loading ? "is-loading" : ""}`} aria-busy={preview.loading}>
          <img alt="Statistics card preview" {...preview.imageProps} />
          <div className={`image-loading-overlay ${preview.loading ? "" : "hidden"}`} aria-hidden={!preview.loading}>加载预览中</div>
        </div>
      </section>
      <section className="panel output">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-window-controls">
              <span className="dot dot-close" />
              <span className="dot dot-minimize" />
              <span className="dot dot-expand" />
            </div>
            <div>
              <h2 className="panel-title">// Clipboard.copypasta - 终极大招</h2>
              <span className="panel-note">可直接粘贴至 README.md 中</span>
            </div>
          </div>
          <button className="btn primary" type="button" onClick={() => void copy(markdown, "Markdown 碎片")}>pbcopy</button>
        </div>
        <pre className="codebox">{markdown}</pre>
        <div className="mini-list">
          <div className="url-line">{previewUrl}</div>
          <button className="btn subtle" type="button" onClick={() => void copy(previewUrl, "API 终点")}>Copy Endpoint (复制请求路径)</button>
        </div>
      </section>
    </section>
  );
}

function Footer() {
  return (
    <footer className="app-footer">
      <div className="footer-container">
        <div className="footer-left">
          <a href="https://makers.edgeone.ai/" target="_blank" className="footer-logo-link" rel="noreferrer">
            <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>Powered by</span>
            <img src="/edgeone-logo.svg" alt="Tencent EdgeOne" className="footer-logo-img" />
          </a>
          <span className="footer-divider">·</span>
          <a href="https://github.com/Mintimate/dev-stats" target="_blank" rel="noreferrer">开源仓库</a>
        </div>
        <div className="footer-right">
          <span className="footer-text">思路来源: <a href="https://ghfind.com/" target="_blank" rel="noreferrer">ghfind</a></span>
          <span className="footer-divider">·</span>
          <span className="footer-text">鸣谢: <a href="https://cnb.cool/Commit/Roast" target="_blank" rel="noreferrer">Commit Roast</a></span>
          <span className="footer-divider">·</span>
          <span className="footer-text">作者: <a href="https://www.mintimate.cn" target="_blank" rel="noreferrer">Mintimate</a></span>
          <span className="footer-divider">·</span>
          <a href="https://space.bilibili.com/355567627" target="_blank" className="bilibili-link" rel="noreferrer">B站</a>
        </div>
      </div>
    </footer>
  );
}

export default function App() {
  const manual = useManualStats();
  const [view, setViewState] = useState<ViewName>(location.hash === "#manual" ? "manual" : "agent");
  const [globalStatus, setGlobalStatus] = useState<GlobalStatus>({ label: "准备就绪" });
  const agent = useAgentRun(manual.config, manual.syncUsername, setGlobalStatus);

  function setView(nextView: ViewName) {
    setViewState(nextView);
    location.hash = nextView === "manual" ? "manual" : "agent";
  }

  const shellClass = `agent-home view ${view === "agent" ? "" : "hidden"} split-layout`;

  const handleLoadUser = useCallback((item: LeaderboardItem) => {
    manual.setPlatform(item.platform);
    agent.setAgentUsername(item.username);
    void agent.runAgent("readme", false, { platform: item.platform, username: item.username });
  }, [manual.setPlatform, agent.setAgentUsername, agent.runAgent]);

  const showResult = agent.result.kind !== "none" || agent.running;

  return (
    <>
      <main className="app">
        <TopBar view={view} setView={setView} config={manual.config} status={globalStatus} />
        <section className={shellClass}>
          <AgentPanel config={manual.config} agent={agent} setPlatform={manual.setPlatform} />
          {showResult ? (
            <AgentResultPanel agent={agent} config={manual.config} applyRecipe={manual.applyRecipe} setView={setView} setGlobalStatus={setGlobalStatus} />
          ) : (
            <LeaderboardPanel onLoadUser={handleLoadUser} />
          )}
        </section>
        <section className={`workspace view ${view === "manual" ? "" : "hidden"}`}>
          <ManualOptions config={manual.config} updateConfig={manual.updateConfig} setPlatform={manual.setPlatform} resetOptions={manual.resetOptions} />
          <PreviewPanel previewUrl={manual.previewUrl} markdown={manual.markdown} setGlobalStatus={setGlobalStatus} />
        </section>
      </main>
      <Footer />
    </>
  );
}
