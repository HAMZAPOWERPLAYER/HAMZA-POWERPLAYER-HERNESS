/**
 * Safe multi-file editing primitives.
 *
 * These helpers validate edit preconditions, track a pending multi-file
 * transaction, and compute change impact. They perform no filesystem I/O:
 * callers supply the observed file contents and apply the edits themselves.
 * Every operation is pure and returns a new value.
 *
 * @module @deepseek-ai/dsh-util-values/multi-file-edit
 */

/** A proposed edit to one file. */
export interface FileEdit {
  /** File path being edited. */
  readonly path: string
  /** Expected current content, used as a precondition. */
  readonly expectedContent: string
  /** New content to write when the precondition holds. */
  readonly newContent: string
  /** Whether this edit is allowed to create the file when absent. */
  readonly allowCreate: boolean
}



/** A validated edit ready to apply. */
export interface ValidatedEdit {
  /** File path being edited. */
  readonly path: string
  /** New content to write. */
  readonly newContent: string
}

/** One file's observed state. */
export interface EditedFile {
  /** File path. */
  readonly path: string
  /** Current content, or null when the file is absent. */
  readonly content: string | null
}

/** Result of validating edits against observed files. */
export interface EditValidationResult {
  /** Edits whose preconditions all hold. */
  readonly valid: readonly ValidatedEdit[]
  /** Edits that cannot proceed, with reasons. */
  readonly invalid: readonly EditRejection[]
  /** Whether every edit is valid. */
  readonly allValid: boolean
}

/** One rejected edit with its reason. */
export interface EditRejection {
  /** File path being edited. */
  readonly path: string
  /** Why the edit cannot proceed. */
  readonly reason: string
}

/** One file's entry in a pending transaction. */
export interface PendingEdit {
  /** File path being edited. */
  readonly path: string
  /** New content to write. */
  readonly newContent: string
  /** Whether the edit creates a new file. */
  readonly create: boolean
}

/** A pending multi-file transaction. */
export interface EditTransaction {
  /** Edits staged in declaration order. */
  readonly edits: readonly PendingEdit[]
  /** Whether every staged edit passed validation. */
  readonly allValid: boolean
}

/** Validate one edit against observed file state.
 * @param edit - edit to validate.
 * @param observed - observed file states.
 * @returns validation result.
 */
export function validateEdit(
  edit: FileEdit,
  observed: readonly EditedFile[],
): EditValidationResult {
  const byPath = new Map(observed.map(file => [file.path, file]))
  const observedFile = byPath.get(edit.path)
  const invalid: EditRejection[] = []
  if (observedFile === undefined) {
    if (!edit.allowCreate) {
      invalid.push({
        path: edit.path,
        reason: `file ${edit.path} is absent and creation is not allowed`,
      })
      return { valid: [], invalid, allValid: false }
    }
    return {
      valid: [{ path: edit.path, newContent: edit.newContent }],
      invalid: [],
      allValid: true,
    }
  }
  if (observedFile.content !== edit.expectedContent) {
    invalid.push({
      path: edit.path,
      reason: `file ${edit.path} content does not match expected precondition`,
    })
    return { valid: [], invalid, allValid: false }
  }
  return {
    valid: [{ path: edit.path, newContent: edit.newContent }],
    invalid: [],
    allValid: true,
  }
}

/** Validate many edits against observed file state.
 * @param edits - edits to validate.
 * @param observed - observed file states.
 * @returns aggregated validation result.
 */
export function validateEdits(
  edits: readonly FileEdit[],
  observed: readonly EditedFile[],
): EditValidationResult {
  const valid: ValidatedEdit[] = []
  const invalid: EditRejection[] = []
  for (const edit of edits) {
    const result = validateEdit(edit, observed)
    valid.push(...result.valid)
    invalid.push(...result.invalid)
  }
  return { valid, invalid, allValid: invalid.length === 0 }
}

/** Stage edits into a transaction after validation.
 * @param edits - edits to stage.
 * @param observed - observed file states.
 * @returns edit transaction.
 */
export function stageEdits(
  edits: readonly FileEdit[],
  observed: readonly EditedFile[],
): EditTransaction {
  const result = validateEdits(edits, observed)
  const pending: PendingEdit[] = result.valid.map(edit => ({
    path: edit.path,
    newContent: edit.newContent,
    create: !observed.some(file => file.path === edit.path && file.content !== null),
  }))
  return { edits: pending, allValid: result.allValid }
}

/** Apply staged edits to observed file state, returning new observed state.
 * @param transaction - transaction to apply.
 * @param observed - current observed file states.
 * @returns updated observed file states.
 */
export function applyEdits(
  transaction: EditTransaction,
  observed: readonly EditedFile[],
): EditedFile[] {
  const byPath = new Map(observed.map(file => [file.path, file]))
  for (const edit of transaction.edits) {
    byPath.set(edit.path, { path: edit.path, content: edit.newContent })
  }
  return [...byPath.values()]
}

/** One file change in a diff. */
export interface FileEditChange {
  /** File path. */
  readonly path: string
  /** Change kind. */
  readonly kind: 'added' | 'modified' | 'removed'
  /** Previous content, null when added. */
  readonly previousContent: string | null
  /** New content, null when removed. */
  readonly newContent: string | null
}

/** Compute the change impact between before and after file states.
 * @param before - file states before the change.
 * @param after - file states after the change.
 * @returns list of file changes.
 */
export function computeChangeImpact(
  before: readonly EditedFile[],
  after: readonly EditedFile[],
): readonly FileEditChange[] {
  const afterByPath = new Map(after.map(file => [file.path, file]))
  const changes: FileEditChange[] = []
  const seen = new Set<string>()
  for (const file of before) {
    seen.add(file.path)
    const afterFile = afterByPath.get(file.path)
    if (afterFile === undefined) {
      changes.push({
        path: file.path,
        kind: 'removed',
        previousContent: file.content,
        newContent: null,
      })
    } else if (file.content !== afterFile.content) {
      changes.push({
        path: file.path,
        kind: 'modified',
        previousContent: file.content,
        newContent: afterFile.content,
      })
    }
  }
  for (const file of after) {
    if (seen.has(file.path)) continue
    changes.push({
      path: file.path,
      kind: 'added',
      previousContent: null,
      newContent: file.content,
    })
  }
  return changes
}

/** Files that reference a given path, detected by exact text occurrence.
 * @param path - path to search for in file contents.
 * @param files - observed files to search.
 * @returns file paths that reference the given path, sorted.
 */
export function findReferencingFiles(
  path: string,
  files: readonly EditedFile[],
): readonly string[] {
  return files
    .filter(file => file.content !== null && file.content.includes(path))
    .map(file => file.path)
    .sort()
}
