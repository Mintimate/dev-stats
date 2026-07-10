export type AnalysisPlatform = 'github' | 'cnb';

export type AnalysisRepo = {
  name: string;
  stars: number;
  contributions_desc: string;
};

export type DeterministicAnalysis = {
  version: 'v1';
  platform: AnalysisPlatform;
  username: string;
  score: number;
  objective_rating: '夯' | '顶流' | '高级' | '平庸' | '入门';
  dimension_scores: {
    maturity: number;
    original_projects: number;
    contributions: number;
    influence: number;
    activity: number;
    community: number;
  };
  top_repos: AnalysisRepo[];
  evidence_summary: string;
  coverage: {
    sampled_repos: number;
    external_contribution_repos: number;
    activity_signals: number;
  };
};

const GITHUB_CARDS = new Set([
  'stats', 'top-langs', 'pin', 'streak', 'profile-summary', 'contribution-calendar', 'recent-activity', 'repo-languages', 'org',
]);
const CNB_CARDS = new Set([
  'stats', 'top-langs', 'pin', 'streak', 'profile-summary', 'contribution-calendar', 'recent-activity', 'repo-languages',
]);

function numberOf(value: unknown): number {
  const valueAsNumber = Number(value);
  return Number.isFinite(valueAsNumber) ? Math.max(0, valueAsNumber) : 0;
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function clampDimension(value: number): number {
  return Math.max(2, Math.min(20, Math.round(value)));
}

function logarithmicPoints(value: number, fullAt: number, points: number): number {
  if (value <= 0 || fullAt <= 0) return 0;
  return Math.min(Math.log10(value + 1) / Math.log10(fullAt + 1), 1) * points;
}

function ageInYears(value: unknown): number {
  const timestamp = Date.parse(textOf(value));
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, (Date.now() - timestamp) / (365.25 * 24 * 60 * 60 * 1000));
}

function daysSince(value: unknown): number | null {
  const timestamp = Date.parse(textOf(value));
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, (Date.now() - timestamp) / (24 * 60 * 60 * 1000));
}

function ratingFor(score: number): DeterministicAnalysis['objective_rating'] {
  if (score >= 90) return '夯';
  if (score >= 80) return '顶流';
  if (score >= 70) return '高级';
  if (score >= 50) return '平庸';
  return '入门';
}

function repoFromGitHub(repo: any): AnalysisRepo | null {
  const name = textOf(repo?.name);
  if (!name) return null;
  return {
    name,
    stars: numberOf(repo?.stargazers_count),
    contributions_desc: `Owner${textOf(repo?.language) ? ` · ${textOf(repo.language)}` : ''}`,
  };
}

function repoFromCNB(repo: any): AnalysisRepo | null {
  const name = textOf(repo?.path) || textOf(repo?.name);
  if (!name) return null;
  return {
    name,
    stars: numberOf(repo?.star_count ?? repo?.mark_count),
    contributions_desc: `Owner${textOf(repo?.language) ? ` · ${textOf(repo.language)}` : ''}`,
  };
}

