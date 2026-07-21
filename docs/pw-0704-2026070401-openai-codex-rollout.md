# PW 0704 / 2026070401 OpenAI Codex Rollout

## Purpose

This rollout installs the repo-facing layer of PAULIEWOOD's OpenAI/Codex workflow system for `spacebot-space` without overwriting older skill packs.

## Unique Origin Code

- four-digit code: `0704`
- unique numerical code: `2026070401`
- skill prefix: `pw-0704-2026070401-`

This prefix is used so new workflow artifacts can be traced cleanly and do not collide with older Codex skill packs.

## Installed Repo Files

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/actions/pw-0704-setup-spacebot.md`
- `.codex/actions/pw-0704-verify-spacebot-slice.md`
- `.codex/actions/pw-0704-audit-spacebot-ai-lane.md`
- `.codex/actions/pw-0704-closeout-spacebot.md`

## Global Skill Conductor

The new master conductor skill is:

`C:\Users\DJ PAULIEWOOD\.codex\skills\pw-0704-2026070401-openai-codex-superflow`

It routes into the existing category skills rather than replacing them:

- `openai-developer-codex-workflow`
- `openai-developer-stack`
- `codex-project-setup-law`
- `ai-build-contracts`
- `codex-verification-security`
- `codex-closeout-memory`
- `presidential-eval-pack`
- `lucy-audit`
- `lucy-checkpoint`
- `lucy-verification`
- `lucy-security-scan`
- `lucy-pdf`
- `lucy-obsidian-closeout`

## Repo-Specific Operating Standard

- Use worktrees for risky parallel coding.
- Use subagents only for bounded read/review slices.
- Use automations for status/watchdog/checklist loops, not uncontrolled coding.
- Use official OpenAI docs before making Codex/OpenAI/API claims.
- Standardize future OpenAI-backed build work toward Responses API + Structured Outputs + hosted tools where appropriate.
- Treat evals as local proof packs first: fixtures, schemas, graders, regression scripts, and explicit failure cases.

## Recommended Automations

These are defined as recommended defaults, not blindly activated, because unattended full-access automation needs deliberate cadence choices.

1. `PW 0704 Daily Closeout Watchdog`
   Thread heartbeat.
   Suggested schedule: weekdays at 5:30 PM local time.
   Goal: checkpoint active work and identify the next exact move.

2. `PW 0704 Weekly Workflow Drift Audit`
   Project cron automation in a worktree.
   Suggested schedule: Mondays at 9:00 AM local time.
   Goal: inspect `AGENTS.md`, `.codex/actions`, workflow drift, and open verification gaps.

3. `PW 0704 Weekly OpenAI Docs Drift Check`
   Project cron automation in a worktree.
   Suggested schedule: Fridays at 8:30 AM local time.
   Goal: re-check official OpenAI docs for model/API/Codex changes that affect current doctrine.

## Immediate Use Pattern

1. Start with `AGENTS.md`.
2. Use `pw-0704-setup-spacebot.md` when a session begins.
3. Use `pw-0704-verify-spacebot-slice.md` before calling work complete.
4. Use `pw-0704-audit-spacebot-ai-lane.md` for OpenAI/Codex/AI architecture decisions.
5. Use `pw-0704-closeout-spacebot.md` for final status and Obsidian durability.

## Next Upgrade Path

1. Apply the same repo-layer pattern to other serious projects.
2. Add guarded hooks later for pre-compact summaries and stop-turn handoffs.
3. Activate automations only after confirming cadence and sandbox comfort.
4. Convert repeated SpaceBot AI workflows into repo-local or global skills only after the first workflow proves stable.
