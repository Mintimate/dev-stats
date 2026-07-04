import { useEffect, useRef, useState } from "react";
import { emptyToolchain } from "../lib/constants";
import {
  buildAgentMessage,
  captureRecipe,
  completedToolchain,
  ghostResult,
  narrativeForTool,
  normalizeReadmeResult,
  normalizeToolName,
  parseUserProfileFromTool,
  recipeFromEvent,
  updateToolchainState,
} from "../lib/agentLogic";
import { profileUrlFor } from "../lib/statsUrl";
import type {
  AgentMode,
  AgentResult,
  AgentStatus,
  EventLine,
  GlobalStatus,
  ManualConfig,
  StatsRecipe,
  ToolchainState,
  Usage,
  UserProfile,
} from "../lib/types";

function eventId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const initialEvents: EventLine[] = [
  { id: "ready", command: "READY", text: "选择平台、填用户名，然后把 Agent 放出去。" },
];

const cacheTtlMs = 24 * 60 * 60 * 1000;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function formatDateTime(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseCacheDate(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const raw = typeof value === "number" ? value : String(value).trim();
  const timestamp = typeof raw === "number" ? raw : /^\d+$/.test(raw) ? Number(raw) : NaN;
  const date = Number.isFinite(timestamp) ? new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp) : new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatRemaining(ms: number) {
  if (ms <= 0) return "已到期";
  const totalMinutes = Math.ceil(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes} 分钟后`;
  if (minutes === 0) return `${hours} 小时后`;
  return `${hours} 小时 ${minutes} 分钟后`;
}

export function useAgentRun(config: ManualConfig, syncUsername: (username: string) => void, setGlobalStatus: (status: GlobalStatus) => void) {
  const [agentUsername, setAgentUsernameState] = useState(config.username);
  const [status, setStatus] = useState<AgentStatus>("idle");
  const [events, setEvents] = useState<EventLine[]>(initialEvents);
  const [progress, setProgress] = useState("等待输入目标，别急，终端还没开始发热。");
  const [runId, setRunId] = useState("");
  const [elapsed, setElapsed] = useState("00.0s");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [result, setResult] = useState<AgentResult>({ kind: "none" });
  const [toolchain, setToolchain] = useState<ToolchainState>(emptyToolchain);
  const [lastRecipe, setLastRecipe] = useState<StatsRecipe | null>(null);
  const [lastMode, setLastMode] = useState<AgentMode | null>(null);
  const [cacheBadges, setCacheBadges] = useState({
    readme: false,
    stats: false,
    visible: false,
    username: "",
    expiresAt: "",
    remaining: "",
  });

  const controllerRef = useRef<AbortController | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const assistantTextRef = useRef("");
  const profileRef = useRef<UserProfile | null>(null);
  const lastNarrativeRef = useRef("");
  const hasResultRef = useRef(false);

  useEffect(() => {
    setAgentUsernameState(config.username);
  }, [config.username]);

  function addEvent(command: string, text: string, type?: string, key?: string) {
    if (key && lastNarrativeRef.current === key) return;
    if (key) lastNarrativeRef.current = key;
    setEvents((current) => [...current, { id: eventId(), command, text, type }]);
  }

  function addNarrative(command: string, text: string, type?: string, key?: string) {
    setProgress(text);
    addEvent(command, text, type, key);
  }

  function resetRunPanel() {
    assistantTextRef.current = "";
    profileRef.current = null;
    lastNarrativeRef.current = "";
    hasResultRef.current = false;
    setEvents(initialEvents);
    setProgress("等待输入目标，别急，终端还没开始发热。");
    setStatus("idle");
    setRunId("");
    setElapsed("00.0s");
    setUsage(null);
    setResult({ kind: "none" });
    setToolchain(emptyToolchain);
  }

  function startTimer() {
    startedAtRef.current = performance.now();
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(`${seconds.toFixed(1).padStart(4, "0")}s`);
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    if (startedAtRef.current) {
      const seconds = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(`${seconds.toFixed(1).padStart(4, "0")}s`);
    }
  }

  function clearCacheBadges() {
    setCacheBadges({ readme: false, stats: false, visible: false, username: "", expiresAt: "", remaining: "" });
  }

  function setAgentUsername(value: string) {
    setAgentUsernameState(value);
    syncUsername(value);
    clearCacheBadges();
  }

  function finishWithReadme(event: Record<string, unknown>, activeConfig: ManualConfig) {
    const data = normalizeReadmeResult(event, activeConfig, profileRef.current, assistantTextRef.current);
    hasResultRef.current = true;
    setResult({ kind: "readme", data });
    addNarrative(
      "RENDER",
      data.is_ghost ? "已装配查无此人幽默占位图，请检查拼写。" : "README Markdown 已生成，复制就能塞进仓库门面并支持分享。",
      "ok",
      "readme:render",
    );
  }

  function finishWithStats(recipe: StatsRecipe, summary = "") {
    hasResultRef.current = true;
    setLastRecipe(recipe);
    setResult({ kind: "stats", recipe, summary: summary || recipe.rationale || "Recommended stats configuration ready." });
    setToolchain(completedToolchain());
    addNarrative("RENDER", `Stats 预览已装配：${recipe.cards?.join(", ") || "卡片配方"}。`, "ok", "stats:render");
  }

  function handleSsePart(part: string, activeConfig: ManualConfig) {
    const line = part.split("\n").find((item) => item.startsWith("data: "));
    if (!line) return;
    const payload = line.slice(6);
    if (payload === "[DONE]") return;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(payload);
    } catch {
      return;
    }

    if (event.type === "cache_hit") {
      const cacheMode = String(event.mode || "readme");
      const cachedAt = parseCacheDate(event.cached_at);
      const cachedAgo = cachedAt ? Math.round((Date.now() - cachedAt.getTime()) / 60000) : null;
      const expiresAt = cachedAt ? new Date(cachedAt.getTime() + cacheTtlMs) : null;
      const agoText = cachedAgo !== null ? `（${cachedAgo} 分钟前缓存）` : "";
      setCacheBadges({
        readme: cacheMode === "readme",
        stats: cacheMode !== "readme",
        visible: true,
        username: String(event.username || ""),
        expiresAt: expiresAt ? formatDateTime(expiresAt) : "",
        remaining: expiresAt ? formatRemaining(expiresAt.getTime() - Date.now()) : "",
      });
      addNarrative("CACHE", `命中缓存${agoText}，直接展示历史分析结果。`, "ok", "cache:hit");
    } else if (event.type === "ai_response") {
      assistantTextRef.current += String(event.content || "");
    } else if (event.type === "text_delta") {
      if (!event.mirrored) assistantTextRef.current += String(event.delta || event.content || "");
    } else if (event.type === "agent_status") {
      addNarrative("AGENT", `模型就绪：${event.protocol || "model"} · ${event.model || ""}`.trim(), "ok", "agent:ready");
    } else if (event.type === "user_profile") {
      try {
        profileRef.current = JSON.parse(String(event.content || "{}"));
      } catch {
        profileRef.current = null;
      }
    } else if (event.type === "thinking") {
      addNarrative("STATUS", "Agent 已上线，正在整理工具箱和上下文。", "ok", "agent:thinking");
    } else if (event.type === "tool_call" || event.type === "tool_called") {
      setToolchain((current) => updateToolchainState(current, String(event.name || ""), "active"));
      addNarrative("RUNNING", narrativeForTool(String(event.name || ""), "start"), "", `tool:${normalizeToolName(String(event.name || ""))}:start`);
    } else if (event.type === "tool_result") {
      const name = String(event.name || "");
      setToolchain((current) => updateToolchainState(current, name, "completed"));
      const recipe = captureRecipe({ name, content: String(event.content || "") });
      if (recipe) {
        setLastRecipe(recipe);
      }
      const profile = parseUserProfileFromTool({ name, content: String(event.content || "") });
      if (profile) profileRef.current = profile;
      addNarrative("OK", narrativeForTool(name, "done"), "ok", `tool:${normalizeToolName(name)}:done`);
    } else if (event.type === "stats_recipe") {
      const recipe = recipeFromEvent(event);
      if (recipe) finishWithStats(recipe, String(event.rationale || recipe.rationale || ""));
    } else if (event.type === "readme_draft") {
      setToolchain(completedToolchain());
      finishWithReadme(event, activeConfig);
    } else if (event.type === "usage") {
      const nextUsage = {
        input: Number(event.input_tokens || 0),
        output: Number(event.output_tokens || 0),
        total: Number(event.total_tokens || 0),
      };
      setUsage(nextUsage);
      addEvent("TOKENS", `本轮消耗 ${nextUsage.total || 0} tokens。`);
    } else if (event.type === "error_message") {
      const message = String(event.content || "Agent error");
      if (hasResultRef.current && /Max turns/i.test(message)) {
        setStatus("done");
        addNarrative("DONE", "结果已经生成，模型多跑的尾巴已忽略。", "ok", "agent:max-turns-soft");
      } else {
        setStatus("error");
        addNarrative("ERROR", message, "error", "agent:error");
        if (message.includes("不存在 (404)")) {
          finishWithReadme(ghostResult(activeConfig.username || "GhostDeveloper"), activeConfig);
        }
      }
    }
  }

  async function runAgent(mode: AgentMode, forceReanalyze = false) {
    const activeConfig = { ...config, username: agentUsername.trim() || "Mintimate", agent_mode: mode };
    syncUsername(activeConfig.username);
    setLastMode(mode);
    resetRunPanel();

    const activeRunId = crypto.randomUUID();
    setRunId(activeRunId);
    setStatus("running");
    setGlobalStatus({ label: "Running", tone: "is-running" });
    startTimer();
    addNarrative(
      "RUN",
      `开始分析 ${activeConfig.platform}/${activeConfig.username}，目标是${mode === "readme" ? "生成一份像样的 README" : "凑一套能打的 Stats 卡片"}。`,
      "ok",
      "run:start",
    );
    addEvent("TARGET", profileUrlFor(activeConfig));

    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch("/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "makers-conversation-id": activeRunId,
        },
        body: JSON.stringify({
          message: buildAgentMessage(activeConfig, mode),
          state: activeConfig,
          force_reanalyze: forceReanalyze,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) throw new Error(await response.text());

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";
        parts.forEach((chunk) => handleSsePart(chunk, activeConfig));
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") {
        const message = (error as Error).message || String(error);
        if (hasResultRef.current && /Max turns/i.test(message)) {
          setStatus("done");
          addNarrative("DONE", "结果已经落盘，后续模型循环已被截断。", "ok", "run:max-turns-soft");
        } else {
          setStatus("error");
          addNarrative("ERROR", message, "error", "run:error");
          setGlobalStatus({ label: "Error", tone: "is-error" });
        }
      }
    } finally {
      controllerRef.current = null;
      stopTimer();
      setGlobalStatus({ label: "Ready" });
      setStatus((current) => {
        if (current === "running") {
          addNarrative("DONE", "收工。该看的都看了，该吐的槽也吐完了。", "ok", "run:done");
          return "done";
        }
        return current;
      });
    }
  }

  async function stopAgent() {
    controllerRef.current?.abort();
    setStatus("stopped");
    addNarrative("STOP", `手动中止 run ${runId ? runId.slice(0, 8) : "--"}，这次先放它一马。`, "error", "run:stop");
    try {
      await fetch("/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: runId }),
      });
    } catch {
      // The local abort already updates the UI.
    }
  }

  function reanalyze() {
    if (lastMode) void runAgent(lastMode, true);
  }

  return {
    agentUsername,
    setAgentUsername,
    status,
    running: status === "running",
    events,
    progress,
    runId,
    elapsed,
    usage,
    result,
    toolchain,
    lastRecipe,
    cacheBadges,
    runAgent,
    stopAgent,
    reanalyze,
    clearCacheBadges,
  };
}
