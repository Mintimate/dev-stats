import { useEffect, useState } from "react";
import { useAgentRun } from "../hooks/useAgentRun";
import { useImagePreview } from "../hooks/useImagePreview";
import { ReadmeReport } from "./ReadmeReport";
import { ShareModal } from "./ShareModal";
import { cardMetadata } from "../lib/constants";
import { renderMarkdown } from "../lib/markdown";
import { buildUrlForRecipeCard } from "../lib/statsUrl";
import type { CardType, GlobalStatus, ManualConfig, StatsRecipe, ViewName } from "../lib/types";

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

const humorQuotes = [
  "在我的电脑上是好的，我发誓。 🤷‍♂️",
  "此 README 由 AI 编写，人类仅负责甩锅。 🤖",
  "99.9% 的开发者看到这里都会复制，剩下 0.1% 会重写。 💻",
  "运行成功了？快去拜拜祖师爷！ 🏮",
  "修复了一个 Bug，引入了三个新 Bug。 🐛",
  "程序在跑，人也在跑。 🏃‍♂️💨",
  "当前咖啡因含量：23% (警告：过低，建议立即注入咖啡) ☕",
  "Git Commit Message: 'update README' (第 38 次提交) 🔄",
  "写代码如同写诗，只不过我的诗里全是编译错误。 📝",
  "注释是留给未来的自己，或者未来的倒霉蛋的。 😇",
  "如果你看不懂这段代码，没关系，我也看不懂。 🤔",
  "正在把 Bug 重新定义为 Feature... 🛠️",
  "警告: 复制此代码可能导致头发数量异常减少。 👴"
];

