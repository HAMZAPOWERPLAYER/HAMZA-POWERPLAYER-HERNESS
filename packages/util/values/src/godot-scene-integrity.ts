/**
 * Structural integrity checks for parsed Godot scenes.
 *
 * Consumes the values produced by `parseGodotScene` together with the set of
 * file paths observed in a Godot project and reports findings in the
 * `GodotDiagnostic` shape. This is static analysis of the parsed scene table,
 * not a Godot import or editor check: it cannot resolve `ExtResource(...)`
 * identifiers written in node bodies, read `SubResource(...)` values, inspect
 * nodes that live inside an instanced scene, or evaluate scripts. All helpers
 * are deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/godot-scene-integrity
 */

import type { GodotDiagnostic } from './godot-diagnostics.ts'
import type { GodotScene } from './godot-scene-model.ts'

/** Result of validating one parsed scene. */
export interface GodotSceneIntegrityResult {
  /** All findings, in a stable check order. */
  readonly findings: readonly GodotDiagnostic[]
  /** Whether any error-severity findings were collected. */
  readonly hasErrors: boolean
  /** Whether any warning-severity findings were collected. */
  readonly hasWarnings: boolean
}

/**
 * Validate the structural integrity of one parsed scene against the observed
 * project files.
 *
 * The following checks run, in this order, so findings have a stable order:
 * an empty node table (warning); a node table without exactly one root node;
 * external resource paths that are empty or not among the observed files
 * (a `Script`-typed resource reports category `script`, others `resource`);
 * duplicate `ext_resource` identifiers; duplicate node names under the same
 * parent; node parent paths whose first segment matches no declared child of
 * the root; and signal connection endpoints that are neither `.` nor a
 * declared node path.
 *
 * Path matching treats `\` as `/`, ignores a `res://` prefix, a leading `./`
 * or `/`, and compares case-insensitively, so observed paths may be relative
 * to the project root or carry the `res://` prefix. With an empty
 * `observedPaths` every declared external resource is reported missing.
 * Deeper path segments are not validated when they fall under an instanced
 * node, because such segments name nodes inside another scene that this file
 * does not declare. Per-node `script = ExtResource(...)` and
 * `instance=ExtResource(...)` bindings are not part of the parsed model, so
 * the referenced identifiers are not validated here.
 *
 * @param scene - parsed scene values from `parseGodotScene`.
 * @param observedPaths - file paths observed in the project, in any supported prefix form.
 * @returns the findings in stable order plus the error and warning flags.
 */
export function validateGodotSceneIntegrity(
  scene: GodotScene,
  observedPaths: readonly string[],
): GodotSceneIntegrityResult {
  const findings: GodotDiagnostic[] = []
  const observed = new Set(observedPaths.map(normalizePath))

  checkSceneShape(scene, findings)
  checkResourcePaths(scene, observed, findings)
  checkResourceIds(scene, findings)
  checkNodeNames(scene, findings)
  checkParentPaths(scene, findings)
  checkConnections(scene, findings)

  return {
    findings,
    hasErrors: findings.some((finding) => finding.severity === 'error'),
    hasWarnings: findings.some((finding) => finding.severity === 'warning'),
  }
}

function checkSceneShape(scene: GodotScene, findings: GodotDiagnostic[]): void {
  if (scene.nodes.length === 0) {
    findings.push({
      severity: 'warning',
      category: 'scene',
      message: 'No nodes were read from the scene text.',
      file: null,
      suggestion: 'Verify the scene uses the documented .tscn subset with named [node] sections.',
    })
    return
  }
  const rootCount = scene.nodes.filter((node) => node.parent === null).length
  if (rootCount === 0) {
    findings.push({
      severity: 'error',
      category: 'node',
      message: 'Scene declares nodes but no root node.',
      file: null,
      suggestion: 'Declare exactly one node without a parent attribute.',
    })
  } else if (rootCount > 1) {
    findings.push({
      severity: 'error',
      category: 'node',
      message: `Scene declares ${rootCount} root nodes; a scene must declare exactly one root.`,
      file: null,
      suggestion: 'Declare exactly one node without a parent attribute.',
    })
  }
}

