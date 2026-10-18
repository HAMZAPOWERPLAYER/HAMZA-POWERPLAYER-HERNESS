/** Duplicate-install-safe JSON and immutable-value helpers. @module @deepseek-ai/dsh-util-values */

/** A value that round-trips through JSON without loss. */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

/**
 * Mark an unreachable closed-union branch.
 * @param value - impossible value; an unhandled typed variant fails at the call site.
 * @param context - optional switch-site label included in the failure message.
 * @returns never; a runtime value that escaped its type always throws.
 */
export function assertNever(value: never, context?: string): never {
  const rendered = (JSON.stringify(value) as string | undefined) ?? String(value)
  throw new Error(`unreachable variant${context ? ` in ${context}` : ''}: ${rendered}`)
}

/** Whether a realm-owned intrinsic prototype has a native constructor matching this engine's representation. */
function hasIntrinsicConstructor(prototype: object, name: 'Array' | 'Object'): boolean {
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'constructor')
  const constructor: unknown = descriptor?.value
  if (typeof constructor !== 'function') return false
  try {
    return constructor.name === name
      && constructor.prototype === prototype
      && Function.prototype.toString.call(constructor) === Function.prototype.toString.call(name === 'Array' ? Array : Object)
  } catch {
    return false
  }
}

/** Whether a candidate is one realm's intrinsic `Object.prototype`. */
function isIntrinsicObjectPrototype(value: object): boolean {
  return Object.getPrototypeOf(value) === null && hasIntrinsicConstructor(value, 'Object')
}

/** Whether an array uses one realm's intrinsic `Array.prototype`, not a subclass or forged prototype. */
function hasPlainArrayPrototype(value: unknown[]): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  if (!Array.isArray(prototype) || !hasIntrinsicConstructor(prototype, 'Array')) return false
  const objectPrototype: unknown = Object.getPrototypeOf(prototype)
  return typeof objectPrototype === 'object'
    && objectPrototype !== null
    && isIntrinsicObjectPrototype(objectPrototype)
}

/** Whether an object is a plain or null-prototype record from any JavaScript realm. */
function hasPlainObjectPrototype(value: object): boolean {
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === null
    || typeof prototype === 'object' && isIntrinsicObjectPrototype(prototype)
}

/** Return every JSON-visible object key, or reject own data JSON would discard. */
function enumerableStringKeys(value: object): string[] | undefined {
  const keys = Reflect.ownKeys(value)
  if (keys.some(key => typeof key !== 'string' || !Object.prototype.propertyIsEnumerable.call(value, key))) return undefined
  return keys as string[]
}

type SnapshotDestination =
  | { kind: 'root' }
  | { kind: 'array'; target: JsonValue[]; index: number }
  | { kind: 'object'; target: { [key: string]: JsonValue }; key: string }

type JsonWalkTask =
  | { kind: 'visit'; value: unknown; destination?: SnapshotDestination }
  | { kind: 'array-item'; source: unknown[]; index: number; target?: JsonValue[] }
  | { kind: 'object-property'; source: Record<string, unknown>; key: string; target?: { [key: string]: JsonValue } }
  | { kind: 'leave'; source: object }

