import { useEffect, useState, type CSSProperties } from "react";
import { Footer } from "./Footer";
import { ReadmeReport } from "./ReadmeReport";
import { ShareModal } from "./ShareModal";
import { normalizeReadmeResult, narrativeForTool } from "../lib/agentLogic";
import { toolchainItems } from "../lib/constants";
import type { Platform, ReadmeResult } from "../lib/types";

type LoadState = "loading" | "found" | "not_found" | "error";

const DONE_TEXT = "收工。该看的都看了，该吐的槽也吐完了。";

const USER_PAGE_SUBTITLES = (platformLabel: string, username: string) => [
  `开发者画像 · ${platformLabel} @${username} · read-only mode`,
  `${platformLabel}/${username} 的公开数据已被 AI 嚼碎并重组`,
  `这份报告是缓存快照 · 就像 git stash pop 出来的`,
  `${platformLabel} @${username} · 数据来自上一次 CI/CD 管线`,
];

interface ProfileResponse {
  found: boolean;
  cachedAt?: number;
  readmeDraft?: Record<string, unknown>;
  userProfile?: { nickname?: string; bio?: string; avatar?: string } | null;
  events?: string[];
}

function formatCachedAt(cachedAt: number) {
  if (!cachedAt) return "";
  const d = new Date(cachedAt);
  const now = Date.now();
  const diffMs = now - cachedAt;
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMs / 3600000);
  // 开发者风格的时间描述
  if (diffMin < 1) return `${d.toLocaleTimeString()} (刚刚编译)`;
  if (diffHr < 1) return `${d.toLocaleString()} (${diffMin} min ago)`;
  if (diffHr < 24) return `${d.toLocaleString()} (~${diffHr}h ago)`;
  return d.toLocaleString();
}

/**
 * 只读展示一遍 AI 分析走过的工具链路径，
 * 让访客直观了解这份报告是怎么产出的。所有步骤固定展示为"已完成"。
 */
