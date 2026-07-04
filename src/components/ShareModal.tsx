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

export function ShareModal({ result, platform, username }: { result: ReadmeResult | null; platform: string; username: string }) {
  const [open, setOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [dataUrl, setDataUrl] = useState("");
  const [objectUrl, setObjectUrl] = useState("");
  const generationRef = useRef(0);

  const shareData = useMemo(() => (result ? buildShareData(result, platform, username) : null), [platform, result, username]);

  useEffect(() => {
    generationRef.current += 1;
    setDataUrl("");
    setObjectUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  }, [shareData]);

  if (!result || result.is_ghost || !shareData) return null;

  async function prepare() {
    if (!shareData) return;
    setGenerating(true);
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

  function showModal(event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    setOpen(true);
    if (!dataUrl || !objectUrl) {
      void (async () => {
        try {
          await prepare();
        } catch {
          alert("图片生成失败，请稍后重试。");
          setOpen(false);
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
      <a
        className="btn"
        href={objectUrl || "#"}
        download={`${username || "developer"}-readme-stats-share.png`}
        onPointerDown={warmup}
        onClick={showModal}
      >
        分享画像
      </a>
      <div className={`share-modal-overlay ${open ? "visible" : "hidden"}`} onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}>
        <div className="share-modal-content">
          <div className="share-modal-header">
            <h3>分享画像</h3>
            <button type="button" className="close-btn" onClick={() => setOpen(false)}>
              &times;
            </button>
          </div>
          <div className="share-modal-body">
            <p className="share-modal-tip">
              {generating ? "正在绘制画像报告，请稍候..." : "画像已生成，可右键复制图片，或点击下方按钮下载。"}
            </p>
            <div className="share-image-container" style={{ position: "relative", minHeight: 240 }}>
              {generating && (
                <div className="image-loading-overlay" style={{ opacity: 1, pointerEvents: "auto" }}>
                  正在生成分享图片...
                </div>
              )}
              {dataUrl && <img src={dataUrl} alt="Share Preview" style={{ opacity: generating ? 0.3 : 1 }} />}
            </div>
          </div>
          <div className="share-modal-footer">
            <a
              className="btn"
              style={generating ? { cursor: "not-allowed", opacity: 0.55, pointerEvents: "none" } : undefined}
              href={generating ? "#" : (objectUrl || dataUrl || "#")}
              download={`${username || "developer"}-readme-stats-share.png`}
              onClick={(event) => {
                if (generating) event.preventDefault();
              }}
            >
              {generating ? "正在生成中..." : "保存到本地"}
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
