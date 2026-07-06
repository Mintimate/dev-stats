import { memo, useCallback, useEffect, useState } from "react";
import type { Platform } from "../lib/types";
import { getTagColor } from "../lib/constants";

export interface LeaderboardItem {
  username: string;
  platform: Platform;
  nickname: string;
  avatar: string;
  score: number;
  rating: string;
  badges: string[];
  updatedAt: number;
  expiresAt?: number;
}

interface LeaderboardPanelProps {
  onLoadUser: (item: LeaderboardItem) => void;
}

function handleAvatarError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  // 用绝对路径 + 一次性标记兜底，避免相对路径在非根路径页面下解析出错而无限触发 onError。
  if (img.dataset.fallback === "1") return;
  img.dataset.fallback = "1";
  img.src = "/favicon.svg";
}

export function getHumorousTitle(rating: string) {
  const map: Record<string, string> = {
    "夯": "搬砖巨匠",
    "骨灰级": "骨灰仙人",
    "宗师级": "宗师圣体",
    "顶流": "顶流担当",
    "高级": "硬核干活",
    "平庸": "摸鱼大师",
    "入门": "潜力萌新",
    "虚无": "幽灵行者",
  };
  return map[rating] || rating;
}


const PAGE_SIZE = 10;

function LeaderboardPanelInner({ onLoadUser }: LeaderboardPanelProps) {
  const [list, setList] = useState<LeaderboardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Platform>("github");
  const [page, setPage] = useState(1);

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

  useEffect(() => {
    function refreshAfterAnalysis() {
      void fetchRankings();
    }
    window.addEventListener("devstats:leaderboard-updated", refreshAfterAnalysis);
    return () => window.removeEventListener("devstats:leaderboard-updated", refreshAfterAnalysis);
  }, [fetchRankings]);

  // 切换榜单或刷新数据后，避免停留在一个可能已经越界的页码上。
  useEffect(() => {
    setPage(1);
  }, [activeTab, list]);

  const filteredList = list.filter((item) => item.platform === activeTab);
  const totalPages = Math.max(1, Math.ceil(filteredList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedList = filteredList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);


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
            <p>该平台暂无排行数据。快去分析第一个开发者，开启荣誉榜吧！</p>
          </div>
        ) : (
          <>
          <div className="leaderboard-list">
            {pagedList.map((item, indexInPage) => {
              const rank = (safePage - 1) * PAGE_SIZE + indexInPage + 1;
              const isTopRank = rank <= 3;
              const displayNick = item.nickname || item.username;
              const displayHandle = `@${item.username}`;
              const displayTags = item.badges.slice(0, 3);
              const extraTagsCount = Math.max(0, item.badges.length - 3);

              const avatarUrl = (item.username && item.platform)
                ? `/api/avatar?platform=${item.platform}&username=${item.username}`
                : "/favicon.svg";

              return (
                <div
                  key={`${item.platform}-${item.username}`}
                  className="leaderboard-row"
                  onClick={() => onLoadUser(item)}
                  title={`点击快速载入 ${item.username} 的完整画像`}
                >
                  <div className={`leaderboard-rank ${isTopRank ? `rank-top rank-${rank}` : ""}`}>
                    <span className="rank-num">{rank}</span>
                  </div>

                  <div className="leaderboard-avatar-wrapper">
                    <img
                      className="leaderboard-avatar"
                      src={avatarUrl}
                      alt={`${item.username} avatar`}
                      loading="lazy"
                      decoding="async"
                      fetchPriority="low"
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
                          style={getTagColor(tagIndex)}
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
                      <span className="score-value">{item.score.toFixed(1)}</span>
                    </div>
                    <div className="score-level">
                      <span className="rating-label">{getHumorousTitle(item.rating)}</span>
                    </div>
                  </div>

                  <div className="leaderboard-action">
                    <div className="action-circle">
                      <span className="action-arrow">→</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="leaderboard-pagination">
              <button
                type="button"
                className="btn subtle"
                disabled={safePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                上一页
              </button>
              <span className="pagination-info">第 {safePage} / {totalPages} 页 · 共 {filteredList.length} 人</span>
              <button
                type="button"
                className="btn subtle"
                disabled={safePage >= totalPages}
                onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              >
                下一页
              </button>
            </div>
          )}
          </>
        )}
      </div>
    </aside>
  );
}

export const LeaderboardPanel = memo(LeaderboardPanelInner);
