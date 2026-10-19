# @deepseek-ai/dsh-hernes-project-plugin

HAMZA POWERPLAYER HERNES project detection plugin.

Wires project-kind and workspace-discovery pure modules from `@deepseek-ai/dsh-util-values` into the Cordis application. Detects project type at session start and summarizes the workspace.

## What it does

- `HernesProjectService` extends `Service` and injects `sessions`
- Detects project kinds (Unity, Godot, Flutter, Android, Node, Python)
- Summarizes workspace structure and file counts

## Extension points used

- Service registration via `ctx.set('hernesProject', ...)` and `ctx.effect()` disposal
- Context augmentation via `declare module '@deepseek-ai/cordis'`
- Session injection via `static inject = ['sessions']`

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enableDetection` | boolean | true | Enable project detection |
| `ignorePatterns` | string[] | `['node_modules', 'lib', 'dist']` | Directories to ignore |

## Consumption

```ts
const projectSvc = ctx.get('hernesProject')
const kinds = projectSvc?.detectProjects(['package.json', 'src/main.ts'])
```

## Known limitations

- Detection is marker-based; does not invoke engine tools
- Does not emit a session event on detection

## See also

- `@deepseek-ai/dsh-util-values/project-kind`
- `@deepseek-ai/dsh-util-values/workspace-discovery`
