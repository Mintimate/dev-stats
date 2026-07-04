import type { ShareData } from "./types";
import { toCanvas } from "qrcode";
import { drawScene } from "./shareDraw";

async function loadBitmap(url: string): Promise<ImageBitmap | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) return null;
    const blob = await res.blob();
    return await createImageBitmap(blob);
  } catch {
    return null;
  }
}

async function loadQrBitmap(data: ShareData): Promise<ImageBitmap | null> {
  try {
    const qrUrl = window.location.origin || `https://${data.host}`;
    const canvas = await toCanvas(qrUrl, {
      margin: 1,
      width: 128,
      // 卡片背景元素较多、二维码尺寸偏小，提高纠错等级（Q ≈ 25% 冗余）保证扫码成功率。
      errorCorrectionLevel: "Q",
      color: { dark: "#0f172a", light: "#ffffff" },
    });
    return await createImageBitmap(canvas);
  } catch (err) {
    console.error("Failed to generate QR code", err);
    return null;
  }
}

let worker: Worker | null = null;
let reqId = 0;
const pending = new Map<number, { resolve: (ab: ArrayBuffer) => void; reject: (err: Error) => void }>();

function getWorker(): Worker | null {
  if (worker) return worker;
  // 无 OffscreenCanvas 支持（如旧版 Safari）时回退到主线程渲染。
  if (typeof OffscreenCanvas === "undefined") return null;
  worker = new Worker(new URL("./shareCanvas.worker.ts", import.meta.url), { type: "module" });
  worker.onmessage = (ev: MessageEvent) => {
    const m = ev.data as { id: number; ab?: ArrayBuffer; error?: string };
    const entry = pending.get(m.id);
    if (!entry) return;
    pending.delete(m.id);
    if (m.error) entry.reject(new Error(m.error));
    else entry.resolve(m.ab!);
  };
  worker.onerror = (ev) => {
    for (const entry of pending.values()) entry.reject(new Error(ev.message || "Worker error"));
    pending.clear();
  };
  return worker;
}

export async function createShareImage(data: ShareData): Promise<string> {
  // 主线程并发加载三个资源为 ImageBitmap，再整体转移进 Worker。
  const [avatar, logo, qr] = await Promise.all([
    loadBitmap(data.avatarUrl),
    loadBitmap("/favicon.svg"),
    loadQrBitmap(data),
  ]);

  const w = getWorker();
  if (w) {
    const id = ++reqId;
    const promise = new Promise<ArrayBuffer>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    const transfer: Transferable[] = [];
    if (avatar) transfer.push(avatar);
    if (logo) transfer.push(logo);
    if (qr) transfer.push(qr);
    w.postMessage({ id, data, avatar, logo, qr }, transfer);
    const ab = await promise;
    const blob = new Blob([ab], { type: "image/png" });
    return URL.createObjectURL(blob);
  }

  // 回退：无 Worker 时在主线程同步绘制并异步编码。
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = 1600 * scale;
  canvas.height = 1120 * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  drawScene(ctx, data, avatar, logo, qr, scale);
  avatar?.close?.();
  logo?.close?.();
  qr?.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Failed to encode image.");
  return URL.createObjectURL(blob);
}
