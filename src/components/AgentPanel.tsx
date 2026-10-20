import { useEffect, useRef, useState } from "react";
import { useAgentRun } from "../hooks/useAgentRun";
import { toolchainItems } from "../lib/constants";
import { PlatformSegment } from "./PlatformSegment";
import { TdpIdentityImport } from "./TdpIdentityImport";
import type { ManualConfig } from "../lib/types";

export function AgentPanel({
  config,
  agent,
  setPlatform,
}: {
  config: ManualConfig;
  agent: ReturnType<typeof useAgentRun>;
  setPlatform: (platform: ManualConfig["platform"]) => void;
}) {
  const eventStreamRef = useRef<HTMLDivElement | null>(null);
  const runDetailsRef = useRef<HTMLDetailsElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const followingEventsRef = useRef(true);
  const lastRunIdRef = useRef(agent.runId);
  const lastEventIdRef = useRef(agent.events.at(-1)?.id);
  const [hasNewEvents, setHasNewEvents] = useState(false);
  const [importOpen, setImportOpen] = useState(() =>
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tdp_oidc"),
  );

  useEffect(() => {
    const runChanged = lastRunIdRef.current !== agent.runId;
    if (runChanged) {
      lastRunIdRef.current = agent.runId;
      followingEventsRef.current = true;
      setHasNewEvents(false);
    }

    const latestEventId = agent.events.at(-1)?.id;
    const eventsChanged = lastEventIdRef.current !== latestEventId;
    lastEventIdRef.current = latestEventId;
    if (!eventsChanged && !runChanged) return;

    const stream = eventStreamRef.current;
    if (followingEventsRef.current) {
      if (stream && runDetailsRef.current?.open) stream.scrollTop = stream.scrollHeight;
      setHasNewEvents(false);
    } else {
      setHasNewEvents(true);
    }
  }, [agent.events, agent.runId]);

  function followLatestEvents() {
    followingEventsRef.current = true;
    const stream = eventStreamRef.current;
    if (stream) stream.scrollTop = stream.scrollHeight;
    setHasNewEvents(false);
  }

  function handleEventScroll() {
    const stream = eventStreamRef.current;
    if (!stream || !runDetailsRef.current?.open) return;
    const nearBottom = stream.scrollHeight - stream.scrollTop - stream.clientHeight <= 48;
    followingEventsRef.current = nearBottom;
    if (nearBottom) setHasNewEvents(false);
  }

  const ledMeta: Record<string, { cls: string; text: string }> = {
    running: { cls: "running", text: "运行中" },
    done: { cls: "done", text: "已完成" },
    stopped: { cls: "error", text: "已停止" },
    error: { cls: "error", text: "运行出错" },
  };
  const led = ledMeta[agent.status] || { cls: "", text: "未启动" };
  const hasTarget = Boolean(agent.agentUsername.trim());

  return (
    <aside className="panel agent-left agent-launch-panel" aria-label="开发者鉴定">
      <form
        className="launch-form agent-launch-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!agent.running && hasTarget) void agent.runAgent("readme");
        }}
      >
        <div className="launch-grid agent-input-row">
          <div className="field agent-platform-field">
            <label>平台</label>
            <PlatformSegment
              platform={config.platform}
              ariaLabel="鉴定目标平台"
              disabled={agent.running}
              onChange={(platform) => {
                setPlatform(platform);
                agent.clearCacheBadges();
              }}
            />
          </div>
          <div className="field agent-username-field">
            <label htmlFor="agent-username">用户名 / 组织</label>
            <input
              ref={usernameRef}
              id="agent-username"
              value={agent.agentUsername}
              disabled={agent.running}
              required
              autoComplete="off"
              placeholder="例如 Mintimate"
              aria-describedby="agent-username-help"
              onChange={(event) => agent.setAgentUsername(event.target.value)}
            />
            <span className={`field-help ${hasTarget ? "" : "is-error"}`} id="agent-username-help">
              {hasTarget ? "支持 GitHub 用户、组织或 CNB 用户名" : "请输入用户名后再开始鉴定"}
            </span>
          </div>
          <button className="btn primary agent-start-button" type="submit" disabled={agent.running || !hasTarget}>
            <span>{agent.running ? "分析中…" : "开始鉴定"}</span>
            {agent.cacheBadges.readme && <span className="cache-badge">已缓存</span>}
            <span aria-hidden="true">→</span>
          </button>
        </div>
        <div className="agent-secondary-actions">
          <p className="agent-launch-note">看公开贡献，给出有依据的吐槽与建议，也能导出 README。</p>
          <button
            className="btn ghost agent-recipe-button"
            type="button"
            disabled={agent.running || !hasTarget}
            onClick={() => void agent.runAgent("stats")}
          >
            卡片配方
            {agent.cacheBadges.stats && <span className="cache-badge">已缓存</span>}
          </button>
        </div>
        <details
          className="agent-import-details"
          open={importOpen}
          onToggle={(event) => setImportOpen(event.currentTarget.open)}
        >
          <summary>从 TDP 导入账号</summary>
          <TdpIdentityImport
            disabled={agent.running}
            onSelect={(identity) => {
              setPlatform(identity.platform);
              agent.setAgentUsername(identity.username);
              agent.clearCacheBadges();
              setImportOpen(false);
              usernameRef.current?.focus();
            }}
          />
        </details>
      </form>

      <div className={`cache-info-bar ${agent.cacheBadges.visible ? "visible" : ""}`}>
        <span className="cache-badge">缓存</span>
        <span className="cache-info-text">
          <strong>{agent.cacheBadges.username || "--"}</strong> 的分析结果已缓存，将直接展示
          {agent.cacheBadges.expiresAt ? (
            <span className="cache-expiry">自动过期：{agent.cacheBadges.expiresAt}{agent.cacheBadges.remaining ? `（${agent.cacheBadges.remaining}）` : ""}</span>
          ) : (
            <span className="cache-expiry">有效期 24h</span>
          )}
        </span>
      </div>

      <details
        className="agent-run-details"
        ref={runDetailsRef}
        onToggle={(event) => {
          if (event.currentTarget.open && followingEventsRef.current) followLatestEvents();
        }}
      >
        <summary>
          <span className="agent-run-details-label">运行详情</span>
          <span className={`status-led ${led.cls}`} role="status" aria-live="polite">{led.text}</span>
          <span className="agent-run-elapsed">{agent.elapsed}</span>
          {hasNewEvents && <span className="agent-run-unread">有新日志</span>}
        </summary>
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
            <div className="run-meta">
              <span className={`run-loader ${agent.running ? "" : "hidden"}`}>运行中</span>
              <span>运行 ID: {agent.runId ? agent.runId.slice(0, 8) : "--"}</span>
              <span>Tokens: {agent.usage?.total || "--"}</span>
            </div>
          </div>
          <div className="target-line">分析目标: {config.platform === "cnb" ? `https://cnb.cool/u/${config.username || "Mintimate"}` : `https://github.com/${config.username || "Mintimate"}`}</div>
          <div className="run-article">
            <div className="run-kicker">分析简报</div>
            <p className="progress-copy">{agent.progress}</p>
          </div>
          <div
            className="event-stream"
            id="agent-event-stream"
            ref={eventStreamRef}
            onScroll={handleEventScroll}
            role="log"
            aria-label="鉴定运行日志"
            aria-live="polite"
            aria-relevant="additions text"
            tabIndex={0}
          >
            {agent.events.map((event) => (
              <div key={event.id} className={`event-line ${event.type || ""}`}>
                <code>{event.command}</code>
                <span>{event.text}</span>
              </div>
            ))}
          </div>
          <div className="event-stream-actions">
            {hasNewEvents && (
              <button
                className="btn subtle event-follow-button"
                type="button"
                aria-controls="agent-event-stream"
                onClick={followLatestEvents}
              >
                查看新日志 ↓
              </button>
            )}
          </div>
        </div>
      </details>
      {(agent.running || agent.cacheBadges.visible) && (
        <div className="agent-actions">
          {agent.running && (
            <button className="btn warn" type="button" onClick={() => void agent.stopAgent()}>
              停止分析
            </button>
          )}
          {agent.cacheBadges.visible && (
            <button className="btn ghost" type="button" title="重新采集公开资料并更新缓存；为防滥用会受限流保护" disabled={agent.running} onClick={agent.reanalyze}>
              重新分析
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
