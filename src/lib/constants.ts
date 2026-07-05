import type { CardType, ManualConfig, ToolchainState } from "./types";

export const defaultConfig: ManualConfig = {
  platform: "github",
  username: "Mintimate",
  card: "stats",
  repo: "dev-stats",
  theme: "github_dark",
  custom_title: "",
  layout: "normal",
  langs_count: 8,
  activity_count: 5,
  card_width: 0,
  show_icons: true,
  hide_border: false,
  include_all_commits: false,
  prs_merged: false,
  hide_title: false,
  hide_rank: false,
  disable_animations: false,
  text_bold: true,
  agent_mode: "readme",
};

export const cardOptions: Array<{ value: CardType; label: string }> = [
  { value: "stats", label: "统计数据卡片 (Stats)" },
  { value: "top-langs", label: "最常使用语言 (Top Languages)" },
  { value: "streak", label: "连续贡献天数 (Streak)" },
  { value: "profile-summary", label: "个人主页概览 (Profile Summary)" },
  { value: "contribution-calendar", label: "贡献日历 (Contribution Calendar)" },
  { value: "recent-activity", label: "最近动态 (Recent Activity)" },
  { value: "pin", label: "置顶仓库卡片 (Pinned Repo)" },
  { value: "repo-languages", label: "单仓语言分布 (Repo Languages)" },
  { value: "org", label: "组织机构卡片 (Organization)" },
];

export const themes = [
  "github_dark",
  "default",
  "transparent",
  "tokyonight",
  "dracula",
  "catppuccin_mocha",
  "rose_pine",
  "vue",
  "vue-dark",
  "radical",
  "graywhite",
  "ambient_gradient",
];

export const toolchainItems = [
  { key: "inspect_user", name: "资料探查", desc: "主页元数据分析" },
  { key: "fetch_readme", name: "门面抓取", desc: "README 内容提取" },
  { key: "browser_fetch", name: "深度扫描", desc: "特定页面细节爬取" },
  { key: "compose_recipe", name: "卡片规划", desc: "编排 Stats 配方" },
  { key: "compose_draft", name: "画像总装", desc: "生成报告与草稿" },
];

export const emptyToolchain = toolchainItems.reduce<ToolchainState>((next, item) => {
  next[item.key] = "idle";
  return next;
}, {});

export const cardMetadata: Record<string, { name: string; desc: string }> = {
  stats: { name: "Stats Card", desc: "综合统计卡片：包含 Star 数、总 Commit 数、PR 数及评级。" },
  "top-langs": { name: "Top Languages", desc: "主语言偏好：分析公开仓库，以环状/条状图展示最常用的编程语言。" },
  streak: { name: "Streak Card", desc: "开发活跃周期：展示连续提交天数、最大连续提交及总计提交数。" },
  "profile-summary": { name: "Profile Summary", desc: "主页概览统计：展示每个仓库的 Star 均值、提交时间分布图。" },
  "recent-activity": { name: "Recent Activity", desc: "近期提交轨迹：自动爬取并列出最近几周的实际开发动态列表。" },
  org: { name: "Organization Card", desc: "组织机构卡片：展示参与/拥有的组织标志与主页概览。" },
  pin: { name: "Pinned Repo", desc: "精品仓库展示：置顶指定项目仓库卡片及基本统计。" },
  "repo-languages": { name: "Repo Languages", desc: "单仓语言分布：细致分析单个仓库的各种语言占比。" },
  "contribution-calendar": { name: "Contribution Calendar", desc: "贡献日历：展示近期公开贡献热力分布。" },
};

/**
 * 徽章/标签的循环配色表。Leaderboard 榜单行与 README 报告卡片（AgentResultPanel / UserPage）
 * 共用同一套配色规则，保证同一个用户的 badge 在不同页面视觉上一致。
 */
const TAG_COLOR_CYCLE = [
  { background: "#fff7ed", color: "#ea580c", border: "1px solid rgba(234, 88, 12, 0.15)" }, // Orange
  { background: "#f0fdf4", color: "#16a34a", border: "1px solid rgba(22, 163, 74, 0.15)" }, // Green
  { background: "#eff6ff", color: "#2563eb", border: "1px solid rgba(37, 99, 235, 0.15)" }, // Blue
  { background: "#faf5ff", color: "#7c3aed", border: "1px solid rgba(124, 58, 237, 0.15)" }, // Purple
  { background: "#fdf2f8", color: "#db2777", border: "1px solid rgba(219, 39, 119, 0.15)" }, // Pink
];

export function getTagColor(index: number) {
  return TAG_COLOR_CYCLE[index % TAG_COLOR_CYCLE.length];
}