export function AgentResultPanel({
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
  const [editorTab, setEditorTab] = useState<"preview" | "source" | "html">("preview");
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [humorQuote] = useState(() => humorQuotes[Math.floor(Math.random() * humorQuotes.length)]);
  const resultVisible = agent.result.kind !== "none" || agent.running;
  const readme = agent.result.kind === "readme" ? agent.result.data : null;
  const recipe = agent.result.kind === "stats" ? agent.result.recipe : null;
  const recipeToApply = recipe || agent.lastRecipe;
  const title = readme?.title || (recipe ? "卡片配方方案" : "分析结果");
  const summary = readme?.summary || (agent.result.kind === "stats" ? agent.result.summary : "正在等待分析指标数据...");

  const profileUrl = config.platform === "cnb"
    ? `https://cnb.cool/u/${encodeURIComponent(config.username)}`
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
          {readme && !readme.is_ghost && (
            <button className="btn primary" type="button" onClick={() => void copy(readme.markdown, "README 代码")}>复制 README</button>
          )}
          {!readme && recipeToApply && (
            <button className="btn primary" type="button" onClick={() => {
              applyRecipe(recipeToApply);
              setView("manual");
            }}>
              应用到手动配置
            </button>
          )}
          <div className="result-more-actions">
            <button
              className="btn"
              type="button"
              aria-expanded={moreActionsOpen}
              aria-controls="result-more-actions-menu"
              onClick={() => setMoreActionsOpen((open) => !open)}
            >
              更多操作
            </button>
            {moreActionsOpen && (
              <div className="result-more-menu" id="result-more-actions-menu">
                {recipeToApply && readme && (
                  <button className="result-more-menu-item" type="button" onClick={() => {
                    applyRecipe(recipeToApply);
                    setView("manual");
                    setMoreActionsOpen(false);
                  }}>
                    应用 Stats 配方
                  </button>
                )}
                {readme && !readme.is_ghost && (
                  <button className="result-more-menu-item" type="button" onClick={() => {
                    downloadReadme(readme.markdown);
                    setMoreActionsOpen(false);
                  }}>
                    下载 README.md
                  </button>
                )}
                <button className="result-more-menu-item" type="button" onClick={() => {
                  window.open(profileUrl, "_blank", "noopener,noreferrer");
                  setMoreActionsOpen(false);
                }}>前往平台主页</button>
                <span className="result-more-menu-meta">本轮消耗 {agent.usage?.total || "--"} tokens</span>
                <ShareModal result={readme} platform={config.platform} username={config.username} />
                <button className="result-more-menu-item" type="button" onClick={() => {
                  agent.resetAgent();
                  setMoreActionsOpen(false);
                }}>返回主页</button>
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={`result-body ${agent.running ? "is-loading" : ""}`}>
        <LoadingOverlay running={agent.running} />
        {readme && (
          <>
            <div className="tab-header">
              <div className="segmented result-tabs">
                <button type="button" className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>画像报告</button>
                <button type="button" className={tab === "readme" ? "active" : ""} onClick={() => setTab("readme")}>README 草稿</button>
              </div>
            </div>
            <div className="result-tab-panel">
              <div className={`result-tab-content ${tab === "report" ? "active" : ""}`}>
                <ReadmeReport result={readme} config={config} />
              </div>
              <div className={`result-tab-content ${tab === "readme" ? "active" : ""}`}>
                <div className="mock-editor-window">
                  <div className="editor-header">
                    <div className="editor-window-controls">
                      <span className="dot dot-close" />
                      <span className="dot dot-minimize" />
                      <span className="dot dot-expand" />
                    </div>
                    <div className="editor-tabs">
                      <button
                        type="button"
                        className={`editor-tab ${editorTab === "preview" ? "active" : ""}`}
                        onClick={() => setEditorTab("preview")}
                      >
                        <span className="tab-icon">📄</span> README.md
                      </button>
                      <button
                        type="button"
                        className={`editor-tab ${editorTab === "source" ? "active" : ""}`}
                        onClick={() => setEditorTab("source")}
                      >
                        <span className="tab-icon">💻</span> source.md
                      </button>
                      <button
                        type="button"
                        className={`editor-tab ${editorTab === "html" ? "active" : ""}`}
                        onClick={() => setEditorTab("html")}
                      >
                        <span className="tab-icon">🌐</span> dist/index.html
                      </button>
                    </div>
                    <div className="editor-git-status">
                      <span className="git-branch-icon">⌥</span> git: <strong>main*</strong>
                    </div>
                  </div>

                  <div className="editor-workspace">
                    {editorTab === "preview" && (
                      <div className="readme-preview-body">
                        <div className="readme-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(readme.markdown, config.platform, config.username) }} />
                      </div>
                    )}

                    {editorTab === "source" && (
                      <div className="editor-code-container">
                        <button
                          className="btn subtle editor-copy-btn"
                          type="button"
                          onClick={() => void copy(readme.markdown, "Markdown 源码")}
                        >
                          复制代码
                        </button>
                        <div className="code-editor-pre">
                          {readme.markdown.split(/\r?\n/).map((line, idx) => (
                            <div key={idx} className="code-line">
                              <span className="line-number">{idx + 1}</span>
                              <span className="line-content">{line || " "}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {editorTab === "html" && (
                      <div className="editor-code-container">
                        {(() => {
                          const rawHtml = renderMarkdown(readme.markdown, config.platform, config.username);
                          const formattedHtml = rawHtml
                            .replace(/(<\/?(?:div|p|ul|ol|li|h[1-6]|table|thead|tbody|tr|th|td|pre|code)[^>]*>)/gi, "\n$1\n")
                            .split("\n")
                            .map((line) => line.trim())
                            .filter(Boolean)
                            .join("\n");
                          return (
                            <>
                              <button
                                className="btn subtle editor-copy-btn"
                                type="button"
                                onClick={() => void copy(formattedHtml, "HTML 源码")}
                              >
                                复制 HTML
                              </button>
                              <div className="code-editor-pre">
                                {formattedHtml.split("\n").map((line, idx) => (
                                  <div key={idx} className="code-line">
                                    <span className="line-number">{idx + 1}</span>
                                    <span className="line-content">{line || " "}</span>
                                  </div>
                                ))}
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}
                  </div>

                  <div className="editor-status-bar">
                    <div className="status-left">
                      <span className="status-item status-branch">🟢 UTF-8</span>
                      <span className="status-item">Spaces: 2</span>
                      <span className="status-item status-lang">Markdown</span>
                    </div>
                    <div className="status-humor-bar">
                      {humorQuote}
                    </div>
                    <div className="status-right">
                      <span className="status-item">Line {readme.markdown.split(/\r?\n/).length}, Col 1</span>
                      <span className="status-item">100% Bug-Free*</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
        {recipe && <StatsRecipeDashboard recipe={recipe} summary={agent.result.kind === "stats" ? agent.result.summary : ""} />}
      </div>
    </aside>
  );
}
