import { useImagePreview } from "../hooks/useImagePreview";
import type { GlobalStatus } from "../lib/types";

export function PreviewPanel({
  previewUrl,
  markdown,
  setGlobalStatus,
}: {
  previewUrl: string;
  markdown: string;
  setGlobalStatus: (status: GlobalStatus) => void;
}) {
  const preview = useImagePreview(previewUrl);

  async function copy(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setGlobalStatus({ label: `[Debugger] ${label}已拷贝至剪贴板` });
    } catch {
      setGlobalStatus({ label: `[Error] 复制 ${label} 失败，请检查 clipboard 权限`, tone: "is-error" });
    }
  }

  return (
    <section className="preview-grid">
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
              <span className="panel-note">{previewUrl}</span>
            </div>
          </div>
          <button className="btn subtle" type="button" onClick={() => window.open(previewUrl, "_blank", "noopener")}>curl --open</button>
        </div>
        <div className={`preview-stage image-preview-frame ${preview.loading ? "is-loading" : ""}`} aria-busy={preview.loading}>
          <img alt="Statistics card preview" {...preview.imageProps} />
          <div className={`image-loading-overlay ${preview.loading ? "" : "hidden"}`} aria-hidden={!preview.loading}>加载预览中</div>
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
          <button className="btn primary" type="button" onClick={() => void copy(markdown, "Markdown 碎片")}>pbcopy</button>
        </div>
        <pre className="codebox">{markdown}</pre>
        <div className="mini-list">
          <div className="url-line">{previewUrl}</div>
          <button className="btn subtle" type="button" onClick={() => void copy(previewUrl, "API 终点")}>Copy Endpoint (复制请求路径)</button>
        </div>
      </section>
    </section>
  );
}