function uniqueRepos(repos: AnalysisRepo[]): AnalysisRepo[] {
  const seen = new Set<string>();
  return repos.filter((repo) => {
    const key = repo.name.toLowerCase();
    if (!repo.name || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 6);
}

export function createDeterministicAnalysis(
  platform: AnalysisPlatform,
  inspected: Record<string, any>,
  requestedUsername: string,
): DeterministicAnalysis {
  if (platform === 'cnb') return scoreCNB(inspected, requestedUsername);
  return scoreGitHub(inspected, requestedUsername);
}

function scoreGitHub(inspected: Record<string, any>, requestedUsername: string): DeterministicAnalysis {
  const user = inspected.user ?? {};
  const username = textOf(user.login) || requestedUsername;
  const repos = Array.isArray(inspected.repos) ? inspected.repos : [];
  const contributions = Array.isArray(inspected.contributions) ? inspected.contributions : [];
  const owned = repos.filter((repo: any) => !repo?.fork && !repo?.archived);
  const topOwned = owned
    .slice()
    .sort((left: any, right: any) => numberOf(right.stargazers_count) - numberOf(left.stargazers_count));
  const totalStars = owned.reduce((total: number, repo: any) => total + numberOf(repo.stargazers_count), 0);
  const totalForks = owned.reduce((total: number, repo: any) => total + numberOf(repo.forks_count), 0);
  const maxStars = numberOf(topOwned[0]?.stargazers_count);
  const substantive = owned.filter((repo: any) => numberOf(repo.size) > 0 || textOf(repo.description)).length;
  const recentRepos = owned.filter((repo: any) => {
    const days = daysSince(repo.pushed_at ?? repo.updated_at);
    return days !== null && days <= 365;
  }).length;
  const freshRepos = owned.filter((repo: any) => {
    const days = daysSince(repo.pushed_at ?? repo.updated_at);
    return days !== null && days <= 90;
  }).length;
  const externalPrs = contributions.reduce((total: number, repo: any) => total + numberOf(repo.pr_count), 0);
  const age = ageInYears(user.created_at);
  const followers = numberOf(user.followers);
  const following = numberOf(user.following);
  const publicRepos = numberOf(user.public_repos);

  const dimensions = {
    maturity: clampDimension(2 + Math.min(9, age * 1.15) + (textOf(user.bio) ? 1.5 : 0) + (textOf(user.blog) ? 1 : 0) + logarithmicPoints(publicRepos, 80, 6)),
    original_projects: clampDimension(2 + logarithmicPoints(totalStars, 5000, 8) + logarithmicPoints(maxStars, 2000, 4) + Math.min(5, substantive * 0.75)),
    contributions: clampDimension(2 + logarithmicPoints(externalPrs, 80, 10) + Math.min(5, recentRepos * 1.25) + Math.min(3, substantive * 0.35)),
    influence: clampDimension(2 + logarithmicPoints(totalStars, 5000, 7) + logarithmicPoints(totalForks, 1000, 4) + logarithmicPoints(followers, 2000, 7)),
    activity: clampDimension(2 + Math.min(8, freshRepos * 2.5) + Math.min(5, recentRepos * 0.9) + logarithmicPoints(externalPrs, 80, 3)),
    community: clampDimension(2 + logarithmicPoints(followers, 2000, 8) + Math.min(4, contributions.length * 0.8) + (following > 0 && followers >= following ? 2 : 0)),
  };
  const score = Number((Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 120 * 100).toFixed(2));
  const topRepos = uniqueRepos([
    ...topOwned.map(repoFromGitHub).filter(Boolean) as AnalysisRepo[],
    ...contributions
      .slice()
      .sort((left: any, right: any) => numberOf(right.pr_count) - numberOf(left.pr_count))
      .map((repo: any) => ({
        name: textOf(repo.name),
        stars: numberOf(repo.stargazers_count),
        contributions_desc: `${numberOf(repo.pr_count)} PRs`,
      })),
  ]);

  return {
    version: 'v1',
    platform: 'github',
    username,
    score,
    objective_rating: ratingFor(score),
    dimension_scores: dimensions,
    top_repos: topRepos,
    evidence_summary: `采样 ${repos.length} 个公开仓库（非 fork 且未归档 ${owned.length} 个），累计 ${Math.round(totalStars)} stars、${Math.round(totalForks)} forks，并识别到 ${externalPrs} 个外部项目 PR 信号。`,
    coverage: { sampled_repos: repos.length, external_contribution_repos: contributions.length, activity_signals: recentRepos },
  };
}

function scoreCNB(inspected: Record<string, any>, requestedUsername: string): DeterministicAnalysis {
  const user = inspected.user ?? {};
  const totals = inspected.totals ?? {};
  const username = textOf(user.username) || requestedUsername;
  const repos = Array.isArray(inspected.top_repos)
    ? inspected.top_repos
    : Array.isArray(inspected.repos) ? inspected.repos : [];
  const totalStars = numberOf(totals.stars ?? user.stars_count);
  const totalForks = numberOf(totals.forks);
  const commits = numberOf(totals.commits);
  const pullRequests = numberOf(totals.pull_requests);
  const issues = numberOf(totals.issues);
  const activeDays = numberOf(totals.active_days);
  const followers = numberOf(user.follower_count);
  const following = numberOf(user.follow_count);
  const age = ageInYears(user.created_at);
  const substantive = repos.filter((repo: any) => textOf(repo.description)).length;
  const recentRepos = repos.filter((repo: any) => {
    const days = daysSince(repo.updated_at);
    return days !== null && days <= 365;
  }).length;
  const maxStars = Math.max(0, ...repos.map((repo: any) => numberOf(repo.star_count ?? repo.mark_count)));

  const dimensions = {
    maturity: clampDimension(2 + Math.min(9, age * 1.15) + (textOf(user.bio) ? 1.5 : 0) + logarithmicPoints(numberOf(user.public_repo_count), 80, 6)),
    original_projects: clampDimension(2 + logarithmicPoints(totalStars, 1500, 8) + logarithmicPoints(maxStars, 600, 4) + Math.min(5, substantive * 0.8)),
    contributions: clampDimension(2 + logarithmicPoints(commits, 1000, 6) + logarithmicPoints(pullRequests, 100, 7) + logarithmicPoints(issues, 50, 3)),
    influence: clampDimension(2 + logarithmicPoints(totalStars, 1500, 8) + logarithmicPoints(totalForks, 500, 5) + logarithmicPoints(followers, 1000, 5)),
    activity: clampDimension(2 + logarithmicPoints(activeDays, 180, 9) + logarithmicPoints(commits + pullRequests, 1000, 5) + Math.min(2, recentRepos)),
    community: clampDimension(2 + logarithmicPoints(followers, 1000, 8) + logarithmicPoints(issues, 50, 4) + (following > 0 && followers >= following ? 2 : 0)),
  };
  const score = Number((Object.values(dimensions).reduce((sum, value) => sum + value, 0) / 120 * 100).toFixed(2));
  const topRepos = uniqueRepos(repos
    .slice()
    .sort((left: any, right: any) => numberOf(right.star_count ?? right.mark_count) - numberOf(left.star_count ?? left.mark_count))
    .map(repoFromCNB)
    .filter(Boolean) as AnalysisRepo[]);

  return {
    version: 'v1',
    platform: 'cnb',
    username,
    score,
    objective_rating: ratingFor(score),
    dimension_scores: dimensions,
    top_repos: topRepos,
    evidence_summary: `采样 ${repos.length} 个公开仓库，累计 ${Math.round(totalStars)} stars/marks、${Math.round(totalForks)} forks；本年度公开活动包含 ${Math.round(commits)} commits、${Math.round(pullRequests)} PR 和 ${Math.round(activeDays)} 个活跃日。`,
    coverage: { sampled_repos: repos.length, external_contribution_repos: pullRequests, activity_signals: activeDays },
  };
}

export function validateReadmeDraft(input: Record<string, unknown>, analysis: DeterministicAnalysis): Record<string, unknown> {
  const badges = Array.isArray(input.badges)
    ? input.badges.map((badge) => textOf(badge)).filter(Boolean).slice(0, 5)
    : [];
  return {
    ok: true,
    title: textOf(input.title) || `${analysis.username} README Draft`,
    markdown: textOf(input.markdown),
    summary: textOf(input.summary),
    promotional_summary: textOf(input.promotional_summary) || textOf(input.summary),
    objective_rating: analysis.objective_rating,
    objective_summary: textOf(input.objective_summary) || analysis.evidence_summary,
    roast_summary: textOf(input.roast_summary),
    score: analysis.score,
    badges: badges.length ? badges : ['#公开资料画像', '#持续建设中'],
    dimension_scores: analysis.dimension_scores,
    top_repos: analysis.top_repos,
    analysis_version: analysis.version,
    evidence_summary: analysis.evidence_summary,
    coverage: analysis.coverage,
  };
}

export function validateStatsRecipe(input: Record<string, unknown>, analysis: DeterministicAnalysis): Record<string, unknown> {
  const allowed = analysis.platform === 'github' ? GITHUB_CARDS : CNB_CARDS;
  const requestedCards = Array.isArray(input.cards) ? input.cards.map((card) => textOf(card)) : [];
  const cards = requestedCards.filter((card) => allowed.has(card));
  let safeCards = cards.length ? Array.from(new Set(cards)).slice(0, 4) : ['stats', 'top-langs'];
  const rawOptions = input.options && typeof input.options === 'object' ? input.options as Record<string, unknown> : {};
  const options = { ...rawOptions };
  const validRepoNames = new Set(
    analysis.top_repos
      .map((repo) => repo.name)
      .filter((name) => analysis.platform === 'cnb' || !name.includes('/')),
  );
  if ((safeCards.includes('pin') || safeCards.includes('repo-languages')) && !validRepoNames.has(textOf(options.repo))) {
    const fallbackRepo = analysis.top_repos.find((repo) => analysis.platform === 'cnb' || !repo.name.includes('/'))?.name;
    if (fallbackRepo) options.repo = fallbackRepo;
    else {
      delete options.repo;
      safeCards = safeCards.filter((card) => card !== 'pin' && card !== 'repo-languages');
    }
  }
  return {
    ok: true,
    recipe: {
      platform: analysis.platform,
      username: analysis.username,
      cards: safeCards,
      theme: textOf(input.theme) || 'default',
      rationale: textOf(input.rationale) || analysis.evidence_summary,
      options,
    },
  };
}

export function fallbackStatsRecipe(analysis: DeterministicAnalysis): Record<string, unknown> {
  const repo = analysis.top_repos.find((candidate) => analysis.platform === 'cnb' || !candidate.name.includes('/'))?.name;
  const cards = repo ? ['stats', 'top-langs', 'pin'] : ['stats', 'top-langs'];
  return validateStatsRecipe({ cards, theme: 'default', options: { repo } }, analysis);
}
