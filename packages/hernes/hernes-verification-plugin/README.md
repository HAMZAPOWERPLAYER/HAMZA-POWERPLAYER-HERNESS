# @deepseek-ai/dsh-hernes-verification-plugin

HAMZA POWERPLAYER HERNES verification plugin.

Wires verification, claim-verifier, and tool-result envelope pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application. Provides evidence-based claim verification and structured tool-result handling.

## What it does

- `HernesVerificationService` extends `Service` and injects `sessions`
- Evaluates claims against required evidence types and actual evidence
- Creates structured tool-result envelopes separating raw output from interpretation
- Enforces verification before completion

## Extension points used

- Service registration via `ctx.set('hernesVerification', ...)` and `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enforceVerification` | boolean | true | Enforce verification before completion |
| `maxRetries` | integer | 3 | Maximum retry count for tool execution |

## Consumption

```ts
const verifSvc = ctx.get('hernesVerification')
const evaluation = verifSvc?.evaluateClaim({ claimId: 'c1', claimText: 'tests pass', requiredEvidenceTypes: ['unit-test'], actualEvidence: [] })
```

## Known limitations

- Does not yet intercept agent-loop events automatically
- Tool-result envelopes are created by the service but not yet emitted as session events

## See also

- `@deepseek-ai/dsh-util-values/verification`
- `@deepseek-ai/dsh-util-values/claim-verifier`
- `@deepseek-ai/dsh-util-values/tool-result`