/** Validate lossless JSON iteratively, optionally materializing a detached snapshot. */
function walkJsonValue(value: unknown, detach: boolean): JsonValue | true | undefined {
  const ancestors = new Set<object>()
  let root: JsonValue | undefined
  const assign = (destination: SnapshotDestination | undefined, item: JsonValue): void => {
    if (destination === undefined) return
    if (destination.kind === 'root') {
      root = item
    } else if (destination.kind === 'array') {
      destination.target[destination.index] = item
    } else {
      Object.defineProperty(destination.target, destination.key, {
        value: item,
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
  }

  const tasks: JsonWalkTask[] = [{
    kind: 'visit',
    value,
    ...(detach ? { destination: { kind: 'root' } as const } : {}),
  }]
  for (let task = tasks.pop(); task !== undefined; task = tasks.pop()) {
    if (task.kind === 'leave') {
      ancestors.delete(task.source)
      continue
    }
    if (task.kind === 'array-item') {
      if (!Object.prototype.hasOwnProperty.call(task.source, task.index)) return undefined
      tasks.push({
        kind: 'visit',
        value: task.source[task.index],
        ...(task.target === undefined ? {} : { destination: { kind: 'array', target: task.target, index: task.index } as const }),
      })
      continue
    }
    if (task.kind === 'object-property') {
      tasks.push({
        kind: 'visit',
        value: task.source[task.key],
        ...(task.target === undefined ? {} : { destination: { kind: 'object', target: task.target, key: task.key } as const }),
      })
      continue
    }

    const current = task.value
    if (current === null) {
      assign(task.destination, null)
      continue
    }
    if (typeof current === 'boolean' || typeof current === 'string') {
      assign(task.destination, current)
      continue
    }
    if (typeof current === 'number') {
      if (!Number.isFinite(current) || Object.is(current, -0)) return undefined
      assign(task.destination, current)
      continue
    }
    if (typeof current !== 'object') return undefined
    if (ancestors.has(current)) return undefined

    if (Array.isArray(current)) {
      if (!hasPlainArrayPrototype(current)) return undefined
      const length = current.length
      if (Reflect.ownKeys(current).length !== length + 1) return undefined
      const target = detach ? [] as JsonValue[] : undefined
      if (target !== undefined) assign(task.destination, target)
      ancestors.add(current)
      tasks.push({ kind: 'leave', source: current })
      for (let index = length - 1; index >= 0; index--) {
        tasks.push({ kind: 'array-item', source: current, index, ...(target === undefined ? {} : { target }) })
      }
      continue
    }

    if (!hasPlainObjectPrototype(current)) return undefined
    const keys = enumerableStringKeys(current)
    if (keys === undefined) return undefined
    const target = detach ? {} as { [key: string]: JsonValue } : undefined
    if (target !== undefined) assign(task.destination, target)
    ancestors.add(current)
    tasks.push({ kind: 'leave', source: current })
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]
      /* v8 ignore next -- the loop is bounded by the captured key count. */
      if (key === undefined) return undefined
      tasks.push({ kind: 'object-property', source: current as Record<string, unknown>, key, ...(target === undefined ? {} : { target }) })
    }
  }
  return detach ? root : true
}

/**
 * Validate and detach lossless JSON in one read per property.
 * @param value - candidate value to validate and detach.
 * @returns the detached snapshot, or `undefined` when the value is not losslessly JSON-serializable.
 */
export function snapshotJsonValue<T>(value: T): T | undefined {
  return walkJsonValue(value, true) as T | undefined
}

/**
 * Test the same lossless JSON rules as {@link snapshotJsonValue} without detaching the value.
 * @param value - candidate value to test.
 * @returns whether the value survives a JSON round trip without loss.
 */
export function isJsonValue(value: unknown): boolean {
  return walkJsonValue(value, false) === true
}

/**
 * Compare JSON-compatible values structurally.
 * @param a - one JSON-compatible value.
 * @param b - the other JSON-compatible value.
 * @returns whether both values contain the same JSON data.
 */
export function deepEqualJson(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false
    return a.every((entry, index) => deepEqualJson(entry, b[index]))
  }
  const left = a as Record<string, unknown>
  const right = b as Record<string, unknown>
  const keys = Object.keys(left)
  if (keys.length !== Object.keys(right).length) return false
  return keys.every(key => key in right && deepEqualJson(left[key], right[key]))
}

/**
 * Deep-freeze an object graph in place while leaving live AbortSignal objects mutable.
 * @param value - value to freeze.
 * @returns the same value after every reachable enumerable child is frozen.
 */
export function deepFreeze<T>(value: T): T {
  const seen = new WeakSet<object>()
  const pending: (
    | { kind: 'visit'; node: unknown }
    | { kind: 'property'; source: Record<string, unknown>; key: string }
  )[] = [{ kind: 'visit', node: value }]
  while (pending.length > 0) {
    const task = pending.pop()
    /* v8 ignore next -- the loop condition guarantees one pending task. */
    if (task === undefined) continue
    if (task.kind === 'property') {
      pending.push({ kind: 'visit', node: task.source[task.key] })
      continue
    }
    const node = task.node
    if (node === null || typeof node !== 'object') continue
    if (node instanceof AbortSignal) continue
    if (seen.has(node)) continue
    seen.add(node)
    Object.freeze(node)
    const keys = Object.keys(node)
    for (let index = keys.length - 1; index >= 0; index--) {
      const key = keys[index]
      /* v8 ignore next -- the loop is bounded by the captured key count. */
      if (key === undefined) continue
      pending.push({ kind: 'property', source: node as Record<string, unknown>, key })
    }
  }
  return value
}

/**
 * Weak-key lookup with a strongly retained iterable set of associated values.
 *
 * Each value must belong to only one key. The container performs no automatic
 * cleanup; owners delete associations or clear the container at lifecycle end.
 */
export class WeakMapWithValues<Key extends object, Value> {
  private keys = new WeakMap<Key, Value>()
  private readonly valueSet = new Set<Value>()
  /** Live strongly retained values in insertion order. */
  readonly values: ReadonlySet<Value> = this.valueSet

  /**
   * Read the value associated with a key.
   * @param key - weakly held lookup key.
   * @returns the associated value, or absence.
   */
  get(key: Key): Value | undefined {
    return this.keys.get(key)
  }

  /**
   * Test whether a key has an association.
   * @param key - weakly held lookup key.
   * @returns whether the key is present.
   */
  has(key: Key): boolean {
    return this.keys.has(key)
  }

