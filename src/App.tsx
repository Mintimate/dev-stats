import { useEffect, useState } from "react";
import { useAgentRun } from "./hooks/useAgentRun";
import { useManualStats } from "./hooks/useManualStats";
import { LeaderboardPanel } from "./components/LeaderboardPanel";
import { TopBar } from "./components/TopBar";
import { AgentPanel } from "./components/AgentPanel";
import { AgentResultPanel } from "./components/AgentResultPanel";
import { ManualOptions } from "./components/ManualOptions";
import { PreviewPanel } from "./components/PreviewPanel";
import { Footer } from "./components/Footer";
import type { GlobalStatus, ViewName } from "./lib/types";
import "./styles.css";
import "./workshop.css";

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

  useEffect(() => {
    if (!globalStatus.transient) return undefined;
    const timer = window.setTimeout(() => setGlobalStatus({ label: "准备就绪" }), 2800);
    return () => window.clearTimeout(timer);
  }, [globalStatus]);

  function setView(nextView: ViewName) {
    setViewState(nextView);
    const nextHash = nextView === "manual" ? "manual" : "agent";
    if (location.hash !== `#${nextHash}`) location.hash = nextHash;
  }

  return (
    <>
      <main className={`app ${view === "agent" ? "app-agent-workbench" : ""}`}>
        <TopBar view={view} setView={setView} config={manual.config} status={globalStatus} />
        <section className={`agent-home view ${view === "agent" ? "" : "hidden"}`} aria-label="开发者鉴定">
          <div className="workshop-intro">
            <h2>代码有记录，<span>吐槽有依据。</span></h2>
            <p>看公开贡献，认领一份有点扎心的开发者画像。</p>
          </div>
          <div className="agent-workbench">
            <AgentPanel config={manual.config} agent={agent} setPlatform={manual.setPlatform} />
            <AgentResultPanel agent={agent} config={manual.config} applyRecipe={manual.applyRecipe} setView={setView} setGlobalStatus={setGlobalStatus} />
            <LeaderboardPanel />
          </div>
        </section>
        <section className={`workspace view ${view === "manual" ? "" : "hidden"}`}>
          <ManualOptions config={manual.config} updateConfig={manual.updateConfig} setPlatform={manual.setPlatform} resetOptions={manual.resetOptions} />
          <PreviewPanel
            previewUrl={manual.previewUrl}
            markdown={manual.markdown}
            pending={manual.previewPending}
            validationMessage={manual.validationMessage}
            setGlobalStatus={setGlobalStatus}
          />
        </section>
        {globalStatus.transient ? (
          <div
            className={`status-toast visible ${globalStatus.tone || ""}`}
            role={globalStatus.tone === "is-error" ? "alert" : "status"}
            aria-live={globalStatus.tone === "is-error" ? "assertive" : "polite"}
            aria-atomic="true"
          >
            {globalStatus.label}
          </div>
        ) : null}
      </main>
      <Footer />
    </>
  );
}
