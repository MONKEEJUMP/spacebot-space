# PW 0704 Setup SpaceBot

Use this action when starting a fresh local or worktree session in `spacebot-space`.

1. Check Git state:

```powershell
git status --short --branch
```

2. Read project law:

- `AGENTS.md`
- `.codex/actions/pw-0704-verify-spacebot-slice.md`
- `.codex/actions/pw-0704-closeout-spacebot.md`

3. Confirm the primary app commands from `package.json`:

```powershell
npm run dev
npm run lint
npm run build
```

4. If the task touches sidecars, inspect them before acting:

- `ticker-worker/package.json`
- `deepresearch-service/requirements.txt`

5. For frontend work, expect local app preview on port `3002` unless the repo changes it.

6. For OpenAI/Codex/API workflow decisions, invoke `$pw-0704-2026070401-openai-codex-superflow` and verify the official docs lane first.
