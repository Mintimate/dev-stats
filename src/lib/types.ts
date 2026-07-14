export type Platform = "github" | "cnb";

export type ViewName = "agent" | "manual";

export type AgentMode = "readme" | "stats";

export type CardType =
  | "stats"
  | "top-langs"
  | "streak"
  | "profile-summary"
  | "contribution-calendar"
  | "recent-activity"
  | "pin"
  | "repo-languages"
  | "org";

export type ManualConfig = {
  platform: Platform;
  username: string;
  card: CardType;
  repo: string;
  theme: string;
  custom_title: string;
  layout: string;
  langs_count: number;
  activity_count: number;
  card_width: number;
  show_icons: boolean;
  hide_border: boolean;
  include_all_commits: boolean;
  prs_merged: boolean;
  hide_title: boolean;
  hide_rank: boolean;
  disable_animations: boolean;
  text_bold: boolean;
  agent_mode: AgentMode;
};

export type Usage = {
  input: number;
  output: number;
  total: number;
};

export type EventLine = {
  id: string;
  command: string;
  text: string;
  type?: string;
};

export type ToolStatus = "idle" | "active" | "completed";

export type ToolchainState = Record<string, ToolStatus>;

export type DimensionScores = {
  maturity?: number;
  original_projects?: number;
  contributions?: number;
  influence?: number;
  activity?: number;
  community?: number;
};

export type TopRepo = {
  name: string;
  stars?: number;
  contributions_desc?: string;
};

export type EvidenceCoverage = {
  sampled_repos?: number;
  external_contribution_repos?: number;
  activity_signals?: number;
};

export type UserProfile = {
  nickname?: string;
  name?: string;
  bio?: string;
  avatar?: string;
};

export type ReadmeResult = {
  title: string;
  summary: string;
  markdown: string;
  user?: UserProfile;
  is_ghost?: boolean;
  score: number;
  objective_rating: string;
  badges: string[];
  objective_summary: string;
  roast_summary: string;
  promotional_summary: string;
  dimension_scores: DimensionScores;
  top_repos: TopRepo[];
  avatarUrl: string;
  analysis_version?: string;
  evidence_summary?: string;
  coverage?: EvidenceCoverage;
};

export type StatsRecipe = {
  platform?: Platform;
  username?: string;
  cards?: CardType[];
  theme?: string;
  rationale?: string;
  options?: Partial<ManualConfig> & Record<string, unknown>;
};

export type AgentResult =
  | { kind: "none" }
  | { kind: "readme"; data: ReadmeResult }
  | { kind: "stats"; recipe: StatsRecipe; summary: string };

export type AgentStatus = "idle" | "running" | "done" | "error" | "stopped";

export type GlobalStatus = {
  label: string;
  tone?: "is-running" | "is-error";
  transient?: boolean;
};

export type ShareData = {
  platform: string;
  platformKey: "github" | "cnb";
  username: string;
  avatarUrl: string;
  displayName: string;
  handle: string;
  score: string;
  level: string;
  bio: string;
  objective: string;
  roast: string;
  promo: string;
  badges: string[];
  repos: Array<{ name: string; meta: string }>;
  host: string;
};
