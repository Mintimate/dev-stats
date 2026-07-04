import type { ShareData } from "./types";

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

function drawRoundRect(
  ctx: Ctx2D,
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
  ctx: Ctx2D,
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

function drawClippedImage(
  ctx: Ctx2D,
  image: CanvasImageSource,
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

/**
 * 在二维码外围绘制取景框风格的四角装饰，呼应卡片整体的科技感视觉语言。
 */
function drawQrFrame(
  ctx: Ctx2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
) {
  const len = 10;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y + len);
  ctx.lineTo(x, y);
  ctx.lineTo(x + len, y);
  ctx.moveTo(x + width - len, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + len);
  ctx.moveTo(x + width, y + height - len);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - len, y + height);
  ctx.moveTo(x + len, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + height - len);
  ctx.stroke();
  ctx.restore();
}

function drawPlatformBadge(ctx: Ctx2D, data: ShareData, x: number, y: number) {
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

function drawAbstractWaves(
  ctx: Ctx2D,
  width: number,
  height: number,
  color: string,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;

  // Wave 1
  ctx.beginPath();
  ctx.moveTo(0, height * 0.35);
  ctx.bezierCurveTo(
    width * 0.25,
    height * 0.15,
    width * 0.55,
    height * 0.65,
    width,
    height * 0.45,
  );
  ctx.stroke();

  // Wave 2
  ctx.beginPath();
  ctx.moveTo(0, height * 0.55);
  ctx.bezierCurveTo(
    width * 0.35,
    height * 0.75,
    width * 0.65,
    height * 0.35,
    width,
    height * 0.65,
  );
  ctx.stroke();

  // Wave 3
  ctx.beginPath();
  ctx.moveTo(0, height * 0.75);
  ctx.bezierCurveTo(
    width * 0.2,
    height * 0.55,
    width * 0.5,
    height * 0.95,
    width,
    height * 0.85,
  );
  ctx.stroke();

  ctx.restore();
}

function drawRepoList(ctx: Ctx2D, data: ShareData, x: number, y: number, width: number) {
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

/**
 * 纯绘制逻辑，无 DOM/网络依赖，可在主线程与 Worker 中共用。
 * avatar/logo/qr 为已加载好的位图（ImageBitmap 或 HTMLImageElement）。
 */
export function drawScene(
  context: Ctx2D,
  data: ShareData,
  avatar: CanvasImageSource | null,
  logo: CanvasImageSource | null,
  qr: CanvasImageSource | null,
  scale: number,
) {
  context.scale(scale, scale);
  const width = 1600;
  const height = 1120;

  const isCnb = data.platformKey === "cnb";

  // Base theme definitions for the canvas outer background shading only
  const bgTheme = {
    bgStart: isCnb ? "#fffaf5" : "#f4fbf7",
    bgMid: isCnb ? "#ffebd8" : "#e8f7ee",
    bgEnd: isCnb ? "#fff7ed" : "#f0fdf4",
    glow1: isCnb ? "rgba(251, 146, 60, 0.15)" : "rgba(52, 211, 153, 0.15)",
    glow2: isCnb ? "rgba(249, 115, 22, 0.1)" : "rgba(16, 185, 129, 0.1)",
    dotColor: isCnb ? "rgba(249, 115, 22, 0.15)" : "rgba(34, 197, 94, 0.15)",
    waveColor: isCnb ? "rgba(249, 115, 22, 0.08)" : "rgba(34, 197, 94, 0.08)",
  };

  // 1. Base gradient background
  const bgGrad = context.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, bgTheme.bgStart);
  bgGrad.addColorStop(0.5, bgTheme.bgMid);
  bgGrad.addColorStop(1, bgTheme.bgEnd);
  context.fillStyle = bgGrad;
  context.fillRect(0, 0, width, height);

  // 2. Corner glows
  const radial1 = context.createRadialGradient(width * 0.85, height * 0.15, 50, width * 0.85, height * 0.15, 600);
  radial1.addColorStop(0, bgTheme.glow1);
  radial1.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = radial1;
  context.fillRect(0, 0, width, height);

  const radial2 = context.createRadialGradient(width * 0.15, height * 0.85, 50, width * 0.15, height * 0.85, 600);
  radial2.addColorStop(0, bgTheme.glow2);
  radial2.addColorStop(1, "rgba(255, 255, 255, 0)");
  context.fillStyle = radial2;
  context.fillRect(0, 0, width, height);

  // 3. Tech wave curves
  drawAbstractWaves(context, width, height, bgTheme.waveColor);

  // 4. Dot grid pattern
  context.fillStyle = bgTheme.dotColor;
  for (let x = 20; x < width; x += 28) {
    for (let y = 20; y < height; y += 28) {
      context.beginPath();
      context.arc(x, y, 1.1, 0, Math.PI * 2);
      context.fill();
    }
  }

  const cardX = 24;
  const cardY = 24;
  const cardW = width - cardX * 2;
  const cardH = height - cardY * 2;
  drawRoundRect(context, cardX, cardY, cardW, cardH, 24, "#ffffff", "#e2e8f0");

  context.fillStyle = "#e2e8f0";
  context.fillRect(cardX + 24, cardY + 130 - 1, cardW - 48, 1);
  if (logo) {
    drawClippedImage(context, logo, cardX + 40, cardY + 38, 54, 14);
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

  // Draw giant faded brand watermark on top of the card panels
  const watermarkSize = 580;
  const watermarkX = cardX + cardW - 620;
  const watermarkY = cardY + cardH - 640;

  if (isCnb) {
    context.save();
    context.translate(watermarkX, watermarkY);
    context.scale(watermarkSize / 320, watermarkSize / 320);
    // Draw the CNB official logo as a giant watermark in the background of the card
    context.fillStyle = "rgba(255, 98, 0, 0.08)"; // official CNB orange (#FF6200) at 8% opacity
    const cnbPaths = [
      "M228.906 40.2412C229.882 37.5108 228.906 34.3903 226.759 32.44C219.342 26.004 200.799 12.3519 173.082 10.4016C141.852 8.06121 122.528 16.4475 112.769 22.6885C108.474 25.4189 108.279 31.4649 112.183 34.3903L191.625 96.2149C198.652 101.676 208.997 98.5553 211.729 90.169L228.711 40.2412H228.906Z",
      "M32.9381 223.564C29.6199 225.71 28.2536 229.805 29.2295 233.511C32.1573 244.432 41.3312 266.861 66.9009 287.534C92.4706 308.012 122.725 310.353 135.607 309.963C139.511 309.963 142.829 307.427 144 303.722L194.945 142.627C198.653 130.925 185.576 121.173 175.426 127.999L32.9381 223.564Z",
      "M70.2169 53.4955C67.6794 52.5203 64.9468 52.7153 62.6045 53.8855C53.2355 58.9563 29.032 74.7538 16.54 107.324C6.78054 132.288 10.0987 159.982 12.8314 173.439C13.6121 177.925 18.2967 180.46 22.5908 178.705L175.424 119.026C186.354 114.735 186.354 99.3276 175.424 95.0369L70.2169 53.4955Z",
      "M297.03 168.968C301.519 171.893 307.57 169.358 308.351 164.092C310.303 150.05 312.06 125.866 304.057 107.338C293.321 82.9591 274.974 67.7468 266.19 61.7008C263.458 59.7505 259.749 59.9456 257.212 62.2859L218.564 96.4162C212.318 102.072 212.904 112.019 219.931 116.699L297.03 168.968Z",
      "M189.089 299.428C188.699 303.914 192.603 307.814 197.092 307.229C211.731 305.669 241.79 299.818 264.237 278.365C286.098 257.496 293.32 232.728 295.272 222.781C295.858 220.051 295.272 217.32 293.515 215.175L225.98 131.897C218.758 122.925 204.119 127.411 203.143 138.918L189.089 299.233V299.428Z"
    ];
    cnbPaths.forEach(pathStr => {
      context.fill(new Path2D(pathStr));
    });
    context.restore();
  } else {
    context.save();
    context.translate(watermarkX, watermarkY);
    context.scale(watermarkSize / 16, watermarkSize / 16);
    // Draw the GitHub Octocat logo as a giant watermark in the background of the card
    context.fillStyle = "rgba(34, 197, 94, 0.08)"; // visible but faint green overlay
    context.fill(
      new Path2D(
        "M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"
      )
    );
    context.restore();
  }

  context.fillStyle = "#e2e8f0";
  context.fillRect(cardX + 24, cardY + cardH - 80, cardW - 48, 1);
  context.fillStyle = "#0f172a";
  context.font = "900 15px system-ui, sans-serif";
  context.fillText("DevStats 统计工坊", leftX, cardY + cardH - 34);
  drawPlatformBadge(context, data, leftX + 150, cardY + cardH - 52);
  context.textAlign = "right";
  context.fillStyle = "#059669";
  context.font = "900 13px ui-monospace, Menlo, monospace";
  if (qr) {
    const qrSize = 64;
    const qrPad = 6;
    const qrX = cardX + cardW - 40 - qrSize;
    const qrY = cardY + cardH - 72;
    const accent = isCnb ? "#f76945" : "#059669";

    // 白底装饰卡片 + 四角取景框，让二维码在密集背景中更醒目、也更易识别扫描区域。
    drawRoundRect(
      context,
      qrX - qrPad,
      qrY - qrPad,
      qrSize + qrPad * 2,
      qrSize + qrPad * 2,
      12,
      "#ffffff",
      "#e2e8f0",
    );
    context.drawImage(qr, qrX, qrY, qrSize, qrSize);
    drawQrFrame(context, qrX - qrPad, qrY - qrPad, qrSize + qrPad * 2, qrSize + qrPad * 2, accent);

    // drawRoundRect 会把 fillStyle 改成白色画背景框，这里必须重新设置颜色，否则网址文字会被画成白色而“隐形”。
    context.fillStyle = "#059669";
    context.font = "900 13px ui-monospace, Menlo, monospace";
    context.fillText(data.host, qrX - qrPad - 12, cardY + cardH - 46);

    const slogans = [
      "扫码测测你的 README 是不是门面工程",
      "扫码看看 AI 怎么吐槽你的代码",
      "扫码生成你的「毒舌」开发者报告",
      "扫码测测你的 Bug 制造力评级",
      "扫码认领你的开发者「毒舌」画像",
      "扫码看看你的头发还在不在",
      "扫码开启你的代码人生吐槽"
    ];
    const slogan = slogans[Math.floor(Math.random() * slogans.length)];
    context.fillStyle = "#64748b";
    context.font = "500 11px system-ui, sans-serif";
    context.fillText(slogan, qrX - qrPad - 12, cardY + cardH - 24);
  } else {
    context.fillText(data.host, cardX + cardW - 40, cardY + cardH - 35);
  }
}
