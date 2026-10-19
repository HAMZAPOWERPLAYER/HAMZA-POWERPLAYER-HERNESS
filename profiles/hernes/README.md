# HAMZA POWERPLAYER HERNES Profile

Profile for the HERNES AI-assisted game development capability layer on DeepSeek Harness.

## Bundles

1. `@deepseek-ai/dsh-base` — shared core (llm, session, tools, agent-loop, filesystem, sandbox, permissions)
2. `@deepseek-ai/dsh-hernes` — HERNES integration plugin pack (task, project, verification, security, quality-gate, lifecycle, edit)
3. `@deepseek-ai/dsh-headless` — headless CLI launch

## What this profile enables

- Task lifecycle tracking through Cordis agent-loop events
- Project detection and workspace summarization at session start
- Evidence-based claim verification with explicit claim states
- Security auditing and approval decisions for tool execution
- Quality gate evaluation before completion
- Multi-file edit validation with precondition checking

## Known limitations

- Plugin event listeners (`ctx.on()`) need explicit bootstrap wiring
- Recorded-session snapshots require vitest snapshot toolchain

## See also

- `packages/boot/app-boot/src/profile.ts` — profile template registration
