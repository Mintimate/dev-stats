function escapeHtml(value: string) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function isSafeUrl(url: string) {
  const trimmed = String(url || "").trim();
  // 只允许 http(s) / mailto / 相对路径 / 锚点，阻止 javascript: / data: 等危险协议。
  return /^(https?:\/\/|mailto:|\/|#|\.\/|\.\.\/)/i.test(trimmed);
}

function resolveRelativeUrl(url: string, platform?: string, username?: string): string {
  const trimmed = String(url || "").trim();
  if (!platform || !username) return trimmed;
  // 仅放行 http(s) 与锚点；data:/javascript: 等危险协议交给 isSafeUrl 统一把关。
  if (/^(https?:\/\/|mailto:|#)/i.test(trimmed)) {
    return trimmed;
  }
  if (/^\/?api(\/|\?|$)/i.test(trimmed)) {
    return trimmed.startsWith("/") ? trimmed : "/" + trimmed;
  }

  // 相对路径：拼接到平台 raw 域名。剥离前导 ./ 并防止路径穿越（../）。
  const cleanPath = trimmed.replace(/^\.?\//, "").replace(/^(?:\.\.\/)+/, "");
  const safeUser = encodeURIComponent(username);
  if (platform === "cnb") {
    return `https://cnb.cool/${safeUser}/${safeUser}/-/raw/main/${cleanPath}`;
  } else {
    return `https://raw.githubusercontent.com/${safeUser}/${safeUser}/main/${cleanPath}`;
  }
}

function inlineMarkdown(value: string, platform?: string, username?: string) {
  // Old cache entries may predate server-side sanitization. Escape raw HTML here
  // as well before the output reaches dangerouslySetInnerHTML.
  const escaped = escapeHtml(value);
  return escaped
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
      const resolvedUrl = resolveRelativeUrl(url, platform, username);
      return isSafeUrl(resolvedUrl) ? `<img alt="${alt}" src="${resolvedUrl}" />` : m;
    })
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (m, text, url) => {
      const resolvedUrl = resolveRelativeUrl(url, platform, username);
      return isSafeUrl(resolvedUrl) ? `<a href="${resolvedUrl}" target="_blank" rel="noopener">${text}</a>` : m;
    })
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s([{"'“])\*([^*\n]+?)\*(?=$|[\s)\]}.,!?:;"'”])/g, "$1<em>$2</em>");
}

function stripHtmlCommentsFromLine(line: string, inComment: boolean) {
  let remaining = line;
  let output = "";

  while (remaining) {
    if (inComment) {
      const endIndex = remaining.indexOf("-->");
      if (endIndex === -1) {
        return { line: output, inComment: true };
      }
      remaining = remaining.slice(endIndex + 3);
      inComment = false;
      continue;
    }

    const startIndex = remaining.indexOf("<!--");
    if (startIndex === -1) {
      output += remaining;
      break;
    }

    output += remaining.slice(0, startIndex);
    remaining = remaining.slice(startIndex + 4);
    inComment = true;
  }

  return { line: output, inComment };
}


function isMarkdownTableLine(line: string) {
  const text = String(line || "").trim();
  return text.includes("|") && text.split("|").length >= 3;
}

/**
 * 将 Markdown 表格行解析并渲染为 <table> HTML。
 * 支持：表头、分隔行、普通数据行、行内 inlineMarkdown。
 */
function renderMarkdownTable(tableLines: string[], platform?: string, username?: string): string {
  const rows: string[][] = tableLines.map((line) => {
    const parts = line.trim().split("|");
    // 兼容 "| a | b |"（首尾空段）与 "a | b"（无首尾分隔）两种写法。
    if (parts.length > 0 && parts[0].trim() === "") parts.shift();
    if (parts.length > 0 && parts[parts.length - 1].trim() === "") parts.pop();
    return parts.map((cell) => cell.trim());
  });

  if (!rows[0] || rows[0].length === 0) return "";

  // 找到分隔行索引（通常在第一行之后）
  let separatorIdx = -1;
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].every((cell) => /^:?-+:?$/.test(cell))) {
      separatorIdx = i;
      break;
    }
  }

  // 如果没有标准分隔行但所有行列数一致，也当作表格渲染
  const hasHeader = separatorIdx > 0;

  const headerRow = rows[0];
  const dataRows = hasHeader ? rows.slice(separatorIdx + 1) : rows.slice(1);

  const tr = (cells: string[], isHeader: boolean): string =>
    `<tr>${cells.map((c) => isHeader ? `<th>${inlineMarkdown(c, platform, username)}</th>` : `<td>${inlineMarkdown(c, platform, username)}</td>`).join("")}</tr>`;

  return (
    `<table class="md-table"><thead>${tr(headerRow, true)}</thead><tbody>${dataRows.map((r) => tr(r, false)).join("")}</tbody></table>`
  );
}

export function renderMarkdown(markdown: string, platform?: string, username?: string) {
  const lines = String(markdown || "").split(/\r?\n/);
  const html: string[] = [];
  let inCode = false;
  let listOpen = false;
  let inHtmlComment = false;

  for (let index = 0; index < lines.length; index += 1) {
    let line = lines[index];
    if (line.startsWith("```")) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(inCode ? "</code></pre>" : "<pre><code>");
      inCode = !inCode;
      continue;
    }
    if (inCode) {
      html.push(`${escapeHtml(line)}\n`);
      continue;
    }

    const uncommented = stripHtmlCommentsFromLine(line, inHtmlComment);
    line = uncommented.line;
    inHtmlComment = uncommented.inComment;
    if (!line.trim()) continue;

    if (isMarkdownTableLine(line)) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      const tableLines = [line];
      while (index + 1 < lines.length && isMarkdownTableLine(lines[index + 1])) {
        index += 1;
        tableLines.push(lines[index]);
      }
      html.push(renderMarkdownTable(tableLines, platform, username));
      continue;
    }
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push(`<blockquote>${quote[1].trim() ? `<p>${inlineMarkdown(quote[1], platform, username)}</p>` : ""}</blockquote>`);
      continue;
    }
    const horizontalRule = line.match(/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/);
    if (horizontalRule) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      html.push("<hr />");
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (listOpen) {
        html.push("</ul>");
        listOpen = false;
      }
      const level = Math.min(heading[1].length, 3);
      html.push(`<h${level}>${inlineMarkdown(heading[2], platform, username)}</h${level}>`);
      continue;
    }
    const list = line.match(/^\s*[-*]\s+(.+)$/);
    if (list) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(list[1], platform, username)}</li>`);
      continue;
    }
    if (listOpen) {
      html.push("</ul>");
      listOpen = false;
    }
    if (!line.trim()) continue;
    html.push(`<p>${inlineMarkdown(line, platform, username)}</p>`);
  }

  if (listOpen) html.push("</ul>");
  if (inCode) html.push("</code></pre>");
  return html.join("");
}

export function compactSummary(text: string) {
  return String(text || "").replace(/\s+/g, " ").trim().slice(0, 220);
}
