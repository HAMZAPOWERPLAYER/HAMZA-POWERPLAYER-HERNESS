/**
 * A documented subset reader for Godot `.tscn` scene files.
 *
 * The reader extracts the node table, external resources, and signal
 * connections from scene text. It scans the text with regular expressions
 * instead of parsing the full Godot resource format, so it reads double-quoted
 * attributes in any order but cannot resolve `ExtResource(...)` references,
 * `SubResource(...)`, variables, or multi-line strings. All helpers are
 * deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/godot-scene-model
 */

/** One node declared in a scene. */
export interface GodotSceneNode {
  /** Node name as declared in `name`. */
  readonly name: string
  /** Node class or built-in type from `type`. */
  readonly type: string | null
  /** Parent path from `parent`; `null` for the scene root. */
  readonly parent: string | null
  /** Whether the node is an instanced scene (`instance=ExtResource(...)`). */
  readonly instanced: boolean
}

/** One external resource declared in a scene. */
export interface GodotSceneResource {
  readonly id: string
  readonly path: string
  readonly type: string | null
}

/** One signal connection declared in a scene. */
export interface GodotSceneConnection {
  readonly signal: string
  readonly from: string
  readonly to: string
  readonly method: string
}

/** Scene values read from `.tscn` text. */
export interface GodotScene {
  readonly nodes: readonly GodotSceneNode[]
  readonly resources: readonly GodotSceneResource[]
  readonly connections: readonly GodotSceneConnection[]
  readonly rootNodeNames: readonly string[]
}

/** Read a documented subset of a `.tscn` scene.
 * @param text - scene file text.
 * @returns the parsed scene values.
 */
export function parseGodotScene(text: string): GodotScene {
  const nodes: GodotSceneNode[] = []
  const resources: GodotSceneResource[] = []
  const connections: GodotSceneConnection[] = []

  const nodePattern = /\[node\s+([^\]]*)\]/g
  let match: RegExpExecArray | null
  while ((match = nodePattern.exec(text)) !== null) {
    const attrs = readAttributes(match[1] ?? '')
    const name = attrs.get('name') ?? ''
    if (name === '') continue
    const parent = attrs.get('parent') ?? null
    const instanced = (attrs.get('instance') ?? '').startsWith('ExtResource')
    const type = attrs.get('type') ?? null
    nodes.push({ name, type, parent, instanced })
  }

  const resourcePattern = /\[ext_resource\s+([^\]]*)\]/g
  while ((match = resourcePattern.exec(text)) !== null) {
    const attrs = readAttributes(match[1] ?? '')
    const id = attrs.get('id') ?? ''
    if (id === '') continue
    resources.push({ id, path: attrs.get('path') ?? '', type: attrs.get('type') ?? null })
  }

  const connectionPattern = /\[connection\s+([^\]]*)\]/g
  while ((match = connectionPattern.exec(text)) !== null) {
    const attrs = readAttributes(match[1] ?? '')
    const signal = attrs.get('signal') ?? ''
    if (signal === '') continue
    connections.push({
      signal,
      from: attrs.get('from') ?? '',
      to: attrs.get('to') ?? '',
      method: attrs.get('method') ?? '',
    })
  }

  const rootNodeNames = nodes
    .filter((node) => node.parent === null)
    .map((node) => node.name)

  return { nodes, resources, connections, rootNodeNames }
}

/** Count how many nodes are instanced scenes.
 * @param scene - parsed scene.
 * @returns the number of instanced scene nodes.
 */
export function countInstancedScenes(scene: GodotScene): number {
  return scene.nodes.filter((node) => node.instanced).length
}

/** Render a one-line scene summary.
 * @param scene - parsed scene.
 * @returns the summary line.
 */
export function formatGodotSceneSummary(scene: GodotScene): string {
  return `nodes=${scene.nodes.length} instanced=${countInstancedScenes(scene)} resources=${scene.resources.length} connections=${scene.connections.length} roots=${scene.rootNodeNames.length}`
}

function readAttributes(body: string): Map<string, string> {
  const attrs = new Map<string, string>()
  const pattern = /([A-Za-z_][\w/]*)\s*=\s*(?:"([^"]*)"|([^\s\]]+))/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(body)) !== null) {
    const key = match[1] ?? ''
    if (key !== '') attrs.set(key, match[2] ?? match[3] ?? '')
  }
  return attrs
}
