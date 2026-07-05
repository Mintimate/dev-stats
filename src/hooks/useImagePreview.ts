import { useEffect, useRef, useState } from "react";

export function useImagePreview(src: string) {
  const [loading, setLoading] = useState(Boolean(src));
  // 跟踪当前 src，避免旧图片的 onLoad/onError 回调覆盖新图片的 loading 状态。
  const srcRef = useRef(src);

  useEffect(() => {
    srcRef.current = src;
    if (!src) {
      setLoading(false);
      return;
    }
    setLoading(true);
  }, [src]);

  return {
    loading,
    imageProps: {
      src,
      onLoad: () => {
        if (srcRef.current === src) setLoading(false);
      },
      onError: () => {
        if (srcRef.current === src) setLoading(false);
      },
    },
  };
}
