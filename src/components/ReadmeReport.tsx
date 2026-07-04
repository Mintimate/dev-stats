import { RadarChart } from "./RadarChart";
import type { ManualConfig, ReadmeResult } from "../lib/types";

/**
 * 只读展示一份 README 分析报告卡片。
 * 首页“AI 分析”结果面板与独立用户主页（/u/:platform/:username）共用此组件，
 * 因此 config 只依赖 platform / username 两个字段，便于在没有完整 ManualConfig 的场景下复用。
 */
export function ReadmeReport({
  result,
  config,
}: {
  result: ReadmeResult;
  config: Pick<ManualConfig, "platform" | "username">;
}) {
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
              const img = event.currentTarget;
              // 用绝对路径 + 一次性标记兜底，避免在 /u/:platform/:username 这类子路径下
              // 相对路径 "favicon.svg" 被解析成 "/u/:platform/favicon.svg" 而 404，
              // 导致 onError 无限重复触发、无限请求同一张图。
              if (img.dataset.fallback === "1") return;
              img.dataset.fallback = "1";
              img.src = "/favicon.svg";
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
