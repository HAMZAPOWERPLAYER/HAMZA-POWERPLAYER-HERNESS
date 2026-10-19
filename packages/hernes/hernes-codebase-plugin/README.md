# @deepseek-ai/dsh-hernes-codebase-plugin

HAMZA POWERPLAYER HERNES codebase understanding plugin.

Wires codebase-understanding pure modules from `@deepseek-ai/dsh-util-values`
into the Cordis application. Provides dependency graph building, file ranking,
and affected-file analysis for codebase understanding workflows.

## What it does

- `HernesCodebaseService` extends `Service` and injects `fs`
- Builds dependency graphs from observed files
- Ranks files by relevance to query terms
- Finds files affected by changes

## Extension points used

- Service registration via `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Filesystem injection via `static inject = ['fs']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableUnderstanding` | boolean | true | Enable codebase understanding |
| `maxRankedFiles` | integer | 50 | Maximum ranked files to return |

## Consumption

```ts
const codebaseSvc = ctx.get('hernesCodebase')
const graph = codebaseSvc?.buildGraph(files)
```

## Known limitations

- File observation is not yet wired to the actual filesystem
- Dependency resolution is text-based, not language-aware

## See also

- `@deepseek-ai/dsh-util-values/codebase-understanding`
