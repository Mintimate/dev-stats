# Structured Profile Output

## Required README Result

Call `compose_readme_draft` with:

- `title`: profile report title.
- `markdown`: complete personal-promotion README Markdown with applicable Stats cards.
- `summary` and `promotional_summary`: concise summaries in the user's language that highlight real strengths without sounding like an advertisement. Use Simplified Chinese for Chinese requests.
- `objective_rating`: exactly one of `夯`, `顶流`, `高级`, `平庸`, `入门`.
- `objective_summary`: evidence-based rating explanation with limitations.
- `roast_summary`: witty, technical, slightly toxic Chinese humor based on real repository names, stars, inactivity, or contribution patterns.
- `score`: dynamic score with decimal precision, consistent with the selected rating.
- `badges`: 3–5 short Chinese/English developer tags.
- `dimension_scores`: all six integer dimensions from 1 to 20.
- `top_repos`: 3–6 major owned or contributed repositories.

## Rating Bands

- `夯` / 90–100: major industry influence or a core technical breakthrough. GitHub anchor: leadership/core contribution to an exceptionally well-known project above roughly 10k stars (e.g. a widely-adopted framework, editor/IDE plugin ecosystem, or foundational infra tool used across thousands of downstream projects). CNB anchor: a top ecosystem maintainer with massive forks, or org-wide impact spanning multiple flagship internal projects.
- `顶流` / 80–89: leads a prominent open-source project. GitHub anchor: a flagship personal or team project above roughly 4k stars (e.g. a popular CLI tool, theme, or plugin with an active user base and steady release/contribution history). CNB anchor: a project with several hundred stars combined with extensive ecosystem contributions or PRs across other repos.
- `高级` / 70–79: strong engineering depth, consistent output, and projects with meaningful moderate attention (roughly hundreds of stars, or steady multi-repo contribution activity without a single breakout flagship project).
- `平庸` / 50–69: normal public activity and accumulation — regular commits, small utility repos, occasional PRs — without a high-impact flagship project.
- `入门` / 10–49: new or sparse profile dominated by forks, templates, basic demos, or limited recent activity.

Use these anchors as evidence guides for calibration, not as literal named examples — never reference a specific real person's username or handle when explaining a rating; describe the pattern (project type, star range, contribution shape) instead.

Treat the thresholds as evidence guides, not a reason to invent metrics. CNB commonly has fewer stars and relatively stronger fork/PR signals than GitHub, so weigh ecosystem activity accordingly.

## Dimension Scores

Return integers from 1 to 20 for:

- `maturity`: account age and profile completeness.
- `original_projects`: original repository quality and attention.
- `contributions`: commits, PRs, reviews, and contribution quality.
- `influence`: stars, forks, followers, and ecosystem reach.
- `activity`: recent authentic development density.
- `community`: followers, collaboration, and engagement.

## Repository Selection

- Prefer 3–6 repositories with the strongest evidence.
- Each item contains `name`, `stars`, and `contributions_desc` such as `Owner` or `3 PRs`.
- On GitHub, include high-signal external repositories from the `contributions` data when relevant.
- On CNB, use real `path` and `star_count` values from `top_repos` or `repos`; never claim repositories are missing when the tool returned them.

## README Composition

- Produce, at minimum: a personal title/introduction, evidence-based strengths, selected projects or contributions, and applicable Stats cards.
- Add technology, activity, or contact sections only when public data supports them. Never invent contact details, employers, roles, or skills.
- Treat an existing GitHub Profile README as source material. Preserve verified identity, links, and still-relevant facts, but reorganize or rewrite weak presentation when useful.
- Do not silently discard distinctive existing content. If major existing sections are omitted because they are outdated, irrelevant, or unverifiable, make the rewritten README internally coherent without claiming they were preserved verbatim.
