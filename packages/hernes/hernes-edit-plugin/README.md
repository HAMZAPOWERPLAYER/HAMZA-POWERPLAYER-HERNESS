# @deepseek-ai/dsh-hernes-edit-plugin

HAMZA POWERPLAYER HERNES multi-file edit plugin.

Wires multi-file-edit validation primitives from `@deepseek-ai/dsh-util-values`
into file editing workflows. Provides precondition checking, edit validation,
and change impact computation for safe multi-file operations.

## What it does

- `HernesEditService` extends `Service` and injects `fs`
- Validates single edits against observed file state
- Validates multiple edits as a batch
- Reports whether all edits are valid

## Extension points used

- Service registration via `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Filesystem injection via `static inject = ['fs']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `requirePreconditions` | boolean | true | Require preconditions for edits |

## Consumption

```ts
const editSvc = ctx.get('hernesEdit')
const result = editSvc?.validateEdit(edit, observedFiles)
if (!result.allValid) {
  // fail closed: do not apply edits
}
```

## Known limitations

- Edit application is not yet wired (validates only)
- No staged transaction commit yet

## See also

- `@deepseek-ai/dsh-util-values/multi-file-edit`
