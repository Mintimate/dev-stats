import { emptyToolchain, toolchainItems } from "./constants";
import type { AgentMode, ManualConfig, ReadmeResult, StatsRecipe, ToolchainState, UserProfile } from "./types";

export function buildAgentMessage(config: ManualConfig, mode: AgentMode) {
  if (config.platform === "cnb") {
    if (mode === "readme") {
      return `请为 CNB 用户 ${config.username} 生成个人自我介绍 README。运行时会一次性采集结构化公开资料并计算可信画像；请基于这些证据输出完整 Markdown 草稿和推荐 Stats 组合。`;
    }
    return `请为 CNB 用户 ${config.username} 推荐 README Stats 组合。运行时会采集公开项目资料；请仅基于提供证据输出配置。`;
  }
  if (mode === "readme") {
    return `请为 GitHub 用户 ${config.username} 生成个人自我介绍 README。运行时会读取 Profile README、采集公开资料并计算可信画像；请输出完整 Markdown 草稿并推荐适合的 Stats 组合。`;
  }
  return `请为 GitHub 用户 ${config.username} 推荐 README Stats 组合。运行时会采集公开资料；请仅基于提供证据输出配置。`;
}

export function normalizeToolName(name?: string) {
  if (!name) return "";
  const raw = String(name);
  const short = raw.includes("__") ? raw.split("__").pop() || "" : raw;
  if (short === "browser") return "browser_fetch";
  return short;
}

export function toolLabel(name?: string) {
  const labels: Record<string, string> = {
    browser_fetch: "浏览用户主页",
    inspect_github_user: "拷打用户基本资料",
    inspect_cnb_user: "拷打用户基本资料",
    fetch_github_profile_readme: "翻 Profile README 的旧账",
    compose_stats_recipe: "调制 Stats 卡片配方",
    compose_readme_draft: "写 README 草稿",
  };
  return labels[normalizeToolName(name)] || normalizeToolName(name) || "Tool";
}

export function narrativeForTool(name: string | undefined, phase: "start" | "done") {
  const normalized = normalizeToolName(name);
  const copy: Record<string, { start: string; done: string }> = {
    browser_fetch: {
      start: "正在获取基本信息，先去主页踩一脚。",
      done: "主页侦察结束，公开信号已经入库。",
    },
    inspect_github_user: {
      start: "拷打用户基本资料：仓库、语言、活跃度，一个都别想跑。",
      done: "基本资料拷打完毕，画像开始有点意思。",
    },
    inspect_cnb_user: {
      start: "拷打用户基本资料：项目、组织、公开履历都过一遍。",
      done: "CNB 资料盘点完毕，硬核指数正在升温。",
    },
    fetch_github_profile_readme: {
      start: "翻 Profile README 的旧账，看看本人怎么介绍自己。",
      done: "Profile README 已读完，能抄的优点和不能踩的坑都记下了。",
    },
    compose_stats_recipe: {
      start: "调制 Stats 卡片配方，开始给主页配装备。",
      done: "Stats 配方出炉，卡片组合已经可以上手。",
    },
    compose_readme_draft: {
      start: "写 README 草稿，把零散信号压成一份能看的门面。",
      done: "README 草稿完成，门面工程已交付。",
    },
  };
  const fallback = phase === "start" ? `正在调用 ${toolLabel(name)}。` : `${toolLabel(name)} 已完成。`;
  return copy[normalized]?.[phase] || fallback;
}

export function toolchainKey(toolName?: string) {
  if (toolName === "inspect_github_user" || toolName === "inspect_cnb_user") return "inspect_user";
  if (toolName === "fetch_github_profile_readme") return "fetch_readme";
  if (toolName === "browser_fetch" || normalizeToolName(toolName) === "browser_fetch") return "browser_fetch";
  if (toolName === "compose_stats_recipe") return "compose_recipe";
  if (toolName === "compose_readme_draft") return "compose_draft";
  return "";
}

export function updateToolchainState(current: ToolchainState, toolName: string | undefined, status: "active" | "completed") {
  const key = toolchainKey(toolName);
  if (!key) return current;
  const next: ToolchainState = { ...current };
  const index = toolchainItems.findIndex((item) => item.key === key);
  if (status === "active") {
    toolchainItems.forEach((item, itemIndex) => {
      if (itemIndex < index) next[item.key] = "completed";
      else if (itemIndex === index) next[item.key] = "active";
      else next[item.key] = "idle";
    });
  } else {
    next[key] = "completed";
  }
  return next;
}

export function completedToolchain() {
  const next = { ...emptyToolchain };
  toolchainItems.forEach((item) => {
    next[item.key] = "completed";
  });
  return next;
}

