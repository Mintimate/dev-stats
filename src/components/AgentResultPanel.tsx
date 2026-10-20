import { useEffect, useRef, useState } from "react";
import { useAgentRun } from "../hooks/useAgentRun";
import { useImagePreview } from "../hooks/useImagePreview";
import { ReadmeReport } from "./ReadmeReport";
import { ShareModal } from "./ShareModal";
import { cardMetadata, toolchainItems } from "../lib/constants";
import { renderMarkdown } from "../lib/markdown";
import { buildMarkdownForRecipe, buildUrlForRecipeCard, recipeCards } from "../lib/statsUrl";
import type { GlobalStatus, ManualConfig, StatsRecipe, ViewName } from "../lib/types";

function StatsRecipeDashboard({
  recipe,
  summary,
}: {
  recipe: StatsRecipe;
  summary: string;
}) {
  const cards = recipeCards(recipe);
  const [activeCard, setActiveCard] = useState(cards[0]);
  const activeUrl = buildUrlForRecipeCard(recipe, activeCard);
  const preview = useImagePreview(activeUrl);

  return (
    <div className="stats-recipe-dashboard">
      <div className="recipe-intro">
        <div className="card-title">配置方案分析</div>
        <p className="recipe-rationale">{recipe.rationale || summary || "根据公开仓库特征为您挑选的卡片配方。"}</p>
        <p className="recipe-export-hint">这套配方包含 {cards.length} 张卡片，可直接复制为完整 README 片段。</p>
      </div>
      <div className="recipe-grid">
        <div className="recipe-left">
          <div className="card-title">推荐的 Stats 卡片配方</div>
          <div className={`recipe-cards-list ${preview.loading ? "is-loading" : ""}`}>
            {cards.map((card) => {
              const meta = cardMetadata[card] || { name: card, desc: "自定义统计卡片" };
              return (
                <button key={card} type="button" className={`recipe-card-item ${activeCard === card ? "active" : ""}`} onClick={() => setActiveCard(card)}>
                  <div className="recipe-card-header">
                    <span className="recipe-card-name">{meta.name}</span>
                    <div className="recipe-card-pills">
                      <span className="recipe-pill theme-pill">{recipe.theme || "default"}</span>
                      <span className="recipe-pill">{recipe.platform === "cnb" ? "CNB" : "GitHub"}</span>
                    </div>
                  </div>
                  <p className="recipe-card-desc">{meta.desc}</p>
                </button>
              );
            })}
          </div>
        </div>
        <div className="recipe-right">
          <div className="card-title">卡片实时预览</div>
          <div className={`recipe-preview-box image-preview-frame ${preview.loading ? "is-loading" : ""}`} aria-busy={preview.loading}>
            <img key={preview.imageKey} alt="Recommended stats preview" {...preview.imageProps} />
            <div className={`image-loading-overlay ${preview.loading ? "" : "hidden"}`} aria-hidden={!preview.loading}>加载预览中</div>
            <div className="recipe-preview-meta">
              <span className="preview-url-label">实时 API 地址:</span>
              <code className="preview-url-code">{activeUrl}</code>
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
  const moreActionsRef = useRef<HTMLDivElement | null>(null);
  const [humorQuote] = useState(() => humorQuotes[Math.floor(Math.random() * humorQuotes.length)]);
  const hasResult = agent.result.kind !== "none";
  const readme = agent.result.kind === "readme" ? agent.result.data : null;
  const recipe = agent.result.kind === "stats" ? agent.result.recipe : null;
  const recipeToApply = recipe || agent.lastRecipe;
  const recipeMarkdown = recipe ? buildMarkdownForRecipe(recipe) : "";
  const title = readme?.title || (recipe ? "卡片配方方案" : "开发者鉴定报告");
  const summary = readme?.summary || (agent.result.kind === "stats" ? agent.result.summary : "毒舌有据，评分有源。你的分析结果会出现在这里。");
  const resultTarget = agent.resultTarget || config;
  const targetChanged = resultTarget.platform !== config.platform || (
    resultTarget.platform === "github"
      ? resultTarget.username.toLowerCase() !== config.username.trim().toLowerCase()
      : resultTarget.username !== config.username.trim()
  );
  const retainingResult = hasResult && agent.resultRunId !== agent.runId;
  const showRunStatus = agent.running || agent.status === "error" || agent.status === "stopped";
  const observedTools = toolchainItems.filter((item) => agent.toolchain[item.key] !== "idle");

  const profileUrl = resultTarget.platform === "cnb"
    ? `https://cnb.cool/u/${encodeURIComponent(resultTarget.username)}`
    : `https://github.com/${encodeURIComponent(resultTarget.username)}`;

  useEffect(() => {
    setTab("report");
    setMoreActionsOpen(false);
  }, [agent.resultRunId]);

  useEffect(() => {
    if (!moreActionsOpen) return undefined;
    function closeOnOutsidePointer(event: MouseEvent) {
      if (!moreActionsRef.current?.contains(event.target as Node)) setMoreActionsOpen(false);
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setMoreActionsOpen(false);
    }
    document.addEventListener("mousedown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [moreActionsOpen]);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setGlobalStatus({ label: `${label}已复制`, transient: true });
    } catch {
      setGlobalStatus({ label: "复制失败", tone: "is-error", transient: true });
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
          {readme ? (
            <details className="result-summary-details" key={agent.resultRunId}>
              <summary>画像摘要</summary>
              <p className="panel-note">{summary}</p>
            </details>
          ) : (
            <span className="panel-note">{summary}</span>
          )}
        </div>
        {hasResult && <div className="result-actions">
          {readme && !readme.is_ghost && (
            <ShareModal key={agent.resultRunId} result={readme} platform={resultTarget.platform} username={resultTarget.username} prominent />
          )}
          {!readme && recipe && (
            <button className="btn primary" type="button" onClick={() => void copy(recipeMarkdown, "整套 README 卡片")}>复制整套 README 卡片</button>
          )}
          {!readme && recipeToApply && (
            <button className="btn" type="button" onClick={() => {
              applyRecipe(recipeToApply);
              setView("manual");
              setGlobalStatus({ label: "已载入配方首张卡片；整套 Markdown 可直接复制到 README", transient: true });
            }}>
              微调首张卡片
            </button>
          )}
          <div className="result-more-actions" ref={moreActionsRef}>
            <button
              className="btn"
              type="button"
              aria-expanded={moreActionsOpen}
              aria-haspopup="true"
              aria-controls="result-more-actions-menu"
              onClick={() => setMoreActionsOpen((open) => !open)}
            >
              更多操作
            </button>
            {moreActionsOpen && (
              <div className="result-more-menu" id="result-more-actions-menu" aria-label="结果更多操作">
                {readme && !readme.is_ghost && (
                  <button className="result-more-menu-item" type="button" onClick={() => {
                    setMoreActionsOpen(false);
                    void copy(readme.markdown, "README 代码");
                  }}>
                    复制 README
                  </button>
                )}
                {recipeToApply && readme && (
                  <button className="result-more-menu-item" type="button" onClick={() => {
                    applyRecipe(recipeToApply);
                    setView("manual");
                    setMoreActionsOpen(false);
                  }}>
                    微调首张卡片
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
                {agent.resultRunId === agent.runId && <span className="result-more-menu-meta">本轮消耗 {agent.usage?.total ?? "--"} tokens</span>}
                <button className="result-more-menu-item" type="button" disabled={agent.running} onClick={() => {
                  agent.resetAgent();
                  setMoreActionsOpen(false);
                }}>清空结果</button>
              </div>
            )}
          </div>
        </div>}
      </div>
      {showRunStatus && (
        <div className={`result-run-status is-${agent.status}`}>
          <div className="result-run-heading">
            <strong>{agent.running ? "正在分析" : agent.status === "error" ? "本次分析未完成" : "分析已暂停"}</strong>
            {agent.runTarget && <span>{agent.runTarget.platform === "cnb" ? "CNB" : "GitHub"} / @{agent.runTarget.username}</span>}
            <span>{agent.elapsed}</span>
          </div>
          <p role={agent.status === "error" ? "alert" : "status"} aria-live={agent.status === "error" ? "assertive" : "polite"}>{agent.progress}</p>
          {observedTools.length > 0 && (
            <div className="result-run-tools" aria-label="已收到的工具执行状态">
              {observedTools.map((item) => (
                <span key={item.key} className={`is-${agent.toolchain[item.key]}`}>
                  {item.name} · {agent.toolchain[item.key] === "completed" ? "已完成" : agent.running ? "执行中" : "未完成"}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {hasResult && (
        <p className="result-identity-note">
          当前展示：{resultTarget.platform === "cnb" ? "CNB" : "GitHub"} / @{resultTarget.username}
          {retainingResult && showRunStatus
            ? agent.running ? " · 上一份结果保留可用，新结果生成后自动更新。" : " · 本次未替换报告，仍保留上一份结果。"
            : targetChanged ? " · 输入目标已切换，运行分析后更新这里的报告。" : ""}
        </p>
      )}
      <div className="result-body">
        {!hasResult && (
          <div className="result-empty-state">
            <span className="result-empty-kicker">你的代码，值得被认真吐槽</span>
            <h3>{agent.running ? "正在准备你的第一份报告" : agent.status === "error" || agent.status === "stopped" ? "这次还没有生成报告" : "留下用户名，让公开作品开口"}</h3>
            <p className="result-empty-copy">
              {agent.running
                ? "分析进度会实时更新，结果生成后在这里展开。"
                : "选择平台并输入用户名，开始鉴定。毒舌点评、公开证据和 README 草稿都会留在这里。"}
            </p>
            <div className="result-empty-features" aria-label="报告内容">
              <span>毒舌点评</span>
              <span>公开证据</span>
              <span>六维评分</span>
              <span>README 草稿</span>
            </div>
          </div>
        )}
        {readme && (
          <>
            <div className="tab-header">
              <div className="segmented result-tabs" role="tablist" aria-label="结果视图">
                <button id="report-tab" type="button" role="tab" aria-controls="report-panel" aria-selected={tab === "report"} className={tab === "report" ? "active" : ""} onClick={() => setTab("report")}>画像报告</button>
                <button id="readme-tab" type="button" role="tab" aria-controls="readme-panel" aria-selected={tab === "readme"} className={tab === "readme" ? "active" : ""} onClick={() => setTab("readme")}>README 草稿</button>
              </div>
            </div>
            <div className="result-tab-panel">
              <div id="report-panel" className={`result-tab-content ${tab === "report" ? "active" : ""}`} role="tabpanel" aria-labelledby="report-tab" hidden={tab !== "report"}>
                <ReadmeReport key={agent.resultRunId} result={readme} config={resultTarget} />
              </div>
              <div id="readme-panel" className={`result-tab-content ${tab === "readme" ? "active" : ""}`} role="tabpanel" aria-labelledby="readme-tab" hidden={tab !== "readme"}>
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
                        <div className="readme-render" dangerouslySetInnerHTML={{ __html: renderMarkdown(readme.markdown, resultTarget.platform, resultTarget.username) }} />
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
                          const rawHtml = renderMarkdown(readme.markdown, resultTarget.platform, resultTarget.username);
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
        {recipe && <StatsRecipeDashboard key={agent.resultRunId} recipe={recipe} summary={agent.result.kind === "stats" ? agent.result.summary : ""} />}
      </div>
    </aside>
  );
}
