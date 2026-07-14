import { useEffect, useMemo, useRef, useState } from "react";
import { createShareImage } from "../lib/shareCanvas";
import type { ReadmeResult, ShareData } from "../lib/types";

function cleanText(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function shareTextBlock(value: string, maxLength = 400) {
  const text = cleanText(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildShareData(result: ReadmeResult, platform: string, username: string): ShareData {
  return {
    platform: platform === "cnb" ? "CNB" : "GitHub",
    platformKey: platform === "cnb" ? "cnb" : "github",
    username,
    avatarUrl: result.avatarUrl,
    displayName: cleanText(result.user?.nickname || result.user?.name || username),
    handle: `@${username}`,
    score: result.score.toFixed(2),
    level: result.objective_rating || "评估中",
    bio: cleanText(result.user?.bio || "这位开发者很低调，什么都没有留下。"),
    objective: shareTextBlock(result.objective_summary),
    roast: shareTextBlock(result.roast_summary),
    promo: shareTextBlock(result.promotional_summary),
    badges: result.badges.length ? result.badges : ["#README画像", "#StatsAgent"],
    repos: result.top_repos.length
      ? result.top_repos.slice(0, 6).map((repo) => ({
          name: repo.name,
          meta: `${repo.stars || 0} ${repo.contributions_desc || "Owner"}`,
        }))
      : [{ name: "暂无明星项目贡献", meta: "--" }],
    host: location.host || "github-readme-stats",
  };
}

export function ShareModal({
  result,
  platform,
  username,
  prominent = false,
}: {
  result: ReadmeResult | null;
  platform: string;
  username: string;
  prominent?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [dataUrl, setDataUrl] = useState("");
  const [objectUrl, setObjectUrl] = useState("");
  const generationRef = useRef(0);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  const shareData = useMemo(() => (result ? buildShareData(result, platform, username) : null), [platform, result, username]);

  useEffect(() => {
    generationRef.current += 1;
    setDataUrl("");
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }, [shareData]);

  useEffect(() => {
    if (!open) return undefined;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    window.requestAnimationFrame(() => {
      const firstControl = dialog?.querySelector<HTMLElement>("button, a[href], [tabindex]:not([tabindex='-1'])");
      (firstControl || dialog)?.focus();
    });

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
      const controls = Array.from(dialog.querySelectorAll<HTMLElement>("button:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])"));
      if (!controls.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      (previousFocus || triggerRef.current)?.focus();
    };
  }, [open]);

  if (!result || result.is_ghost || !shareData) return null;

  async function prepare() {
    if (!shareData) return;
    setGenerating(true);
    setGenerationError("");
    try {
      const generation = generationRef.current;
      const nextUrl = await createShareImage(shareData);
      if (generation !== generationRef.current) {
        URL.revokeObjectURL(nextUrl);
        return;
      }
      setDataUrl(nextUrl);
      setObjectUrl((current) => {
        if (current) URL.revokeObjectURL(current);
        return nextUrl;
      });
    } finally {
      setGenerating(false);
    }
  }

  function showModal() {
    setOpen(true);
    if ((!dataUrl || !objectUrl) && !generating) {
      void (async () => {
        try {
          await prepare();
        } catch {
          setGenerationError("图片生成失败，请稍后重试。");
        }
      })();
    }
  }

  function warmup() {
    void (async () => {
      try {
        if (!dataUrl || !objectUrl) await prepare();
      } catch {
        // Click will surface generation failures.
      }
    })();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={`btn ${prominent ? "primary result-share-button" : ""}`}
        onPointerDown={warmup}
        onClick={showModal}
      >
        分享画像
      </button>
      {open && <div className="share-modal-overlay visible" onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <div
          className="share-modal-content"
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-modal-title"
          aria-describedby="share-modal-description"
          tabIndex={-1}
        >
          <div className="share-modal-header">
            <h3 id="share-modal-title">分享画像</h3>
            <button type="button" className="close-btn" aria-label="关闭分享画像弹窗" onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>
          <div className="share-modal-body">
            <p className={`share-modal-tip ${generationError ? "is-error" : ""}`} id="share-modal-description" role={generationError ? "alert" : "status"}>
              {generationError || (generating ? "正在绘制画像报告，请稍候..." : "画像已生成，可右键复制图片，或点击下方按钮下载。")}
            </p>
            <div className="share-image-container" style={{ position: "relative", minHeight: 240 }}>
              {generating && (
                <div className="image-loading-overlay" style={{ opacity: 1, pointerEvents: "auto" }}>
                  正在生成分享图片...
                </div>
              )}
              {dataUrl && <img src={dataUrl} alt="Share Preview" style={{ opacity: generating ? 0.3 : 1 }} />}
            </div>
            {generationError && <button className="btn subtle" type="button" onClick={() => void prepare()}>重新生成</button>}
          </div>
          <div className="share-modal-footer">
            <a
              className="btn"
              aria-disabled={generating || !dataUrl}
              style={generating || !dataUrl ? { cursor: "not-allowed", opacity: 0.55, pointerEvents: "none" } : undefined}
              href={generating || !dataUrl ? "#" : (objectUrl || dataUrl)}
              download={`${username || "developer"}-readme-stats-share.png`}
              onClick={(event) => {
                if (generating || !dataUrl) event.preventDefault();
              }}
            >
              {generating ? "正在生成中..." : dataUrl ? "保存到本地" : "等待生成"}
            </a>
          </div>
        </div>
      </div>}
    </>
  );
}
