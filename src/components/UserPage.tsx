import { useEffect, useState } from "react";
import { Footer } from "../App";
import { ReadmeReport } from "./ReadmeReport";
import { ShareModal } from "./ShareModal";
import { normalizeReadmeResult } from "../lib/agentLogic";
import { toolchainItems } from "../lib/constants";
import type { Platform, ReadmeResult } from "../lib/types";

type LoadState = "loading" | "found" | "not_found" | "error";

interface ProfileResponse {
  found: boolean;
  cachedAt?: number;
  readmeDraft?: Record<string, unknown>;
  userProfile?: { nickname?: string; bio?: string; avatar?: string } | null;
}

function formatCachedAt(cachedAt: number) {
  if (!cachedAt) return "";
  return new Date(cachedAt).toLocaleString();
}

/**
 * 静态展示一遍 AI 分析走过的工具链路径，让只读历史页不至于显得空荡，
 * 也让访客直观了解这份报告是怎么产出的。所有步骤固定展示为“已完成”。
 */
function AnalysisPathBar() {
  return (
    <div className="repos-section">
      <div className="card-title">AI 分析路径</div>
      <div className="toolchain-bar">
        {toolchainItems.map((item) => (
          <div key={item.key} className="toolchain-item completed">
            <span className="toolchain-dot" />
            <div className="toolchain-info">
              <div className="toolchain-name">{item.name}</div>
              <div className="toolchain-desc">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 独立的用户历史/画像只读页面（/u/:platform/:username）。
 * 数据完全来自后端只读缓存接口 /profile，不触发 Agent 分析、不产生 token 消耗。
 */
export function UserPage({ platform, username }: { platform: Platform; username: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [result, setResult] = useState<ReadmeResult | null>(null);
  const [cachedAt, setCachedAt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setResult(null);

    (async () => {
      try {
        const res = await fetch("/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            // EdgeOne Makers 的 agents 框架会对所有路由强制校验该请求头，即使业务逻辑本身不使用会话状态。
            "makers-conversation-id": "user-profile-lookup",
          },
          body: JSON.stringify({ platform, username }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ProfileResponse;
        if (cancelled) return;

        if (!data.found || !data.readmeDraft) {
          setState("not_found");
          return;
        }

        const normalized = normalizeReadmeResult(data.readmeDraft, { platform, username }, data.userProfile || null, "");
        setResult(normalized);
        setCachedAt(data.cachedAt || 0);
        setState("found");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [platform, username]);

  const profileUrl = platform === "cnb" ? `https://cnb.cool/${username}` : `https://github.com/${username}`;
  const platformLabel = platform === "cnb" ? "CNB" : "GitHub";
  const cachedAtText = formatCachedAt(cachedAt);

  return (
    <>
      <main className="app">
        <header className="topbar">
          <div className="brand">
            <div className="mark">
              <img src="/favicon.svg" alt="GS Logo" />
            </div>
            <div>
              <h1>DevStats 统计工坊</h1>
              <p className="sub">开发者画像主页 · {platformLabel} @{username}</p>
            </div>
          </div>
          <div className="topbar-tools">
            <div className="context-strip" aria-label="当前上下文">
              <span className="context-chip">
                <span className="context-label">平台</span>
                <span className="context-value">{platformLabel}</span>
              </span>
              <span className="context-chip">
                <span className="context-label">来源</span>
                <span className="context-value">缓存快照</span>
              </span>
              {cachedAtText && (
                <span className="context-chip">
                  <span className="context-label">分析时间</span>
                  <span className="context-value">{cachedAtText}</span>
                </span>
              )}
            </div>
            <a className="btn" href="/">返回工坊首页</a>
          </div>
        </header>

        <section className="panel agent-right" style={{ minHeight: 320 }}>
          <div className="panel-head">
            <div>
              <h2 className="panel-title">{result?.title || `${username} 的开发者画像`}</h2>
              <span className="panel-note">
                {result?.summary || "只读展示已缓存的分析结果，不会触发新的 Agent 分析"}
              </span>
            </div>
            <div className="result-actions">
              <button className="btn" type="button" onClick={() => window.open(profileUrl, "_blank", "noopener,noreferrer")}>
                前往{platformLabel}主页
              </button>
              {result && !result.is_ghost && <ShareModal result={result} platform={platform} username={username} />}
            </div>
          </div>
          <div className="result-body">
            {state === "loading" && <p className="panel-note">正在加载缓存的分析结果...</p>}
            {state === "error" && <p className="panel-note">加载失败，请稍后重试。</p>}
            {state === "not_found" && (
              <div className="objective-card" style={{ borderLeft: "3px solid var(--coral)" }}>
                <p className="objective-text">
                  这位开发者（{platformLabel} · {username}）暂无缓存的分析结果。
                </p>
                <p className="objective-text">
                  请前往<a href="/"> 工坊首页 </a>手动发起一次分析后再来查看。
                </p>
              </div>
            )}
            {state === "found" && result && (
              <>
                <AnalysisPathBar />
                <ReadmeReport result={result} config={{ platform, username }} />
              </>
            )}
          </div>

        </section>
      </main>
      <Footer />
    </>
  );
}
