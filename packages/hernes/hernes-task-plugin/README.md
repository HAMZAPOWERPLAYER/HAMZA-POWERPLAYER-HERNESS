# @deepseek-ai/dsh-hernes-task-plugin

HAMZA POWERPLAYER HERNES task lifecycle plugin.

Wires task-state, completion-report, and verification pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application. Provides explicit task state machines, evidence-based completion reports, and claim verification as a service.

## What it does

- `HernesTaskService` extends `Service` and injects `sessions`
- Creates and transitions task records through explicit lifecycle states
- Assembles structured completion reports from observed evidence
- Enforces verification before declaring completion

## Extension points used

- Service registration via `ctx.set('hernesTask', ...)` and `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableTaskTracking` | boolean | true | Enable task lifecycle tracking |
| `enableCompletionReport` | boolean | true | Enable completion report assembly |
| `enforceVerification` | boolean | true | Enforce verification before completion |

## Consumption

```ts
const taskSvc = ctx.get('hernesTask')
const record = taskSvc?.createTask('my-task')
```

## Known limitations

- Service methods wrap pure functions; the agent loop does not yet call them automatically (Phase C wiring in progress)
- No session event emission yet (requires SessionEventMap extension)

## See also

- `@deepseek-ai/dsh-util-values/task-state`
- `@deepseek-ai/dsh-util-values/completion-report`
- `@deepseek-ai/dsh-util-values/verification`
