import { memo, useCallback, useEffect, useState } from "react";
import type { Platform } from "../lib/types";

export interface LeaderboardItem {
  username: string;
  platform: Platform;
  nickname: string;
  avatar: string;
  score: number;
  rating: string;
  badges: string[];
  updatedAt: number;
}

interface LeaderboardPanelProps {
  onLoadUser: (item: LeaderboardItem) => void;
}

function getTagStyle(index: number) {
  const colors = [
    { background: "#fff7ed", color: "#ea580c", border: "1px solid rgba(234, 88, 12, 0.15)" }, // Orange
    { background: "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22, 163, 74, 0.15)" }, // Green
    { background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37, 99, 235, 0.15)" }, // Blue
    { background: "#faf5ff", color: "#7c3aed", border: "1px solid rgba(124, 58, 237, 0.15)" }, // Purple
    { background: "#fdf2f8", color: "#db2777", border: "1px solid rgba(219, 39, 119, 0.15)" }, // Pink
  ];
  return colors[index % colors.length];
}

function handleAvatarError(e: React.SyntheticEvent<HTMLImageElement>) {
  e.currentTarget.src = "favicon.svg";
}

function getHumorousTitle(rating: string) {
  const map: Record<string, string> = {
    "夯": "🧱 搬砖巨匠",
    "骨灰级": "💀 骨灰仙人",
    "宗师级": "👑 宗师圣体",
    "顶流": "🚀 顶流担当",
    "高级": "💻 硬核干活",
    "平庸": "☕ 摸鱼大师",
    "入门": "🌱 潜力萌新",
    "虚无": "👻 幽灵行者",
  };
  return map[rating] || rating;
}

function LeaderboardPanelInner({ onLoadUser }: LeaderboardPanelProps) {
  const [list, setList] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Platform>("github");

  const fetchRankings = useCallback(async (forceRebuild = false) => {
    setLoading(true);
    try {
      const res = await fetch("/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "makers-conversation-id": "refresh-leaderboard"
        },
        body: JSON.stringify({ rebuild: forceRebuild })
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.leaderboard)) {
          setList(data.leaderboard);
        }
      }
    } catch (err) {
      console.error("Failed to fetch rankings:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRankings();
  }, [fetchRankings]);

  const filteredList = list.filter((item) => item.platform === activeTab);

  return (
    <aside className="panel agent-right leaderboard-panel">
      <div className="panel-head">
        <div>
          <h2 className="panel-title">开发者荣誉榜</h2>
          <span className="panel-note">基于已完成分析的缓存数据排行榜，点击一键载入</span>
        </div>
        <button className="btn" type="button" onClick={() => void fetchRankings(true)}>
          刷新
        </button>
      </div>

      <div className="leaderboard-body">
        <div className="leaderboard-tabs-wrapper" style={{ marginBottom: 12 }}>
          <div className="segmented">
            <button
              type="button"
              className={activeTab === "github" ? "active" : ""}
              onClick={() => setActiveTab("github")}
            >
              GitHub (大厂门面)
            </button>
            <button
              type="button"
              className={activeTab === "cnb" ? "active" : ""}
              onClick={() => setActiveTab("cnb")}
            >
              CNB (开源劳模)
            </button>
          </div>
        </div>

        {loading ? (
          <div className="leaderboard-loading">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="leaderboard-skeleton-row">
                <div className="skeleton skeleton-rank" />
                <div className="skeleton skeleton-avatar" />
                <div className="skeleton-info">
                  <div className="skeleton skeleton-name" />
                  <div className="skeleton skeleton-tags" />
                </div>
                <div className="skeleton skeleton-score" />
              </div>
            ))}
          </div>
        ) : filteredList.length === 0 ? (
          <div className="leaderboard-empty">
            <span className="empty-icon">🏆</span>
            <p>该平台暂无排行数据。快去分析第一个开发者，开启荣誉榜吧！</p>
          </div>
        ) : (
          <div className="leaderboard-list">
            {filteredList.map((item, index) => {
              const rank = index + 1;
              const hasMedal = rank <= 3;
              const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : "🥉";
              const displayNick = item.nickname || item.username;
              const displayHandle = `@${item.username}`;
              const displayTags = item.badges.slice(0, 3);
              const extraTagsCount = Math.max(0, item.badges.length - 3);

              const avatarUrl = (item.username && item.platform)
                ? `/api/avatar?platform=${item.platform}&username=${item.username}`
                : "favicon.svg";

              return (
                <div
                  key={`${item.platform}-${item.username}`}
                  className="leaderboard-row"
                  onClick={() => onLoadUser(item)}
                  title={`点击快速载入 ${item.username} 的完整画像`}
                >
                  <div className={`leaderboard-rank ${hasMedal ? "has-medal" : ""}`}>
                    {hasMedal ? (
                      <span className="medal-icon">{medal}</span>
                    ) : (
                      <span className="rank-num">{rank}</span>
                    )}
                  </div>

                  <div className="leaderboard-avatar-wrapper">
                    <img
                      className="leaderboard-avatar"
                      src={avatarUrl}
                      alt={`${item.username} avatar`}
                      onError={handleAvatarError}
                    />
                    <span className={`platform-badge ${item.platform}`}>
                      {item.platform === "cnb" ? "C" : "G"}
                    </span>
                  </div>

                  <div className="leaderboard-info">
                    <div className="leaderboard-name-box">
                      <span className="leaderboard-username">{displayHandle}</span>
                      {displayNick !== item.username && (
                        <span className="leaderboard-nickname">{displayNick}</span>
                      )}
                    </div>
                    <div className="leaderboard-tags">
                      {displayTags.map((tag, tagIndex) => (
                        <span
                          key={tag}
                          className="leaderboard-tag"
                          style={getTagStyle(tagIndex)}
                        >
                          {tag}
                        </span>
                      ))}
                      {extraTagsCount > 0 && (
                        <span className="leaderboard-tag plus-tag">
                          +{extraTagsCount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="leaderboard-score-box">
                    <div className="score-trend">
                      <span className="rocket-emoji">🚀</span>
                      <span className="score-value">{item.score.toFixed(1)}</span>
                    </div>
                    <div className="score-level">
                      <span className="trophy-emoji">🏆</span>
                      <span className="rating-label">{getHumorousTitle(item.rating)}</span>
                    </div>
                  </div>

                  <div className="leaderboard-action">
                    <div className="action-circle">
                      <span className="action-emoji">⚡</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

export const LeaderboardPanel = memo(LeaderboardPanelInner);
