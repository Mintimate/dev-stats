import type { ShareData } from "./types";

function drawRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fill?: string,
  stroke?: string,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y + height - r, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number,
) {
  const chars = Array.from(String(text || ""));
  let line = "";
  let lines = 0;
  for (const char of chars) {
    const test = line + char;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines += 1;
      if (lines >= maxLines) {
        ctx.fillText(`${line.slice(0, Math.max(0, line.length - 1))}...`, x, y);
        return y + lineHeight;
      }
      ctx.fillText(line, x, y);
      line = char;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

function dataUrlToBlob(dataUrl: string) {
  const parts = dataUrl.split(";base64,");
  const contentType = parts[0].split(":")[1];
  const raw = window.atob(parts[1]);
  const rawLength = raw.length;
  const bytes = new Uint8Array(rawLength);
  for (let index = 0; index < rawLength; index += 1) bytes[index] = raw.charCodeAt(index);
  return new Blob([bytes], { type: contentType });
}

async function loadImage(url: string) {
  if (!url || url.endsWith("favicon.svg")) return null;
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

async function loadLogoImage() {
  try {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.src = "/favicon.svg";
    await image.decode();
    return image;
  } catch {
    return null;
  }
}

function drawClippedImage(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  size: number,
  radius: number,
) {
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + size, y, x + size, y + size, radius);
  ctx.arcTo(x + size, y + size, x, y + size, radius);
  ctx.arcTo(x, y + size, x, y, radius);
  ctx.arcTo(x, y, x + size, y, radius);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(image, x, y, size, size);
  ctx.restore();
}

function drawPlatformBadge(ctx: CanvasRenderingContext2D, data: ShareData, x: number, y: number) {
  const isCnb = data.platformKey === "cnb";
  const label = isCnb ? "CNB" : "GitHub";
  const fill = isCnb ? "#f76945" : "#24292f";
  const color = "#ffffff";
  const badgeW = isCnb ? 72 : 96;
  drawRoundRect(ctx, x, y, badgeW, 24, 12, fill);
  ctx.fillStyle = color;
  ctx.font = "900 11px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(label, x + badgeW / 2, y + 15);
  ctx.textAlign = "left";
}

function drawRepoList(ctx: CanvasRenderingContext2D, data: ShareData, x: number, y: number, width: number) {
  drawRoundRect(ctx, x, y, width, 250, 14, "#f8fafc", "#e2e8f0");
  ctx.fillStyle = "#0f172a";
  ctx.font = "900 14px system-ui, sans-serif";
  ctx.fillText("代表项目", x + 16, y + 28);
  ctx.fillStyle = "#64748b";
  ctx.font = "700 11px ui-monospace, Menlo, monospace";
  ctx.fillText("STARRED / CONTRIBUTED", x + 16, y + 46);

  let rowY = y + 72;
  data.repos.slice(0, 5).forEach((repo) => {
    drawRoundRect(ctx, x + 12, rowY - 20, width - 24, 34, 8, "#ffffff", "#e2e8f0");
    ctx.fillStyle = "#0f172a";
    ctx.font = "900 12px ui-monospace, Menlo, monospace";
    const name = repo.name.length > 34 ? `${repo.name.slice(0, 33)}...` : repo.name;
    ctx.fillText(name, x + 24, rowY + 1);
    ctx.textAlign = "right";
    ctx.fillStyle = "#64748b";
    ctx.font = "800 11px ui-monospace, Menlo, monospace";
    ctx.fillText(repo.meta, x + width - 24, rowY + 1);
    ctx.textAlign = "left";
    rowY += 38;
  });
}


export async function createShareImage(data: ShareData) {
  const avatar = await loadImage(data.avatarUrl);
  const logo = await loadLogoImage();
  const scale = 2;
  const width = 1600;
  const height = 1120;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas is not available.");
  const context: CanvasRenderingContext2D = ctx;
  context.scale(scale, scale);

  context.fillStyle = "#f1f5f9";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "rgba(148, 163, 184, 0.22)";
  for (let x = 20; x < width; x += 28) {
    for (let y = 20; y < height; y += 28) {
      context.beginPath();
      context.arc(x, y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  const cardX = 60;
  const cardY = 60;
  const cardW = width - cardX * 2;
  const cardH = height - cardY * 2;
  drawRoundRect(context, cardX, cardY, cardW, cardH, 24, "#ffffff", "#e2e8f0");

  context.fillStyle = "#e2e8f0";
  context.fillRect(cardX + 24, cardY + 130 - 1, cardW - 48, 1);
  if (logo) {
    drawClippedImage(context, logo, cardX + 40, cardY + 38, 54, 12);
  } else {
    drawRoundRect(context, cardX + 40, cardY + 38, 54, 54, 14, "#ecfdf5", "#059669");
    context.fillStyle = "#059669";
    context.font = "900 16px ui-monospace, Menlo, monospace";
    context.textAlign = "center";
    context.fillText("GS", cardX + 67, cardY + 73);
    context.textAlign = "left";
  }

  context.fillStyle = "#0f172a";
  context.font = "900 30px system-ui, sans-serif";
  context.fillText("开发者画像报告", cardX + 114, cardY + 70);
  context.fillStyle = "#64748b";
  context.font = "700 13px ui-monospace, Menlo, monospace";
  context.fillText(`PROFILE INSIGHT REPORT · @${data.username}`, cardX + 114, cardY + 98);

  const scoreX = cardX + cardW - 220;
  drawRoundRect(context, scoreX, cardY + 30, 180, 80, 16, "#ecfdf5", "#059669");
  context.textAlign = "center";
  context.fillStyle = "#059669";
  context.font = "900 44px ui-monospace, Menlo, monospace";
  context.fillText(data.score, scoreX + 90, cardY + 80);
  context.fillStyle = "#047857";
  context.font = "800 13px ui-monospace, Menlo, monospace";
  context.fillText(`${data.level} / 100`, scoreX + 90, cardY + 102);
  context.textAlign = "left";

  const leftX = cardX + 40;
  const contentY = cardY + 150;
  const leftW = 420;
  const avatarSize = 96;
  drawRoundRect(context, leftX, contentY, avatarSize, avatarSize, 18, "#ecfdf5", "#059669");
  if (avatar) {
    drawClippedImage(context, avatar, leftX, contentY, avatarSize, 18);
    context.lineWidth = 2;
    drawRoundRect(context, leftX, contentY, avatarSize, avatarSize, 18, undefined, "#059669");
  } else {
    context.fillStyle = "#059669";
    context.font = "900 24px system-ui, sans-serif";
    context.textAlign = "center";
    context.fillText(
      data.displayName.trim().slice(0, 2).toUpperCase() || "GS",
      leftX + avatarSize / 2,
      contentY + 58,
    );
    context.textAlign = "left";
  }

  let y = contentY + 142;
  context.fillStyle = "#0f172a";
  context.font = "900 26px system-ui, sans-serif";
  y = drawWrappedText(context, data.displayName, leftX, y, leftW, 32, 1) + 18;
  context.fillStyle = "#64748b";
  context.font = "800 14px ui-monospace, Menlo, monospace";
  y = drawWrappedText(context, data.handle, leftX, y, leftW, 20, 1) + 20;
  context.fillStyle = "#475569";
  context.font = "16px system-ui, sans-serif";
  y = drawWrappedText(context, data.bio, leftX, y, leftW, 24, 3) + 18;

  context.font = "900 12px system-ui, sans-serif";
  let badgeX = leftX;
  data.badges.slice(0, 5).forEach((badge) => {
    const label = String(badge).slice(0, 18);
    const pillW = Math.min(140, context.measureText(label).width + 22);
    if (badgeX + pillW > leftX + leftW) {
      badgeX = leftX;
      y += 32;
    }
    drawRoundRect(context, badgeX, y, pillW, 28, 14, "#f1f5f9", "#e2e8f0");
    context.fillStyle = "#0f172a";
    context.fillText(label, badgeX + 11, y + 18);
    badgeX += pillW + 8;
  });

  drawRepoList(context, data, leftX, Math.max(y + 58, contentY + 390), leftW);

  const rightX = leftX + leftW + 50;
  context.fillStyle = "#e2e8f0";
  context.fillRect(leftX + leftW + 24, contentY, 1, 740);
  const blockW = cardW - (rightX - cardX) - 40;
  let blockY = contentY;

  function block(title: string, subtitle: string, body: string, bar: string, titleColor: string) {
    const blockH = 202;
    drawRoundRect(context, rightX, blockY, blockW, blockH, 16, "#ffffff", "#e2e8f0");
    context.fillStyle = bar;
    context.fillRect(rightX + 1, blockY + 1, blockW - 2, 46);
    context.fillStyle = titleColor;
    context.font = "900 13px ui-monospace, Menlo, monospace";
    context.fillText(title, rightX + 24, blockY + 30);
    context.fillStyle = "#0f172a";
    context.font = "900 20px system-ui, sans-serif";
    context.fillText(subtitle, rightX + 24, blockY + 72);
    context.fillStyle = "#334155";
    context.font = "16px system-ui, sans-serif";
    drawWrappedText(context, body, rightX + 24, blockY + 104, blockW - 48, 25, 4);
    blockY += blockH + 24;
  }

  block("客观评价", "把优点和破绽都摊开", data.objective, "#f8fafc", "#059669");
  block("毒舌吐槽", "精准开麦，不讲客套", data.roast, "#fef2f2", "#ef4444");
  block("核心人设", "一言以蔽之", data.promo, "#f0fdf4", "#15803d");

  context.fillStyle = "#e2e8f0";
  context.fillRect(cardX + 24, cardY + cardH - 45, cardW - 48, 1);
  context.fillStyle = "#0f172a";
  context.font = "900 15px system-ui, sans-serif";
  context.fillText("README 统计工坊", leftX, cardY + cardH - 22);
  drawPlatformBadge(context, data, leftX + 150, cardY + cardH - 38);
  context.textAlign = "right";
  context.fillStyle = "#059669";
  context.font = "900 13px ui-monospace, Menlo, monospace";
  context.fillText(data.host, cardX + cardW - 40, cardY + cardH - 22);

  return canvas.toDataURL("image/png");
}

export function shareObjectUrl(dataUrl: string) {
  return URL.createObjectURL(dataUrlToBlob(dataUrl));
}
