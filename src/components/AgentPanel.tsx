import { useEffect, useRef } from "react";
import { useAgentRun } from "../hooks/useAgentRun";
import { toolchainItems } from "../lib/constants";
import { PlatformSegment } from "./PlatformSegment";
import { TdpIdentityImport } from "./TdpIdentityImport";
import type { AgentMode, ManualConfig } from "../lib/types";

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

  useEffect(() => {
    if (eventStreamRef.current) eventStreamRef.current.scrollTop = eventStreamRef.current.scrollHeight;
  }, [agent.events]);

  const ledMeta: Record<string, { cls: string; text: string }> = {
    running: { cls: "running", text: "运行中" },
    done: { cls: "done", text: "已完成" },
    stopped: { cls: "error", text: "已停止" },
    error: { cls: "error", text: "运行出错" },
  };
  const led = ledMeta[agent.status] || { cls: "", text: "未启动" };
  const hasTarget = Boolean(agent.agentUsername.trim());

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
              ariaLabel="AI 分析目标平台"
              disabled={agent.running}
              onChange={(platform) => {
                setPlatform(platform);
                agent.clearCacheBadges();
              }}
            />
          </div>
          <div className="field">
            <label htmlFor="agent-username">用户名 / 组织</label>
            <input
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
              {hasTarget ? "支持 GitHub 用户、组织或 CNB 用户名" : "请输入用户名后再启动分析"}
            </span>
          </div>
        </div>
        <TdpIdentityImport
          disabled={agent.running}
          onSelect={(identity) => {
            setPlatform(identity.platform);
            agent.setAgentUsername(identity.username);
            agent.clearCacheBadges();
          }}
        />
        <div className="task-grid">
          {[
            { mode: "readme" as AgentMode, title: "生成主页 README", text: "浏览主页、读取 Profile README，并输出可复制 Markdown", cached: agent.cacheBadges.readme },
            { mode: "stats" as AgentMode, title: "推荐卡片配方", text: "分析公开资料，生成可应用到手动面板的卡片方案", cached: agent.cacheBadges.stats },
          ].map((item) => (
            <button key={item.mode} className="task-btn" type="button" disabled={agent.running || !hasTarget} onClick={() => void agent.runAgent(item.mode)}>
              <div className="task-btn-content">
                <div className="task-btn-header">
                  <strong>{item.title}</strong>
                  <span className={`cache-badge ${item.cached ? "" : "hidden"}`}>已缓存</span>
                </div>
                <span>{item.text}</span>
              </div>
              <div className="task-btn-action">
                <div className="action-circle">
                  <span className="action-arrow">→</span>
                </div>
              </div>
            </button>
          ))}
        </div>
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
          <div className={`status-led ${led.cls}`} role="status" aria-live="polite">{led.text}</div>
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
        <div className="event-stream" ref={eventStreamRef} role="log" aria-live="polite" aria-relevant="additions text">
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
        <button className={`btn ghost ${agent.cacheBadges.visible ? "" : "hidden"}`} type="button" title="重新采集公开资料并更新缓存；为防滥用会受限流保护" disabled={agent.running} onClick={agent.reanalyze}>
          重新分析
        </button>
      </div>
    </aside>
  );
}
