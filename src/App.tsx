import { useCallback, useEffect, useState } from "react";
import { useAgentRun } from "./hooks/useAgentRun";
import { useManualStats } from "./hooks/useManualStats";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import type { LeaderboardItem } from "./components/LeaderboardPanel";
import { TopBar } from "./components/TopBar";
import { AgentPanel } from "./components/AgentPanel";
import { AgentResultPanel } from "./components/AgentResultPanel";
import { ManualOptions } from "./components/ManualOptions";
import { PreviewPanel } from "./components/PreviewPanel";
import { Footer } from "./components/Footer";
import type { GlobalStatus, StatsRecipe, ViewName } from "./lib/types";
import "./styles.css";

function viewFromHash(): ViewName {
  return location.hash === "#manual" ? "manual" : "agent";
}

export default function App() {
  const manual = useManualStats();
  const [view, setViewState] = useState<ViewName>(viewFromHash);
  const [globalStatus, setGlobalStatus] = useState<GlobalStatus>({ label: "准备就绪" });
  const agent = useAgentRun(manual.config, manual.syncUsername, setGlobalStatus);

  // 监听 hashchange：浏览器前进/后退或手动改 URL hash 时同步视图状态。
  useEffect(() => {
    function onHashChange() {
      setViewState((current) => {
        const next = viewFromHash();
        return current !== next ? next : current;
      });
    }
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  function setView(nextView: ViewName) {
    setViewState(nextView);
    const nextHash = nextView === "manual" ? "manual" : "agent";
    if (location.hash !== `#${nextHash}`) location.hash = nextHash;
  }

  const shellClass = `agent-home view ${view === "agent" ? "" : "hidden"} split-layout`;

  const handleLoadUser = useCallback((item: LeaderboardItem) => {
    manual.setPlatform(item.platform);
    agent.setAgentUsername(item.username);
    void agent.runAgent("readme", false, { platform: item.platform, username: item.username });
  }, [manual.setPlatform, agent.setAgentUsername, agent.runAgent]);

  const showResult = agent.result.kind !== "none" || agent.running;

  return (
    <>
      <main className="app">
        <TopBar view={view} setView={setView} config={manual.config} status={globalStatus} />
        <section className={shellClass}>
          <AgentPanel config={manual.config} agent={agent} setPlatform={manual.setPlatform} />
          {showResult ? (
            <AgentResultPanel agent={agent} config={manual.config} applyRecipe={manual.applyRecipe} setView={setView} setGlobalStatus={setGlobalStatus} />
          ) : (
            <LeaderboardPanel onLoadUser={handleLoadUser} />
          )}
        </section>
        <section className={`workspace view ${view === "manual" ? "" : "hidden"}`}>
          <ManualOptions config={manual.config} updateConfig={manual.updateConfig} setPlatform={manual.setPlatform} resetOptions={manual.resetOptions} />
          <PreviewPanel previewUrl={manual.previewUrl} markdown={manual.markdown} setGlobalStatus={setGlobalStatus} />
        </section>
      </main>
      <Footer />
    </>
  );
}
