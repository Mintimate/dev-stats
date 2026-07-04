package handler

import (
	"fmt"
	"html"
	"net/http"
)

func writeHomePage(w http.ResponseWriter, r *http.Request) {
	baseURL := "https://" + r.Host
	if proto := r.Header.Get("X-Forwarded-Proto"); proto != "" {
		baseURL = proto + "://" + r.Host
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "public, max-age=0, must-revalidate")
	_, _ = fmt.Fprintf(w, `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GitHub Readme Stats · EdgeOne</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <style>
    body{margin:0;background:#f7f8fb;color:#172033;font-family:Inter,"Segoe UI","PingFang SC",system-ui,sans-serif}
    main{width:min(1040px,calc(100%% - 32px));margin:0 auto;padding:42px 0}
    header{border-bottom:1px solid #d9dee8;padding-bottom:24px}
    h1{margin:0;font-size:clamp(30px,5vw,48px);line-height:1.08}
    p{color:#667085;line-height:1.7}
    .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.9fr);gap:24px;margin-top:26px}
    section,aside{background:#fff;border:1px solid #d9dee8;border-radius:8px;padding:22px}
    a.endpoint{display:grid;grid-template-columns:auto 1fr;gap:12px;margin-top:10px;padding:12px;border:1px solid #d9dee8;border-radius:8px;color:inherit;text-decoration:none}
    .method{align-self:start;border-radius:6px;background:#e8f2ff;color:#1677ff;padding:5px 8px;font-size:12px;font-weight:800}
    code,.path{font-family:"SFMono-Regular",Consolas,monospace}
    .hint{display:block;margin-top:4px;color:#667085;font-size:12px;overflow-wrap:anywhere}
    img{display:block;width:100%%;max-width:495px;height:auto;margin-top:12px}
    footer{margin-top:24px;color:#667085}
    @media(max-width:820px){.grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main>
    <header>
      <h1>GitHub Readme Stats · EdgeOne</h1>
      <p>EdgeOne Pages Go Cloud Functions 版本，兼容常用 github-readme-stats 图片接口。</p>
    </header>
    <div class="grid">
      <section>
        <h2>可用接口</h2>
        <a class="endpoint" href="%[1]s/api?username=Mintimate&show_icons=true" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api</span><span class="hint">GitHub 统计卡</span></span></a>
        <a class="endpoint" href="%[1]s/api/top-langs?username=Mintimate&layout=compact" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/top-langs</span><span class="hint">语言占比卡</span></span></a>
        <a class="endpoint" href="%[1]s/api/pin?username=Mintimate&repo=dev-stats" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/pin</span><span class="hint">仓库卡片</span></span></a>
        <a class="endpoint" href="%[1]s/api/gist?id=bbfce31e0217a3689c8d961a356cb10d" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/gist</span><span class="hint">Gist 卡片</span></span></a>
        <a class="endpoint" href="%[1]s/api/wakatime?username=ffflabs&layout=compact" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/wakatime</span><span class="hint">WakaTime 统计</span></span></a>
        <a class="endpoint" href="%[1]s/api/streak?username=Mintimate" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/streak</span><span class="hint">连续贡献统计</span></span></a>
        <a class="endpoint" href="%[1]s/api/profile-summary?username=Mintimate" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/profile-summary</span><span class="hint">开发者资料概览</span></span></a>
        <a class="endpoint" href="%[1]s/api/contribution-calendar?username=Mintimate" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/contribution-calendar</span><span class="hint">贡献日历</span></span></a>
        <a class="endpoint" href="%[1]s/api/recent-activity?username=Mintimate" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/recent-activity</span><span class="hint">最近公开动态</span></span></a>
        <a class="endpoint" href="%[1]s/api/repo-languages?username=Mintimate&repo=dev-stats" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/repo-languages</span><span class="hint">仓库语言占比</span></span></a>
        <a class="endpoint" href="%[1]s/api/org?org=github" target="_blank" rel="noreferrer"><span class="method">GET</span><span><span class="path">/api/org</span><span class="hint">组织统计</span></span></a>
      </section>
      <aside>
        <h2>快速预览</h2>
        <img src="%[1]s/api?username=Mintimate&show_icons=true" alt="GitHub stats preview">
        <img src="%[1]s/api/top-langs?username=Mintimate&layout=compact" alt="Top languages preview">
        <p><code>![GitHub Stats](%[1]s/api?username=Mintimate&show_icons=true)</code></p>
      </aside>
    </div>
    <footer>Powered by EdgeOne Pages · <a href="https://github.com/Mintimate/dev-stats" target="_blank" rel="noreferrer">GitHub</a></footer>
  </main>
</body>
</html>`, html.EscapeString(baseURL))
}
