import { useEffect, useRef, useState } from "react";

export function useImagePreview(src: string) {
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  // 跟踪当前 src，避免旧图片的 onLoad/onError 回调覆盖新图片的 loading 状态。
  const srcRef = useRef(src);

  useEffect(() => {
    srcRef.current = src;
    setError("");
    setAttempt(0);
    if (!src) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [src]);

  return {
    loading,
    error,
    retry: () => {
      if (!src) return;
      setError("");
      setLoading(true);
      setAttempt((current) => current + 1);
    },
    imageKey: `${src}:${attempt}`,
    imageProps: {
      src,
      onLoad: () => {
        if (srcRef.current === src) setLoading(false);
      },
      onError: () => {
        if (srcRef.current === src) {
          setLoading(false);
          setError("预览加载失败，请检查用户名、仓库名或稍后重试。");
        }
      },
    },
  };
}
