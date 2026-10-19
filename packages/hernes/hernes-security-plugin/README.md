# @deepseek-ai/dsh-hernes-security-plugin

HAMZA POWERPLAYER HERNES security plugin.

Wires security-audit, approval-policy, and workspace-trust pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application. Provides security auditing, approval decisions, and workspace trust resolution.

## What it does

- `HernesSecurityService` extends `Service` and injects `sessions`
- Runs security checks on inputs (path traversal, secrets, shell injection)
- Decides approval for tool invocations based on risk and trust
- Resolves workspace trust levels for target paths

## Extension points used

- Service registration via `ctx.set('hernesSecurity', ...)` and `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableAudit` | boolean | true | Enable security auditing |
| `enforceApproval` | boolean | true | Enforce approval for consequential actions |
| `trustedRoots` | string[] | `[]` | Trusted roots for workspace trust resolution |

## Consumption

```ts
const secSvc = ctx.get('hernesSecurity')
const results = secSvc?.runAudit([{ name: 'cmd', value: 'rm -rf /' }])
```

## Known limitations

- Does not yet intercept tool execution paths automatically
- Approval decisions are made by the service but not yet enforced at the executor

## See also

- `@deepseek-ai/dsh-util-values/security-audit`
- `@deepseek-ai/dsh-util-values/approval-policy`
- `@deepseek-ai/dsh-util-values/workspace-trust`