function AnalysisPathBar() {
  return (
    <div className="repos-section">
      <div className="card-title">
        <span className="toolchain-title-icon">⚡</span>
        AI 分析路径
        <span className="toolchain-sub-label">// pipeline status: all green</span>
      </div>
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
 * 开发者风格的返回按钮 —— 用终端命令隐喻代替普通按钮文案。
 */
function BackToWorkshopLink() {
  return (
    <a className="back-to-workshop" href="/" aria-label="返回工坊首页">
      <kbd>← cd ~/workshop</kbd>
      <span className="back-hint">这里可以返回</span>
    </a>
  );
}

interface EventLine {
  id: string;
  command: string;
  text: string;
  type?: string;
}

interface CachedRunMeta {
  runId: string;
  elapsed: string;
  tokens: number;
  progress: string;
  events: EventLine[];
}

function parseCachedRunMeta(rawEvents: string[], username: string): CachedRunMeta {
  let runId = "cache";
  // 这是只读缓存页，没有真实运行耗时；用明确的中文文案代替裸英文，避免被误认为实时执行耗时。
  const elapsed = "命中缓存";
  let tokens = 0;
  const progress = DONE_TEXT;
  const events: EventLine[] = [];
  let index = 0;
  
  if (Array.isArray(rawEvents)) {
    for (const raw of rawEvents) {
      if (!raw.startsWith("data: ")) continue;
      try {
        const payload = raw.slice(6).trim();
        if (payload === "[DONE]") continue;
        const event = JSON.parse(payload);
        
        const id = `${index++}-${Math.random().toString(36).slice(2)}`;
        
        if (
          event.type === "ai_response" ||
          event.type === "text_delta" ||
          event.type === "user_profile" ||
          event.type === "thinking" ||
          event.type === "cache_hit"
        ) {
          continue;
        }
        
        if (event.type === "agent_status") {
          events.push({
            id,
            command: "AGENT",
            text: `模型就绪：${event.protocol || "model"} · ${event.model || ""}`.trim(),
            type: "ok"
          });
        } else if (event.type === "tool_call" || event.type === "tool_called") {
          const name = String(event.name || "");
          events.push({
            id,
            command: "RUNNING",
            text: narrativeForTool(name, "start"),
          });
        } else if (event.type === "tool_result") {
          const name = String(event.name || "");
          events.push({
            id,
            command: "OK",
            text: narrativeForTool(name, "done"),
            type: "ok"
          });
        } else if (event.type === "stats_recipe") {
          events.push({
            id,
            command: "RENDER",
            text: `Stats 预览已装配：${event.cards?.join(", ") || "卡片配方"}。`,
            type: "ok"
          });
        } else if (event.type === "readme_draft") {
          events.push({
            id,
            command: "RENDER",
            text: event.is_ghost ? "已装配查无此人幽默占位图，请检查拼写。" : "README Markdown 已生成，复制就能塞进仓库门面并支持分享。",
            type: "ok"
          });
        } else if (event.type === "usage") {
          const total = Number(event.total_tokens || 0);
          tokens = total;
          events.push({
            id,
            command: "TOKENS",
            text: `本轮消耗 ${total} tokens。`
          });
        } else if (event.type === "error_message") {
          events.push({
            id,
            command: "ERROR",
            text: String(event.content || "Agent error"),
            type: "error"
          });
        }
      } catch {
        // ignore
      }
    }
  }
  
  if (username) {
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
      hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    runId = Math.abs(hash).toString(16).slice(0, 8);
  }
  
  if (events.length > 0) {
    events.push({
      id: `done-${Date.now()}`,
      command: "DONE",
      text: DONE_TEXT,
      type: "ok"
    });
  } else {
    events.push({
      id: `agent-fallback-${Date.now()}`,
      command: "AGENT",
      text: "从云原生构建只读缓存成功载入画像数据。",
      type: "ok"
    });
    events.push({
      id: `done-fallback-${Date.now()}`,
      command: "DONE",
      text: DONE_TEXT,
      type: "ok"
    });
  }
  
  return {
    runId,
    elapsed,
    tokens,
    progress,
    events
  };
}

function AnalysisReportTerminal({
  rawEvents,
  platform,
  username,
}: {
  rawEvents: string[];
  platform: Platform;
  username: string;
}) {
  const meta = parseCachedRunMeta(rawEvents, username);
  const targetUrl = platform === "cnb"
    ? `https://cnb.cool/u/${username}`
    : `https://github.com/${username}`;

  return (
    <div className="terminal user-page-terminal">
      <div className="terminal-head">
        {/* 用独立的 --cached 修饰符区分“缓存回放”与实时执行的 done 状态灯，避免误导访客以为分析正在/刚刚发生。 */}
        <div className="status-led done status-led--cached" title="此报告来自只读缓存，非实时执行">只读回放</div>
        <div className="run-meta">
          <span>快照 ID: {meta.runId}</span>
          <span>{meta.elapsed}</span>
          <span>Tokens: {meta.tokens || "--"}</span>
        </div>
      </div>
      <div className="target-line">分析目标: {targetUrl}</div>
      <div className="run-article">
        <div className="run-kicker">分析简报</div>
        <p className="progress-copy">{meta.progress}</p>
      </div>
      <div className="event-stream">
        {meta.events.map((event, eventIndex) => (
          <div
            key={event.id}
            className={`event-line event-line--enter ${event.type || ""}`}
            style={{ "--stagger-index": eventIndex } as CSSProperties}
          >
            <code>{event.command}</code>
            <span>{event.text}</span>
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
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    setResult(null);
    setEvents([]);

    (async () => {
      try {
        const res = await fetch("/profile", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
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
        setEvents(data.events || []);
        setState("found");
      } catch {
        if (!cancelled) setState("error");
      }
    })();

    return () => { cancelled = true; };
  }, [platform, username]);

  const profileUrl = platform === "cnb"
    ? `https://cnb.cool/u/${encodeURIComponent(username)}`
    : `https://github.com/${username}`;
  const platformLabel = platform === "cnb" ? "CNB" : "GitHub";
  const cachedAtText = formatCachedAt(cachedAt);

  // 惰性初始化一次，避免父组件 re-render 时副标题随机跳动。
  const [subtitle] = useState(() => {
    const list = USER_PAGE_SUBTITLES(platformLabel, username);
    return list[Math.floor(Math.random() * list.length)];
  });

  return (
    <>
      <main className="app user-page-view">
        <header className="topbar topbar--profile">
          <div className="brand">
            <div className="mark">
              <img src="/favicon.svg" alt="GS Logo" />
            </div>
            <div>
              <h1>
                DevStats 统计工坊
                <span className="page-badge">/u/{platform}/{username}</span>
              </h1>
              <p className="sub">{subtitle}</p>
            </div>
          </div>

          <div className="topbar-tools topbar-tools--profile">
            <div className="context-strip context-strip--compact" aria-label="当前上下文">
              <span className="context-chip context-chip--platform">
                <span className="context-dot context-dot--active" />
                <span className="context-value">{platformLabel}</span>
              </span>
              <span className="context-chip">
                <span className="context-label">src</span>
                <span className="context-value">cache</span>
              </span>
              {cachedAtText && (
                <span className="context-chip">
                  <span className="context-label">built</span>
                  <span className="context-value">{cachedAtText.split("(")[0].trim()}</span>
                </span>
              )}
            </div>
            <BackToWorkshopLink />
          </div>
        </header>

        <section className="panel agent-right" style={{ minHeight: 320 }}>
          <div className="panel-head panel-head--compact">
            <div className="panel-head-main">
              <h2 className="panel-title">
                {result?.title || `${username} 的开发者画像`}
                {state === "found" && (
                  <span className="build-status build-status--ok">
                    <span className="status-dot" /> BUILD OK
                  </span>
                )}
              </h2>
              <span className="panel-note panel-note--muted">
                {result?.summary
                  ? result.summary
                  : "// 只读缓存视图 — 不消耗 token、不触发 Agent"}
              </span>
            </div>
            <div className="result-actions result-actions--compact">
              <button
                className="btn btn--outline"
                type="button"
                onClick={() => window.open(profileUrl, "_blank", "noopener,noreferrer")}
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M7.975 1.069a5.25 5.25 0 100 10.5 5.25 5.25 0 000-10.5z" stroke="currentColor" strokeWidth="1.2"/><path d="M11.925 11.119l2.85 2.85" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
                访问{platformLabel}
              </button>
              {result && !result.is_ghost && <ShareModal result={result} platform={platform} username={username} />}
            </div>
          </div>
          <div className="result-body">
            {state === "loading" && (
              <div className="user-page-loading">
                <div className="loading-terminal">
                  <span className="terminal-prompt">$</span>
                  <span className="terminal-cmd">fetch profile --platform={platform} --user={username} --from-cache</span>
                  <span className="terminal-cursor" />
                </div>
              </div>
            )}
            {state === "error" && (
              <div className="objective-card" style={{ borderLeft: "3px solid var(--coral)" }}>
                <p className="objective-text">
                  <code>Error: ENOENT — 缓存服务暂时不可达。</code>
                </p>
                <p className="objective-text">
                  这不是你的 bug，是我们的网络抽风了。
                  请稍后重试，或者直接<a href="/">回工坊首页</a>重新发起分析。
                </p>
              </div>
            )}
            {state === "not_found" && (
              <div className="objective-card objective-card--404" style={{ borderLeft: "3px solid var(--coral)" }}>
                <p className="objective-text objective-text--code">404 · Not Found</p>
                <p className="objective-text">
                  <strong>{platformLabel} · @{username}</strong>{" "}
                  暂无已缓存的分析结果。
                </p>
                <p className="objective-text">
                  可能原因：
                </p>
                <ul className="not-found-reasons">
                  <li>这位开发者还没来过工坊接受 AI 审判</li>
                  <li>用户名拼写有误（大小写敏感哦）</li>
                  <li>缓存过期并被 GC 回收了</li>
                </ul>
                <p className="objective-text">
                  解决方案 → 前往<a href="/"> 工坊首页 </a>手动发起一次分析。
                  <br />
                  <span style={{ color: "var(--muted)", fontSize: 12 }}>// 或者等这位开发者自己来生成一份</span>
                </p>
              </div>
            )}
            {state === "found" && result && (
              <>
                <AnalysisPathBar />
                <ReadmeReport result={result} config={{ platform, username }}>
                  <AnalysisReportTerminal rawEvents={events} platform={platform} username={username} />
                </ReadmeReport>
              </>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
