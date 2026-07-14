import { useState } from "react";
import { useImagePreview } from "../hooks/useImagePreview";
import type { GlobalStatus } from "../lib/types";

export function PreviewPanel({
  previewUrl,
  markdown,
  pending,
  validationMessage,
  setGlobalStatus,
}: {
  previewUrl: string;
  markdown: string;
  pending: boolean;
  validationMessage: string;
  setGlobalStatus: (status: GlobalStatus) => void;
}) {
  const preview = useImagePreview(previewUrl);
  const [copied, setCopied] = useState<"markdown" | "endpoint" | "">("");

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      const target = label === "Markdown" ? "markdown" : "endpoint";
      setCopied(target);
      window.setTimeout(() => setCopied((current) => current === target ? "" : current), 1800);
      setGlobalStatus({ label: `${label} 已复制`, transient: true });
    } catch {
      setGlobalStatus({ label: `复制 ${label} 失败，请检查剪贴板权限`, tone: "is-error", transient: true });
    }
  }

  return (
    <section className="preview-grid" id="manual-preview" aria-label="卡片预览与复制">
      <section className="panel">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-window-controls">
              <span className="dot dot-close" />
              <span className="dot dot-minimize" />
              <span className="dot dot-expand" />
            </div>
            <div>
              <h2 className="panel-title">// Stage.output - 渲染管线输出</h2>
              <span className="panel-note">
                {validationMessage || (pending ? "参数已变化，正在更新预览…" : previewUrl)}
              </span>
            </div>
          </div>
          <button className="btn subtle" type="button" disabled={!previewUrl || Boolean(validationMessage)} onClick={() => window.open(previewUrl, "_blank", "noopener")}>打开预览</button>
        </div>
        <div className={`preview-stage image-preview-frame ${preview.loading || pending ? "is-loading" : ""} ${preview.error ? "has-error" : ""}`} aria-busy={preview.loading || pending}>
          {previewUrl ? <img key={preview.imageKey} alt="Statistics card preview" {...preview.imageProps} /> : (
            <div className="preview-empty" role="status">{validationMessage || "填写参数后将在这里生成卡片预览。"}</div>
          )}
          <div className={`image-loading-overlay ${preview.loading || pending ? "" : "hidden"}`} aria-hidden={!preview.loading && !pending}>更新预览中</div>
          {preview.error && (
            <div className="image-error-overlay" role="alert">
              <span>{preview.error}</span>
              <button className="btn subtle" type="button" onClick={preview.retry}>重新加载</button>
            </div>
          )}
        </div>
      </section>
      <section className="panel output">
        <div className="panel-head">
          <div className="panel-title-group">
            <div className="panel-window-controls">
              <span className="dot dot-close" />
              <span className="dot dot-minimize" />
              <span className="dot dot-expand" />
            </div>
            <div>
              <h2 className="panel-title">// Clipboard.copypasta - 终极大招</h2>
              <span className="panel-note">可直接粘贴至 README.md 中</span>
            </div>
          </div>
          <button className="btn primary" type="button" disabled={!markdown || pending || Boolean(validationMessage)} onClick={() => void copy(markdown, "Markdown")}>{copied === "markdown" ? "已复制 ✓" : "复制 Markdown"}</button>
        </div>
        <pre className="codebox">{markdown}</pre>
        <div className="mini-list">
          <div className="url-line">{previewUrl}</div>
          <button className="btn subtle" type="button" disabled={!previewUrl || pending || Boolean(validationMessage)} onClick={() => void copy(previewUrl, "API 地址")}>{copied === "endpoint" ? "已复制 ✓" : "复制 API 地址"}</button>
        </div>
      </section>
      <div className="mobile-preview-actions" aria-label="预览快捷操作">
        <button className="btn" type="button" onClick={() => document.getElementById("manual-preview")?.scrollIntoView({ behavior: "smooth", block: "start" })}>查看预览</button>
        <button className="btn primary" type="button" disabled={!markdown || pending || Boolean(validationMessage)} onClick={() => void copy(markdown, "Markdown")}>{copied === "markdown" ? "已复制 ✓" : "复制 Markdown"}</button>
      </div>
    </section>
  );
}
