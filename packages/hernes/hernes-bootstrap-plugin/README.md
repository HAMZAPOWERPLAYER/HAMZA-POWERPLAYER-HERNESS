# @deepseek-ai/dsh-hernes-bootstrap-plugin

HAMZA POWERPLAYER HERNES bootstrap plugin.

Wires HERNES services into Cordis session events (`turn/start`, `turn/end`,
`step/start`, `step/end`) through documented extension points.

## What it does

- `HernesBootstrapService` extends `Service` and injects `sessions`
- Wires session event listeners to the lifecycle service
- Declares HERNES session event types via `declare module '@deepseek-ai/cordis'`
- Provides the `wireSessionEvents()` method to connect lifecycle service to events

## Extension points used

- Service registration via `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'` (Context + Events)
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableEventWiring` | boolean | true | Wire session event listeners |

## Consumption

```ts
const bootstrap = ctx.get('hernesBootstrap')
const lifecycle = ctx.get('hernesLifecycle')
bootstrap?.wireSessionEvents(lifecycle)
```

## Known limitations

- Cordis session events are scoped to sessions; wiring must happen per-session
- Event emission from the agent loop is internal to Cordis; this plugin declares the event types but the agent loop must be modified to emit them

## See also

- `@deepseek-ai/dsh-hernes-lifecycle-plugin`
- `@deepseek-ai/dsh-util-values/task-state`
