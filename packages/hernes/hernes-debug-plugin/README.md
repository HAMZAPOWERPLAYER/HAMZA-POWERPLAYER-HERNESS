# @deepseek-ai/dsh-hernes-debug-plugin

HAMZA POWERPLAYER HERNES debugging plugin.

Wires error-memory and error-classification pure modules from
`@deepseek-ai/dsh-util-values` into the Cordis application. Provides error
classification, error memory storage, and debugging support.

## What it does

- `HernesDebugService` extends `Service` and injects `sessions`
- Classifies errors by category and severity
- Checks if errors are retryable
- Creates, searches, filters, and revalidates error memory entries
- Summarizes error memory state

## Extension points used

- Service registration via `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableErrorMemory` | boolean | true | Enable error memory |
| `maxEntries` | integer | 1000 | Maximum error entries to store |

## Consumption

```ts
const debugSvc = ctx.get('hernesDebug')
const classified = debugSvc?.classifyError({ error: new Error('...'), context: { operation: '...' } })
```

## Known limitations

- Error memory is in-memory only; no persistence layer
- Error classification is heuristic, not definitive

## See also

- `@deepseek-ai/dsh-util-values/error-memory`
- `@deepseek-ai/dsh-util-values/error-classification`
