# Repository Instructions

## DevStats Agent Skill

- Treat `skills/dev-stats-agent/` as the single source of truth for Stats Agent behavior, GitHub/CNB routing, ratings, README output, and Stats recipe policy.
- Do not hand-edit `agents/chat/_skill.ts`; it is generated from the project skill Markdown.
- After changing `skills/dev-stats-agent/SKILL.md` or a file under `skills/dev-stats-agent/references/`, run `npm run sync:agent-skill`.
- Run `npm run check:agent-skill` when reviewing or validating changes. `npm run dev` and `npm run build` sync automatically; `npm run typecheck` rejects stale generated output.
- Keep executable tool schemas and side effects in `agents/chat/_tools.ts`; keep behavior policy and response requirements in the project skill.
- Keep request-state sanitization and prompt assembly in `agents/chat/_prompt.ts`; do not duplicate skill policy there.

## Generated And Managed Directories

- Do not hand-edit `.edgeone/`; EdgeOne Makers generates it during build and local development.
- Treat `.agents/skills/` as environment-managed platform skills, not the source for this project's Agent behavior.
- Preserve unrelated files under `output/`; they may be user-generated artifacts.

## Validation

- For Agent or skill changes, run `npm run typecheck`, `npm run test:concurrency`, and `npm run build`.
- Preview Makers routes through `edgeone makers dev --name dev-stats --skip-env-sync` and `http://127.0.0.1:8088/`; do not use a standalone static server.
