# @deepseek-ai/dsh-hernes-lifecycle-plugin

HAMZA POWERPLAYER HERNES lifecycle plugin.

Wires task lifecycle into Cordis session events (`turn/start`, `turn/end`,
`step/start`, `step/end`) through documented extension points. Emits evidence
when sessions and steps complete, providing the "what was actually executed"
evidence layer for claim verification.

## What it does

- `HernesLifecycleService` extends `Service` and injects `sessions`
- Hooks into turn start/end and step start/end events
- Tracks active tasks across the Cordis session lifecycle
- Assembles completion reports from task state

## Extension points used

- Service registration via `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `emitTaskEvents` | boolean | true | Emit task events on lifecycle transitions |
| `autoCompleteOnTurnEnd` | boolean | false | Auto-complete tasks on successful turn end |

## Consumption

```ts
const lifecycleSvc = ctx.get('hernesLifecycle')
lifecycleSvc?.onTurnStart(session.id, turn)
lifecycleSvc?.onTurnEnd(session.id, turn, reason, true)
```

## Known limitations

- Event wiring to Cordis session events is defined in the service but needs explicit `ctx.on()` registration in the bootstrap path
- Tasks are tracked in memory only; persistence is not yet implemented

## See also

- `@deepseek-ai/dsh-util-values/task-state`
- `@deepseek-ai/dsh-util-values/completion-report`
