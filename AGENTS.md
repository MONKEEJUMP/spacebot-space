# SpaceBot Space AGENTS

## Mission

Maintain `spacebot-space` as a production Next.js application plus supporting ticker/research services. Keep homepage, API, ticker worker, and deep-research changes scoped, reviewable, and verification-backed.

## Workflow Routing

- Use `$pw-0704-2026070401-openai-codex-superflow` for OpenAI/Codex workflow law, official-doc verification, project rollout, worktree policy, automations, and cross-project operating discipline.
- Use `$openai-docs` before making OpenAI/Codex/API claims or workflow decisions that could have changed.
- Use `$codex-project-setup-law` for repo setup and `.codex` actions.
- Use `$codex-verification-security`, `$lucy-verification`, and `$lucy-security-scan` before calling risky work done.
- Use `$codex-closeout-memory` or `$lucy-obsidian-closeout` for durable closeout and handoff packets.

## Repo Map

- `src/app/`: Next.js routes, layouts, and API handlers.
- `src/components/`: UI components.
- `src/lib/`: shared business logic, ticker logic, services, auth, and integrations.
- `ticker-worker/`: news ticker ingestion pipeline.
- `deepresearch-service/`: Python research service.
- `scripts/`: maintenance, nightly, and service helper scripts.
- `docs/`: audits, rollout notes, and long-form repo artifacts.
- `.codex/actions/`: setup, verification, audit, and closeout guides for Codex Desktop.

## Commands

- dev: `npm run dev`
- lint: `npm run lint`
- build: `npm run build`
- pm2 prep: `npm run prepm2`
- pm2 start: `npm run pm2`

There is no first-class automated test script in `package.json` right now. For risky work, use lint/build plus targeted browser/API/runtime proof.

## Project Law

- Use worktrees for risky or parallel coding lanes whenever the repo state permits it.
- Use subagents only for bounded read/review slices with a clear closeout.
- Use automations for status, watchdog, and checklist loops; do not use them for uncontrolled coding.
- New OpenAI-backed AI features should default toward Responses API + Structured Outputs + hosted tools when appropriate.
- For current OpenAI/Codex behavior, check official docs first.

## Verification Law

- UI changes: run `npm run lint` and inspect the affected route in a browser or preview when possible.
- App/API changes: run `npm run build` unless blocked by unrelated repo state; if blocked, say exactly why.
- Worker/service changes: run the narrowest slice-specific verification available and report the receipt.
- Always run `git diff --check` before closeout when files changed.
- Never say a change is complete without the proof receipt or a clear disclosure that proof could not be run.

## Safety

- Never expose `.env`, auth tokens, API keys, or private credentials.
- Treat the repo dirty state as real; do not revert unrelated user work.
- Call out unrelated pre-existing dirt before broad modifications.

## Closeout

End meaningful slices with:

- what changed
- current state
- verification run
- blockers/risks
- exact next move