  /**
   * Associate one key with one caller-unique value.
   * @param key - weakly held lookup key.
   * @param value - strongly retained value that belongs to no other key.
   * @returns this container.
   */
  set(key: Key, value: Value): this {
    if (this.keys.has(key)) {
      const previous = this.keys.get(key) as Value
      if (previous === value) return this
      this.valueSet.delete(previous)
    }
    this.keys.set(key, value)
    this.valueSet.add(value)
    return this
  }

  /**
   * Remove one association and its strongly retained value.
   * @param key - weakly held lookup key.
   * @returns whether an association was removed.
   */
  delete(key: Key): boolean {
    if (!this.keys.has(key)) return false
    const value = this.keys.get(key) as Value
    const deleted = this.keys.delete(key)
    this.valueSet.delete(value)
    return deleted
  }

  /** Remove every association and strongly retained value. */
  clear(): void {
    this.keys = new WeakMap()
    this.valueSet.clear()
  }
}

export { PartialArguments, type LengthReadOptions } from './partial-json.ts'
export * from './verification.ts'
export * from './project-kind.ts'
export * from './task-state.ts'
export * from './secret-redaction.ts'
export * from './path-safety.ts'
export * from './completion-report.ts'
export * from './retry-policy.ts'
export * from './context-budget.ts'
export * from './config-validation.ts'
export * from './tool-risk.ts'
export * from './error-classification.ts'
export * from './model-capabilities.ts'
export * from './workspace-discovery.ts'
export * from './rate-limit.ts'
export * from './text-truncation.ts'
export * from './change-summary.ts'
export * from './ignore-rules.ts'
export * from './test-plan.ts'
export * from './identifier.ts'
export * from './token-estimate.ts'
export * from './approval-policy.ts'
export * from './tool-registry-model.ts'
export * from './redaction-report.ts'
export * from './budget-guard.ts'
export * from './progress-tracker.ts'
export * from './environment-diagnostics.ts'
export * from './unity-meta-audit.ts'
export * from './godot-export-presets.ts'
export * from './godot-scene-model.ts'
export * from './android-gradle-model.ts'
export * from './benchmark-protocol.ts'
export * from './flutter-pubspec-model.ts'
export * from './unity-test-results.ts'
export * from './git-diff-model.ts'
export * from './mcp-tool-model.ts'
export * from './session-log-redaction.ts'
export * from './test-coverage-gate.ts'
export * from './command-safety.ts'
export * from './agent-prompt-model.ts'
export * from './test-result-aggregator.ts'
export * from './unity-project-model.ts'
export * from './godot-project-model.ts'
export * from './ini-subset.ts'
export * from './android-manifest-model.ts'
export * from './log-digest.ts'
export * from './latency-histogram.ts'
export * from './portable-path.ts'
export * from './command-plan.ts'
export * from './dependency-pinning.ts'
export * from './license-policy.ts'
export * from './flaky-test-detector.ts'
export * from './flutter-deps.ts'
export * from './task-planning-engine.ts'
export * from './unity-csharp-project.ts'
export * from './security-policy.ts'
export * from './asset-reference.ts'
export * from './codebase-understanding.ts'
export * from './multi-file-edit.ts'
export * from './error-memory.ts'
export * from './security-audit.ts'
export * from './config-migration.ts'
export * from './game-project-detector.ts'
export * from './game-task-spec.ts'
export * from './game-architecture.ts'
export * from './unity-diagnostics.ts'
export * from './godot-diagnostics.ts'
export * from './player-movement.ts'
export * from './enemy-ai.ts'
export * from './interaction-puzzle.ts'
export * from './game-ui.ts'
export * from './horror-game.ts'
export * from './asset-pipeline.ts'
export * from './animation-system.ts'
export * from './mobile-optimization.ts'
export * from './game-testing.ts'
export * from './game-performance.ts'
export * from './vertical-slice.ts'
export * from './game-multi-agent.ts'
export * from './game-knowledge-base.ts'
export * from './game-audio.ts'
export * from './game-design-tasks.ts'
export * from './game-lifecycle-audit.ts'
export * from './game-performance-triage.ts'
export * from './workspace-trust.ts'
export * from './unity-reference-integrity.ts'
export * from './godot-scene-integrity.ts'
export * from './game-state-sync.ts'
export * from './game-reliability.ts'
export * from './game-integration-review.ts'
export * from './game-quality-gate.ts'
export * from './game-request-router.ts'
export * from './unity-codegen.ts'
export * from './godot-codegen.ts'
export * from './agent-loop-state.ts'
export * from './execution-budget.ts'
export * from './model-task-classifier.ts'
export * from './model-router.ts'
export * from './context-provenance.ts'
export * from './project-memory.ts'
export * from './task-recovery.ts'
export * from './idempotency.ts'
