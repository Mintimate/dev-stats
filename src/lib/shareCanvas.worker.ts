import { drawScene } from "./shareDraw";
import type { ShareData } from "./types";

const workerSelf = self as unknown as {
  onmessage: ((ev: MessageEvent) => void) | null;
  postMessage: (message: unknown, transfer?: Transferable[]) => void;
};

workerSelf.onmessage = async (event: MessageEvent) => {
  const payload = event.data as {
    id: number;
    data: ShareData;
    avatar: ImageBitmap | null;
    logo: ImageBitmap | null;
    qr: ImageBitmap | null;
  };
  const { id, data, avatar, logo, qr } = payload;
  try {
    const scale = 2;
    const width = 1600;
    const height = 1120;
    const canvas = new OffscreenCanvas(width * scale, height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available.");
    drawScene(ctx, data, avatar, logo, qr, scale);
    avatar?.close?.();
    logo?.close?.();
    qr?.close?.();
    const blob = await canvas.convertToBlob({ type: "image/png" });
    const buffer = await blob.arrayBuffer();
    workerSelf.postMessage({ id, ab: buffer }, [buffer]);
  } catch (err) {
    workerSelf.postMessage({
      id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
};
