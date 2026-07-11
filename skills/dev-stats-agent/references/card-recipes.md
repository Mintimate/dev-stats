# Stats Card Recipes

## Supported Cards

`stats`, `top-langs`, `pin`, `streak`, `profile-summary`, `contribution-calendar`, `recent-activity`, `repo-languages`, `org`.

GitHub supports the complete list. CNB supports `stats`, `top-langs`, `pin`, `streak`, `profile-summary`, `contribution-calendar`, `recent-activity`, and `repo-languages`; do not recommend `org` for CNB.

Useful options include `platform`, `username`, `theme`, `layout`, `show_icons`, `hide_border`, `langs_count`, `card_width`, `custom_title`, `repo`, `show`, and `include_all_commits`.

## Recipe Rules

- Always finish a Stats recommendation with `compose_stats_recipe`.
- Keep the recipe `platform` equal to the requested target platform.
- Recommend only cards supported by the target platform and the available public evidence.
- If `cards` contains `pin` or `repo-languages`, choose a real repository returned by `repos` or `top_repos`.
- For GitHub, set `options.repo` to the bare repository name because `username` is passed separately. For CNB, prefer the complete returned path such as `group/repository`; the provider accepts a full CNB path.
- Never use an empty, default, or invented repository name.
- Explain the chosen card combination briefly in `rationale`.

## README Card Markdown

- A full README result should include applicable Stats card Markdown.
- Map `stats` to `/api`; map other card names to `/api/<card>`, for example `/api/top-langs`, `/api/pin`, and `/api/repo-languages`. Do not encode a card as `/api?card=<name>`.
- For exported README Markdown, prefix every card URL with the runtime-provided deployed site origin. Pass `username` for user cards, `repo` for repository-dependent cards, `platform=cnb` for CNB, and `org` instead of `username` for the GitHub organization card.
- When an existing GitHub Profile README contains known third-party or legacy DevStats statistics cards, replace those card images with the canonical DevStats card block. Preserve unrelated images, badges, and prose.
- Keep usernames, repository paths, and platform query parameters consistent with the inspected target.
