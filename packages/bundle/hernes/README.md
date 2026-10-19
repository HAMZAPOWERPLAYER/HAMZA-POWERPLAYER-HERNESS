# HAMZA POWERPLAYER HERNES integration plugin pack

Composes all HERNES integration plugins:

- `@deepseek-ai/dsh-hernes-bootstrap-plugin` — bootstrap wiring
- `@deepseek-ai/dsh-hernes-task-plugin` — task lifecycle
- `@deepseek-ai/dsh-hernes-project-plugin` — project detection
- `@deepseek-ai/dsh-hernes-verification-plugin` — claim verification
- `@deepseek-ai/dsh-hernes-security-plugin` — security auditing
- `@deepseek-ai/dsh-hernes-quality-gate-plugin` — quality gates
- `@deepseek-ai/dsh-hernes-lifecycle-plugin` — session lifecycle hooks
- `@deepseek-ai/dsh-hernes-edit-plugin` — multi-file edit validation
- `@deepseek-ai/dsh-hernes-codebase-plugin` — codebase understanding
- `@deepseek-ai/dsh-hernes-debug-plugin` — error classification and memory

Each plugin wires pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application through documented extension points.

## What this bundle does

- Registers 10 Cordis services, each mapped to `ctx.<plugin>` via declaration merging
- Wires task state, completion reports, verification, project detection, security, quality gates, lifecycle hooks, bootstrap event wiring, edit validation, codebase understanding, and debugging
- Provides the application path for `User request → analysis → plan → approval → execution → evidence → completion report`

## Extension points used

- Service class registration with `static inject` and `static Config`
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- `ctx.effect()` for cleanup disposal
- Session lifecycle events (`turn/start`, `turn/end`, `step/start`, `step/end`)
- Session event declaration via `declare module '@deepseek-ai/cordis' interface Events`

## Known limitations

- Plugin event listeners (`ctx.on()`) need explicit bootstrap wiring in the agent loop
- No persistence layer yet (task state is in-memory)
- No recorded-session snapshots yet

## See also

- `@deepseek-ai/dsh-util-values` — all underlying pure modules
