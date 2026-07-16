import { useEffect, useState } from "react";
import tdpLogo from "../assets/tdp-logo.svg";
import type { Platform } from "../lib/types";

type TdpIdentity = {
  platform: Platform;
  username: string;
};

type ImportState = "idle" | "loading" | "ready" | "empty" | "cancelled" | "error";

function consumeCallbackMarker() {
  const url = new URL(window.location.href);
  const marker = url.searchParams.get("tdp_oidc");
  if (!marker) return null;
  url.searchParams.delete("tdp_oidc");
  const cleanUrl = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(window.history.state, "", cleanUrl);
  return marker;
}

export function TdpIdentityImport({
  disabled,
  onSelect,
}: {
  disabled: boolean;
  onSelect: (identity: TdpIdentity) => void;
}) {
  const [state, setState] = useState<ImportState>("idle");
  const [identities, setIdentities] = useState<TdpIdentity[]>([]);
  const [selectedKey, setSelectedKey] = useState("");
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    const marker = consumeCallbackMarker();
    if (!marker) {
      let cancelled = false;
      void fetch("/api/auth/tdp/status", { cache: "no-store", headers: { Accept: "application/json" } })
        .then(async (response) => response.ok ? response.json() as Promise<{ configured?: boolean }> : { configured: false })
        .then((payload) => {
          if (!cancelled) setAvailable(payload.configured === true);
        })
        .catch(() => undefined);
      return () => { cancelled = true; };
    }
    setAvailable(true);
    if (marker === "cancelled") {
      setState("cancelled");
      return undefined;
    }
    if (marker !== "success") {
      setState("error");
      return undefined;
    }

    let cancelled = false;
    setState("loading");
    void (async () => {
      try {
        const response = await fetch("/api/auth/tdp/identity", {
          method: "GET",
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = await response.json() as { identities?: TdpIdentity[] };
        const available = Array.isArray(payload.identities)
          ? payload.identities.filter((identity) =>
            (identity.platform === "github" || identity.platform === "cnb") && Boolean(identity.username?.trim()))
          : [];
        if (cancelled) return;
        setIdentities(available);
        setState(available.length ? "ready" : "empty");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function startImport() {
    const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const startUrl = new URL("/api/auth/tdp/start", window.location.origin);
    startUrl.searchParams.set("return_to", returnTo);
    window.location.assign(`${startUrl.pathname}${startUrl.search}`);
  }

  function selectIdentity(identity: TdpIdentity) {
    const key = `${identity.platform}:${identity.username}`;
    setSelectedKey(key);
    onSelect(identity);
  }

  const statusCopy: Partial<Record<ImportState, string>> = {
    loading: "正在读取 TDP 已绑定账号…",
    empty: "TDP 账号暂未绑定 GitHub 或 CNB，请先在 tdp.fan 完成绑定。",
    cancelled: "已取消 TDP 授权，没有修改当前分析目标。",
    error: "没有拿到 TDP 绑定账号，请重试。",
  };

  if (!available) return null;

  return (
    <section className={`tdp-identity-import ${state === "error" ? "is-error" : ""}`} aria-label="从 TDP 导入账号">
      <div className="tdp-import-copy">
        <strong>分析我自己的账号</strong>
        <span>读取已绑定的 GitHub / CNB 用户名，不创建登录态。</span>
      </div>
      <button
        className="btn tdp-import-button"
        type="button"
        disabled={disabled || state === "loading"}
        aria-label={state === "loading" ? undefined : "从 TDP 获取账号"}
        onClick={startImport}
      >
        {state === "loading" ? "读取中…" : (
          <>
            <img className="tdp-button-mark" src={tdpLogo} alt="" aria-hidden="true" />
            <span className="tdp-button-text">获取账号</span>
          </>
        )}
      </button>

      {statusCopy[state] ? (
        <p className="tdp-import-status" role={state === "error" ? "alert" : "status"}>{statusCopy[state]}</p>
      ) : null}

      {state === "ready" ? (
        <div className="tdp-identity-list" aria-label="TDP 已绑定账号">
          {identities.map((identity) => {
            const key = `${identity.platform}:${identity.username}`;
            const platformLabel = identity.platform === "github" ? "GitHub" : "CNB";
            return (
              <button
                key={key}
                className={`tdp-identity-option ${selectedKey === key ? "selected" : ""}`}
                type="button"
                disabled={disabled}
                onClick={() => selectIdentity(identity)}
              >
                <span className={`tdp-platform-dot ${identity.platform}`} aria-hidden="true" />
                <span>
                  <small>{platformLabel}</small>
                  <strong>@{identity.username}</strong>
                </span>
                <span className="tdp-identity-action">{selectedKey === key ? "已填入" : "选择"}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