function checkResourcePaths(
  scene: GodotScene,
  observed: ReadonlySet<string>,
  findings: GodotDiagnostic[],
): void {
  for (const resource of scene.resources) {
    if (resource.path === '') {
      findings.push({
        severity: 'error',
        category: 'resource',
        message: `External resource "${resource.id}" declares no path.`,
        file: null,
        suggestion: 'Add a path attribute to the ext_resource declaration.',
      })
      continue
    }
    if (!observed.has(normalizePath(resource.path))) {
      findings.push({
        severity: 'error',
        category: resource.type === 'Script' ? 'script' : 'resource',
        message: `External resource path "${resource.path}" was not among the observed files.`,
        file: resource.path,
        suggestion:
          resource.type === 'Script'
            ? 'Ensure the script file exists in the project or correct the ext_resource path.'
            : 'Ensure the file exists in the project or correct the ext_resource path.',
      })
    }
  }
}

function checkResourceIds(scene: GodotScene, findings: GodotDiagnostic[]): void {
  const seen = new Set<string>()
  for (const resource of scene.resources) {
    if (seen.has(resource.id)) {
      findings.push({
        severity: 'error',
        category: 'resource',
        message: `Duplicate ext_resource id "${resource.id}".`,
        file: null,
        suggestion: 'Assign each ext_resource a unique id.',
      })
    } else {
      seen.add(resource.id)
    }
  }
}

function checkNodeNames(scene: GodotScene, findings: GodotDiagnostic[]): void {
  const seen = new Set<string>()
  for (const node of scene.nodes) {
    const key = JSON.stringify([node.parent, node.name])
    if (seen.has(key)) {
      findings.push({
        severity: 'error',
        category: 'node',
        message: `Duplicate node name "${node.name}" declared ${describeParent(node.parent)}.`,
        file: null,
        suggestion: 'Give the duplicate nodes distinct names.',
      })
    } else {
      seen.add(key)
    }
  }
}

function checkParentPaths(scene: GodotScene, findings: GodotDiagnostic[]): void {
  const rootChildNames = new Set(
    scene.nodes.filter((node) => node.parent === '.').map((node) => node.name),
  )
  for (const node of scene.nodes) {
    if (node.parent === null || node.parent === '.') continue
    const firstSegment = node.parent.split('/')[0]
    if (firstSegment === undefined || firstSegment === '' || !rootChildNames.has(firstSegment)) {
      findings.push({
        severity: 'error',
        category: 'node',
        message: `Node "${node.name}" declares parent path "${node.parent}", which matches no declared node.`,
        file: null,
        suggestion: 'Ensure the parent path starts with a declared child of the root, or use "." for the root itself.',
      })
    }
  }
}

function checkConnections(scene: GodotScene, findings: GodotDiagnostic[]): void {
  const nodePaths = new Map<string, boolean>()
  for (const node of scene.nodes) {
    if (node.parent === null) continue
    nodePaths.set(fullPathOf(node), node.instanced)
  }
  for (const connection of scene.connections) {
    if (!isKnownEndpoint(connection.from, nodePaths)) {
      findings.push({
        severity: 'error',
        category: 'connection',
        message: `Connection "${connection.signal}" references unknown source node path "${connection.from}".`,
        file: null,
        suggestion: 'Ensure from names "." or the path of a declared node.',
      })
    }
    if (!isKnownEndpoint(connection.to, nodePaths)) {
      findings.push({
        severity: 'error',
        category: 'connection',
        message: `Connection "${connection.signal}" references unknown target node path "${connection.to}".`,
        file: null,
        suggestion: 'Ensure to names "." or the path of a declared node.',
      })
    }
  }
}

/** Whether an endpoint names the root, a declared node, or a path inside an instanced node. */
function isKnownEndpoint(endpoint: string, nodePaths: ReadonlyMap<string, boolean>): boolean {
  if (endpoint === '.') return true
  if (nodePaths.has(endpoint)) return true
  const firstSegment = endpoint.split('/')[0]
  if (firstSegment === undefined || firstSegment === '') return false
  return nodePaths.get(firstSegment) === true
}

/** The root-relative path of a node that is not the scene root. */
function fullPathOf(node: { readonly name: string; readonly parent: string | null }): string {
  if (node.parent === null || node.parent === '.') return node.name
  return `${node.parent}/${node.name}`
}

function describeParent(parent: string | null): string {
  if (parent === null) return 'at the scene root'
  if (parent === '.') return 'under the scene root'
  return `under parent path "${parent}"`
}

function normalizePath(path: string): string {
  let normalized = path.replaceAll('\\', '/')
  if (normalized.toLowerCase().startsWith('res://')) normalized = normalized.slice('res://'.length)
  while (normalized.startsWith('./')) normalized = normalized.slice(2)
  while (normalized.startsWith('/')) normalized = normalized.slice(1)
  return normalized.toLowerCase()
}
