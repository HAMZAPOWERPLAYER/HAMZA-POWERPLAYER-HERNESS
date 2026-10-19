# @deepseek-ai/dsh-hernes-quality-gate-plugin

HAMZA POWERPLAYER HERNES quality gate plugin.

Wires game-quality-gate pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application. Provides quality gate evaluation for architecture, correctness, security, testing, performance, and maintainability.

## What it does

- `HernesQualityGateService` extends `Service` and injects `sessions`
- Evaluates quality gates with explicit pass/fail/not-applicable statuses
- Enforces a minimum pass rate before completion

## Extension points used

- Service registration via `ctx.set('hernesQualityGate', ...)` and `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableQualityGate` | boolean | true | Enable quality gate evaluation |
| `minPassRate` | number | 80 | Minimum pass rate for quality gates |

## Consumption

```ts
const gateSvc = ctx.get('hernesQualityGate')
const result = gateSvc?.evaluateGate([{ category: 'architecture', checks: [] }])
```

## Known limitations

- Does not yet intercept agent-loop completion events
- Quality gate results are not yet emitted as session events

## See also

- `@deepseek-ai/dsh-util-values/game-quality-gate`
