# PW 0704 Audit SpaceBot AI Lane

Use this action when the task touches OpenAI/Codex/AI architecture or workflow.

## Audit Loop

1. Confirm the affected surface:

- Codex Desktop workflow
- OpenAI API integration
- Responses API architecture
- Structured Outputs boundary
- hosted tools / web search / file search
- automations / worktrees / subagents

2. Verify current platform facts with official OpenAI docs before making architectural claims.

3. Decide whether the repo should:

- stay local-first and deterministic
- use Responses API
- add Structured Outputs
- add hosted tools
- add eval fixtures or proof schemas
- remain unchanged

4. Record:

- facts
- risks
- recommended change
- required proof
- exact next step

## Rule

Do not let stale memory or generic AI best practices override the current official OpenAI/Codex docs lane.
