import type { GlobalStatus, ManualConfig, ViewName } from "../lib/types";

export function TopBar({
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
  return (
    <header className="topbar">
      <div className="brand">
        <div className="mark">
          <img src="/favicon.svg" alt="DevStats 标志" />
        </div>
        <div>
          <h1>DevStats 统计工坊</h1>
          <p className="sub">夸得有理，损得有据。</p>
        </div>
      </div>
      <div className="topbar-tools">
        <div className="topbar-actions">
          <nav className="primary-nav" aria-label="主视图">
            <button className={`nav-btn ${view === "agent" ? "active" : ""}`} type="button" aria-pressed={view === "agent"} onClick={() => setView("agent")}>
              AI 鉴定
            </button>
            <button className={`nav-btn ${view === "manual" ? "active" : ""}`} type="button" aria-pressed={view === "manual"} onClick={() => setView("manual")}>
              手动配卡
            </button>
          </nav>
          <a
            className="tutorial-link"
            href="https://www.bilibili.com/video/BV1YPKB61EN7"
            target="_blank"
            rel="noreferrer"
            aria-label="在哔哩哔哩观看 DevStats 视频教程（新窗口打开）"
          >
            <span aria-hidden="true">▶</span>
            视频教程
          </a>
        </div>
        <div className="context-strip" aria-label="当前上下文">
          {view === "manual" && <span className="context-chip">
            <span className="context-label">平台</span>
            <span className="context-value">{config.platform === "github" ? "GitHub" : "CNB"}</span>
          </span>}
          <span className={`context-chip status ${status.tone || ""}`} role="status" aria-live="polite" aria-atomic="true">
            <span className="context-label">状态</span>
            <span className="context-value">{status.label}</span>
          </span>
        </div>
      </div>
    </header>
  );
}