export function parseUserProfileFromTool(event: { name?: string; content?: string }): UserProfile | null {
  if (!event.content) return null;
  try {
    const res = JSON.parse(event.content);
    if (event.name === "inspect_github_user" && res?.user) {
      return {
        nickname: res.user.name || res.user.login,
        bio: res.user.bio || "这位开发者很低调，什么都没有留下。",
        avatar: res.user.avatar_url || "",
      };
    }
    if (event.name === "inspect_cnb_user" && res?.user) {
      return {
        nickname: res.user.nickname || res.user.username,
        bio: res.user.bio || "这位开发者很低调，什么都没有留下。",
        avatar: res.user.avatar || "",
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function captureRecipe(event: { name?: string; content?: string }) {
  if (event.name !== "compose_stats_recipe" || !event.content) return null;
  try {
    const parsed = JSON.parse(event.content);
    return parsed.recipe || null;
  } catch {
    return null;
  }
}

export function normalizeReadmeResult(
  event: Record<string, unknown>,
  config: Pick<ManualConfig, "platform" | "username">,
  profile: UserProfile | null,
  assistantText: string,
) {
  const isCnb = config.platform === "cnb";
  const avatarUrl = (!event.is_ghost && config.username && config.platform)
    ? `/api/avatar?platform=${config.platform}&username=${config.username}`
    : "/favicon.svg";

  const user = (event.user || {}) as UserProfile;
  const markdown = sanitizePlatformCopy(String(event.markdown || ""), isCnb);
  const result: ReadmeResult = {
    title: sanitizePlatformCopy(String(event.title || "README Draft"), isCnb),
    summary: sanitizePlatformCopy(String(event.summary || assistantText.replace(/\s+/g, " ").trim().slice(0, 220) || "README Markdown generated."), isCnb),
    markdown,
    user,
    is_ghost: Boolean(event.is_ghost),
    score: Number(event.score ?? 60),
    objective_rating: String(event.objective_rating || "入门"),
    badges: Array.isArray(event.badges) ? (event.badges as string[]).map((badge) => sanitizePlatformCopy(String(badge), isCnb)) : ["#极客开发者"],
    objective_summary: sanitizePlatformCopy(String(event.objective_summary || "暂无客观画像评估。"), isCnb),
    roast_summary: sanitizePlatformCopy(String(event.roast_summary || "模型蓄力失败，暂无吐槽数据。"), isCnb),
    promotional_summary: sanitizePlatformCopy(String(event.promotional_summary || "--"), isCnb),
    dimension_scores: (event.dimension_scores as ReadmeResult["dimension_scores"]) || {
      maturity: 12,
      original_projects: 12,
      contributions: 12,
      influence: 12,
      activity: 12,
      community: 12,
    },
    top_repos: Array.isArray(event.top_repos)
      ? (event.top_repos as ReadmeResult["top_repos"]).map((repo) => ({
          ...repo,
          contributions_desc: sanitizePlatformCopy(repo.contributions_desc || "", isCnb),
        }))
      : [],
    avatarUrl,
  };
  result.user = {
    ...user,
    nickname: sanitizePlatformCopy(profile?.nickname || user.nickname || user.name || config.username || "--", isCnb),
    bio: sanitizePlatformCopy(profile?.bio || user.bio || "这位开发者很低调，什么都没有留下。", isCnb),
  };
  return result;
}

function sanitizePlatformCopy(value: string, isCnb: boolean) {
  if (!isCnb) return value;
  return String(value)
    .replace(/GitHub\/CNB/g, "CNB")
    .replace(/GitHub\s*\/\s*CNB/g, "CNB")
    .replace(/GitHub 简介/g, "CNB 简介")
    .replace(/GitHub 影响力/g, "CNB 影响力")
    .replace(/GitHub 用户/g, "CNB 用户")
    .replace(/GitHub 账号/g, "CNB 账号")
    .replace(/GitHub 主页/g, "CNB 主页")
    .replace(/GitHub 项目/g, "CNB 项目")
    .replace(/GitHub 仓库/g, "CNB 仓库")
    .replace(/GitHub 数据/g, "CNB 数据")
    .replace(/GitHub 公开数据/g, "CNB 公开数据")
    .replace(/GitHub/g, "CNB");
}

export function ghostResult(username: string) {
  return {
    title: `${username} - 查无此人`,
    summary: `验证平台用户 "${username}" 失败：404 用户不存在。`,
    markdown: `# ${username} (不存在的开发者)\n\n> 别看了，这个用户在 GitHub/CNB 上根本不存在！\n\n- 如果不是拼写错误，那就是这位开发者正在以量子状态在平行宇宙提交代码。`,
    user: {
      nickname: "未知生物 / 404",
      name: "查无此人",
      bio: "在宇宙的边缘找了很久，连根网线都没找到。该用户可能根本没注册。",
    },
    is_ghost: true,
    score: 0,
    objective_rating: "虚无",
    badges: ["#幽灵账号", "#网络迷失者", "#量子状态"],
    objective_summary: "查无此人。请检查用户名拼写后重新分析。",
    roast_summary: "你随便敲了一串字符就想让我帮你做分析？要不先确认一下账号真的存在。",
    promotional_summary: "这个开发者目前只存在于想象中。",
    dimension_scores: {
      maturity: 0,
      original_projects: 0,
      contributions: 0,
      influence: 0,
      activity: 0,
      community: 0,
    },
    top_repos: [{ name: "error/404-not-found", stars: 0, contributions_desc: "不存在的仓库" }],
  };
}

export function recipeFromEvent(event: Record<string, unknown>) {
  return event.recipe as StatsRecipe | undefined;
}
