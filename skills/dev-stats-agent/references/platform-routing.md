# Platform And Tool Routing

## GitHub README Mode

1. Call `fetch_github_profile_readme` first.
2. Call `inspect_github_user` once.
3. Use `browser_fetch` only when rendered public-page details materially improve the result.
4. Finish with `compose_readme_draft`.

If `fetch_github_profile_readme` confirms that `username/username` has no README (including HTTP 404), continue with `inspect_github_user` and generate a new README from the available profile data. A missing profile README does not mean the GitHub user is missing.

## GitHub Stats Mode

1. Call `inspect_github_user` once.
2. Use `browser_fetch` only for necessary public details.
3. Finish with `compose_stats_recipe`.

## CNB Modes

- Call `inspect_cnb_user` exactly once, then immediately call the required composition tool.
- Base conclusions on its structured `user`, `totals`, `repos`, and `top_repos` fields.
- README mode finishes with `compose_readme_draft`; Stats mode finishes with `compose_stats_recipe`.
- Never call `fetch_github_profile_readme`, `inspect_github_user`, or `browser_fetch` for a CNB target.
- CNB profile URLs use `https://cnb.cool/u/<username>`; repository URLs use `https://cnb.cool/<repo.path>`.
- Describe a CNB target as a CNB user, developer, account, or profile. Do not call the target a GitHub user/account/profile. Mention GitHub only in an explicit platform comparison.

## Errors And Repetition

- Never repeat `inspect_github_user`, `inspect_cnb_user`, or the same `browser_fetch` URL in one run.
- A fresh runtime evidence-cache hit is equivalent to the completed platform inspection for routing purposes. Emit the cache-hit status and reuse only its structured collector output; do not re-run the upstream inspection merely to satisfy a mode change.
- If a tool returns sparse or empty data, continue to the final composition tool with explicit caveats. Do not loop or retry.
- If GitHub profile or README retrieval fails without a verified 404, state the limitation and continue from other public data.
- If `inspect_cnb_user` reports `ok = false` or HTTP 404, stop without composing a fallback result. Explain that the CNB username was not found and that CNB usernames are case-sensitive, for example `Mintimate` may exist while `mintimate` returns 404.

## Request Context Priority

- Treat the sanitized frontend state as authoritative for `platform`, `username`, and `agent_mode`; the message describes the requested task.
- If a message conflicts with these target fields, follow the frontend state and keep the final tool parameters consistent with it.
- If the target username is missing from both state and message, ask for it instead of guessing or calling a tool with an empty value.
