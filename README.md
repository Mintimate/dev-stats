# DevStats

[English](README_EN.md) | 简体中文

本项目基于 [anuraghazra/github-readme-stats](https://github.com/anuraghazra/github-readme-stats) 核心代码进行扩展，新增了 CNB 平台支持、**AI Stats Agent 智能评估助手**、开发者排行榜等功能，适配 [腾讯云 EdgeOne Makers](https://makers.edgeone.ai) 平台部署。

原项目采用 Vercel 平台部署，本版本适配 EdgeOne Makers Cloud Functions，采用 Go 运行时实现后端，同时提供基于 Node.js 的 AI Agent 云函数层，兼具丰富的 Web 前端交互与极低的响应延迟。AI Stats Agent 的开发者画像分析灵感同样来自 [hikariming/ghfind](https://github.com/hikariming/ghfind)。

## 项目简介

- **AI Stats Agent**：集成大语言模型，能自动分析你的开源贡献，生成带有客观评分的专属评价，支持流式对话与 README 智能生成
- **开发者发现排行榜**：自动收录被评估的开发者，展示分数排名、平台标识与能力雷达，随时与其他顶级开发者对决
- **动态统计卡片**：展示 GitHub 或 CNB 数据（如提交次数、PR、Star 等）
- **多平台数据源**：原生支持 GitHub，同时无缝集成 CNB 平台数据抓取与卡片渲染
- **全新 React 交互面板**：支持多款卡片同屏展示与一键配置，防抖自动刷新并实时生成 Markdown/HTML 代码
- **多种主题与布局**：完整适配原项目的各种卡片参数、主题与紧凑/默认布局切换
- **Go Cloud Functions 后端**：采用 Go 运行时处理卡片渲染，提供超低冷启动与极速响应；Agent 与排行榜业务采用 Node.js 云函数
- **兼容原项目 API**：与原项目保持相同的查询参数和使用方式

## 界面展示

![Dev Stats 网站](./docs/static/websiteIndex.webp)

分享卡片

![Dev Stats 分享卡片](./docs/static/cardShare.webp)

手动渲染 Stats 卡片:

![Dev Stats 手动渲染 Stats 卡片](./docs/static/makeStatsCardManually.webp)

## AI Stats Agent

AI Stats Agent 是本项目的核心亮点功能，基于大语言模型（LLM）构建，通过 EdgeOne Makers Node.js 云函数部署，提供开发者画像分析、README 自动生成和 Stats 卡片推荐等完整 AI 能力。

### 主要功能

#### 🤖 预设任务按钮驱动

Agent 面板采用**预设按钮**驱动，无需自由输入提示词。只需填入用户名并点击对应按钮，Agent 即会自动完成完整的分析链路，并通过 SSE（Server-Sent Events）实时流式展示运行纪要。

当前提供两个预设任务：

| 按钮 | 说明 |
|------|------|
| **生成主页 README** | 浏览主页、读取 Profile README，输出可直接复制的 Markdown 草稿 |
| **推荐卡片配方** | 分析公开资料，生成可应用到手动面板的 Stats 卡片方案 |

Agent 在执行过程中会依次调用以下工具：

| 工具 | 说明 |
|------|------|
| `browser_fetch` | 浏览用户主页，获取公开信号 |
| `inspect_github_user` | 拷打 GitHub 用户资料：仓库、语言、活跃度 |
| `inspect_cnb_user` | 拷打 CNB 用户资料：项目、组织、公开履历 |
| `fetch_github_profile_readme` | 读取 Profile README，参考用户自我介绍 |
| `compose_stats_recipe` | 生成个性化 Stats 卡片配方 |
| `compose_readme_draft` | 输出完整的 README Markdown 草稿 |

#### 📊 开发者评分体系

Agent 会基于公开数据对开发者进行多维度打分（每维度 1–20 分）：

| 维度 | 说明 |
|------|------|
| `maturity` | 账号成熟度与完整度 |
| `original_projects` | 原创项目质量与 Star 数 |
| `contributions` | PR、提交量与贡献深度 |
| `influence` | Star、Fork、Follower 影响力 |
| `activity` | 近期提交密度与活跃度 |
| `community` | 粉丝量与社区参与度 |

综合评分对应五档能力评级：

| 评级 | 分数范围 | 说明 |
|------|----------|------|
| 🔥 **夯** | 90–100 | 行业顶级影响力，核心技术突破 |
| ⭐ **顶流** | 80–89 | 明星开源项目领导者 |
| 💪 **高级** | 70–79 | 工程深度扎实，中等影响力 |
| 😐 **平庸** | 50–69 | 日常提交，缺乏旗舰作品 |
| 🌱 **入门** | 10–49 | 新手账号，多为 Fork 或 Demo |

#### 📝 README 智能生成

在"README 模式"下，Agent 会：

1. 获取现有 Profile README（GitHub 模式）
2. 分析仓库列表、语言分布、贡献历史
3. 撰写完整的个人介绍 Markdown（促销文案 + 客观评价 + 毒舌吐槽三段）
4. 推荐适合的 Stats 卡片组合并嵌入 README 中
5. 生成 `score`、`badges`、`dimension_scores` 等结构化画像数据

#### 🏆 开发者排行榜

每次 Agent 完成分析后，结果会自动写入 KV Blob 存储，并更新全局排行榜：

- 收录所有被评估的开发者（GitHub / CNB 双平台）
- 按综合得分降序排列，最多展示 Top 100
- 显示昵称、头像、分数、评级、标签
- 排行榜数据通过 `/agents/leaderboard` 接口提供，前端实时渲染

### Agent API 接口

| 接口 | 说明 |
|------|------|
| `POST /agents/chat` | 流式 SSE 对话，传入 `{ message, state, history }` |
| `GET /agents/chat?id=...` | 轮询会话结果（供非流式场景使用） |
| `POST /agents/stop` | 中断当前 Agent 运行 |
| `GET /agents/leaderboard` | 获取开发者排行榜 |
| `GET /agents/profile` | 获取指定用户的缓存分析结果 |

### Agent Skill 维护

`skills/dev-stats-agent/` 是 Agent 行为规范的唯一维护入口。平台路由、评分输出和 Stats 配方规则分别位于其 `references/` 目录；运行时代码由 `npm run sync:agent-skill` 生成到 `agents/chat/_skill.ts`，请勿直接修改生成文件。

```bash
npm run sync:agent-skill   # 修改 Skill 后同步运行时提示
npm run check:agent-skill  # 检查 Skill 与生成文件是否一致
```

`npm run dev` 和 `npm run build` 会自动同步，`npm run typecheck` 会拒绝未同步的 Skill 变更。更完整的仓库维护边界见 [`AGENTS.md`](./AGENTS.md)。

### 环境变量（Agent 功能）

Agent 功能需要额外配置大模型访问令牌：

| 变量名 | 说明 | 是否必须 |
|--------|------|----------|
| `OPENAI_API_KEY` | 大模型 API Key（支持 OpenAI 兼容接口） | ✅ Agent 功能必需 |
| `OPENAI_BASE_URL` | 自定义模型 API 地址（可接入国产模型） | 可选 |
| `OPENAI_MODEL` | 指定使用的模型名称 | 可选 |

## 快速开始

### 一键部署

您可以通过 [腾讯云 EdgeOne Makers](https://pages.edgeone.ai/zh) 一键部署。

直接点击此按钮一键部署：

[![使用 EdgeOne Makers 部署](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://console.cloud.tencent.com/edgeone/pages/new?repository-url=https%3A%2F%2Fgithub.com%2FMintimate%2Fdev-stats)

查看 [腾讯云 EdgeOne Makers 文档](https://pages.edgeone.ai/zh/document/product-introduction) 了解更多详情。

> **注意**：GitHub 数据源需要 `PAT_1`；CNB 公开数据源无需令牌。详见 [环境变量配置](#环境变量配置)。

### 手动部署

1. **Fork 本仓库**
2. **配置环境变量**（详见下方[环境变量配置](#环境变量配置)）
3. **部署到 EdgeOne Makers**：
   - 参考下方的详细部署步骤

## 环境变量配置

GitHub 数据源需要令牌，CNB 公开数据源无需令牌：

### 必需环境变量

- **`GITHUB_TOKEN`**：GitHub 个人访问令牌（Personal Access Token）
  - 用于调用 GitHub API 获取用户统计数据
  - 获取方式见下方 [获取 GitHub Token](#获取-github-tokenclassic)
  - 支持配置多个 token（`GITHUB_TOKEN_1`、`GITHUB_TOKEN_2` 等）以提高速率限制

### 可选环境变量

- **`CNB_API_TOKEN`**：CNB 访问令牌
  - 公开卡片通过 CNB 主站 Web JSON 接口读取，不要求令牌
  - 令牌仅作为未来受限 Open API 功能的后备，不会随主站公开请求发送
- 其他原项目环境变量: [原项目文档](https://github.com/anuraghazra/github-readme-stats#customization)。

### Agent 相关环境变量

使用 **AI Stats Agent** 功能时，还需配置大模型访问凭据：

- **`OPENAI_API_KEY`**：大模型 API Key（支持 OpenAI 兼容接口）✅ **Agent 功能必需**
- **`OPENAI_BASE_URL`**：自定义模型 API 地址，可接入国产模型或其他兼容服务（可选）
- **`OPENAI_MODEL`**：指定使用的模型名称（可选）

> **注意**：EdgeOne Makers 在部署后加载环境变量，每次更改环境变量后需要重新触发部署使变量生效。

## 缓存策略

本项目会在函数响应中返回 `Cache-Control`，并在 `edgeone.json` 中为主要卡片接口配置 Pages 缓存：

- `/api`：默认缓存 1 天
- `/api/top-langs`：默认缓存 6 天
- `/api/pin`：默认缓存 10 天
- `/api/gist`：默认缓存 2 天
- `/api/wakatime`：默认缓存 1 天
- `/api/streak`、`/api/contribution-calendar`：默认缓存 12 小时
- `/api/recent-activity`：默认缓存 1 小时
- `/api/profile-summary`、`/api/repo-languages`、`/api/org`：默认缓存 1 天

状态接口不会配置平台缓存，避免 PAT 状态、可用性检查等动态结果被长期缓存。高流量公开实例仍可在自定义域名前增加 EdgeOne CDN / Cloudflare 等 CDN 层，用于更细粒度的缓存命中、清理和观测。

例如：我使用 EdgeOne 的站点加速再次代理 EdgeOne Makers，可以获得额外的 CDN 缓存控制：

![配置回源站点为 EdgeOne Makers](./docs/static/CdnOriginToCdnConfig.webp)

对应的缓存规则:

![配置的回源规则](./docs/static/OriginRulesConfig.webp)

## 技术架构

本项目是一个全栈 Web 应用程序：
- **前端界面**：采用 React 构建，提供卡片预览、Stats Agent 对话、代码生成与全局排行榜。
- **Agent 与业务服务 (TS/Node.js)**：位于 `agents/` 目录，通过 EdgeOne Makers 部署为云端 API，处理 OpenAI / 大模型接口调用、SSE 流式响应与 KV 缓存/排行榜读写。内置受信任的头像代理，解决前端跨域限制。
- **卡片渲染引擎 (Go)**：位于 `cloud-functions/internal`，采用 Go 语言实现极速 SVG 渲染，完美兼容原项目参数，并适配 CNB 平台。

**Go 版渲染引擎当前覆盖的卡片接口：**

- `/api` - GitHub 统计卡片
- `/api/top-langs` - 语言占比卡片
- `/api/pin` - 仓库卡片
- `/api/gist` - Gist 卡片
- `/api/wakatime` - WakaTime 统计卡片
- `/api/streak` - 连续贡献统计卡片
- `/api/profile-summary` - 开发者资料概览卡片
- `/api/contribution-calendar` - 年度贡献日历卡片
- `/api/recent-activity` - 最近公开动态卡片
- `/api/repo-languages` - 指定仓库语言占比卡片
- `/api/org` - GitHub 组织统计卡片
- `/api/status/up` - PAT 可用性检查
- `/api/status/pat-info` - PAT 状态详情

Go Cloud Functions 是当前主实现，Node Functions 已移除。当前 Go 版本优先覆盖核心数据与 SVG 输出，常用主题、布局和展示参数会继续按原项目行为补齐。

### CNB 数据源

在普通卡片 URL 中加入 `platform=cnb` 即可切换到 CNB；不传该参数时仍使用 GitHub，原有链接无需修改。

```md
![CNB Stats](https://your-domain.example/api?platform=cnb&username=yourusername&show_icons=true)
![CNB Languages](https://your-domain.example/api/top-langs?platform=cnb&username=yourusername&layout=compact)
![CNB Repo](https://your-domain.example/api/pin?platform=cnb&username=yourusername&repo=group/repository)
```

CNB 当前支持 `/api`、`/api/top-langs`、`/api/pin`、`/api/streak`、`/api/profile-summary`、`/api/contribution-calendar`、`/api/recent-activity` 和 `/api/repo-languages`。Gist 与组织统计没有等价数据源，继续仅支持 GitHub。CNB 语言接口只提供主/次语言而非字节数，语言卡按仓库出现次数加权。

## 获取 GitHub Token（Classic）

1. 进入 [Account -> Settings -> Developer Settings -> Personal access tokens -> Tokens (classic)](https://github.com/settings/tokens)
2. 点击 `Generate new token -> Generate new token (classic)`
3. 勾选权限：
   - `repo`
   - `read:user`
4. 生成并复制 token（在 EdgeOne Makers 的环境变量中设置 `GITHUB_TOKEN` 等于这个 token 值）

## 部署到 EdgeOne Makers

1. 登录腾讯云 EdgeOne 控制台，创建新的 Pages 项目
2. 选择 GitHub 作为代码源并关联本仓库；或直接下载仓库后在 EdgeOne Makers 手动上传（会自动触发部署）
3. 在项目的环境变量中设置 `GITHUB_TOKEN` 为上一步获取的 GitHub Token
4. 由于 EdgeOne Makers 在部署后加载环境变量，设置完成后需要再次触发部署使变量生效

## 使用说明

部署完成后，访问您的 EdgeOne Makers 域名即可看到使用文档。API 接口与原项目完全兼容。

### 可用接口

- `/api` - GitHub 统计卡片
- `/api/top-langs` - 语言占比卡片
- `/api/pin` - 仓库卡片
- `/api/gist` - Gist 卡片
- `/api/wakatime` - WakaTime 统计卡片
- `/api/streak` - 连续贡献统计卡片
- `/api/profile-summary` - 开发者资料概览卡片
- `/api/contribution-calendar` - 年度贡献日历卡片
- `/api/recent-activity` - 最近公开动态卡片
- `/api/repo-languages` - 指定仓库语言占比卡片
- `/api/org` - GitHub 组织统计卡片

详细参数请参考 [原项目文档](https://github.com/anuraghazra/github-readme-stats/blob/master/readme.md)。

## 示例卡片

将以下代码复制到你的 README 文件中（替换为您的域名和用户名）：

```md
![GitHub Stats](https://your-project.pages.dev/api?username=yourusername&show_icons=true)
![Top Languages](https://your-project.pages.dev/api/top-langs?username=yourusername&layout=compact)
```

更多样式和参数配置(环境变量)请参考 [原项目文档](https://github.com/anuraghazra/github-readme-stats#customization)。

## 相关链接

- [原项目仓库](https://github.com/anuraghazra/github-readme-stats) - anuraghazra/github-readme-stats
- [ghfind](https://github.com/hikariming/ghfind) - AI Stats Agent 开发者画像分析灵感来源
- [EdgeOne Makers 文档](https://pages.edgeone.ai/zh/document/product-introduction)
- [EdgeOne Makers 控制台](https://console.cloud.tencent.com/edgeone/pages)

## License

本项目基于原项目的 MIT 协议开源。详见 [LICENSE](LICENSE) 文件。
