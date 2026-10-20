import { useLayoutEffect, useRef, useState, type SyntheticEvent } from "react";

const previewError = "预览加载失败，请检查用户名、仓库名或稍后重试。";

export function useImagePreview(src: string) {
  const [loading, setLoading] = useState(Boolean(src));
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const imageRef = useRef<HTMLImageElement | null>(null);

  useLayoutEffect(() => {
    // 缓存图片可能在 effect 前已经加载；以真实节点状态为准，避免重新开启动画。
    const image = imageRef.current;
    setLoading(Boolean(src) && !image?.complete);
    setError(src && image?.complete && image.naturalWidth === 0 ? previewError : "");
  }, [src, attempt]);

  return {
    loading,
    error,
    retry: () => {
      if (!src) return;
      setAttempt((current) => current + 1);
    },
    imageKey: `${src}:${attempt}`,
    imageProps: {
      ref: imageRef,
      src,
      onLoad: (event: SyntheticEvent<HTMLImageElement>) => {
        // 同一地址的重试也会换节点，旧请求的事件不能结束新请求的加载。
        if (event.currentTarget !== imageRef.current) return;
        setLoading(false);
        setError("");
      },
      onError: (event: SyntheticEvent<HTMLImageElement>) => {
        if (event.currentTarget !== imageRef.current) return;
        setLoading(false);
        setError(previewError);
      },
    },
  };
}
