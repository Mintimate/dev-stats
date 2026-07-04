import { useEffect, useState } from "react";

export function useImagePreview(src: string) {
  const [loading, setLoading] = useState(Boolean(src));

  useEffect(() => {
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
      onLoad: () => setLoading(false),
      onError: () => setLoading(false),
    },
  };
}
