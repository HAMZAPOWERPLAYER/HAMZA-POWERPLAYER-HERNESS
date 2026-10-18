/**
 * Configuration validation and migration reliability.
 *
 * Provides schema validation for configuration objects, safe migration between
 * config schema versions, and preservation of user-defined settings during
 * migration. All helpers are pure: they validate and transform caller-supplied
 * objects, perform no I/O, and hold no state.
 *
 * @module @deepseek-ai/dsh-util-values/config-migration
 */

/** A validation problem found in a configuration object. */
export interface ConfigValidationProblem {
  /** Configuration path where the problem was found. */
  readonly path: string
  /** Human-readable problem description. */
  readonly message: string
  /** Severity of the problem. */
  readonly severity: 'error' | 'warning'
}

/** Result of validating a configuration object against a schema. */
export interface ConfigValidationResult {
  /** Whether the configuration is valid. */
  readonly valid: boolean
  /** Problems found during validation. */
  readonly problems: readonly ConfigValidationProblem[]
}

/** A schema rule for validating one configuration field. */
export interface ConfigFieldRule {
  /** Configuration path for this field. */
  readonly path: string
  /** Whether the field is required. */
  readonly required: boolean
  /** Expected type: 'string', 'number', 'boolean', 'object', 'array', or 'any'. */
  readonly type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  /** Allowed values, if restricted. */
  readonly allowedValues?: readonly unknown[]
  /** Minimum value, for numeric fields. */
  readonly min?: number
  /** Maximum value, for numeric fields. */
  readonly max?: number
  /** Custom validation function. */
  readonly validate?: (value: unknown) => ConfigValidationProblem | null
}

/** Validate a configuration object against field rules.
 * @param config - configuration object to validate.
 * @param rules - field rules to validate against.
 * @returns validation result.
 */
export function validateConfig(
  config: Record<string, unknown>,
  rules: readonly ConfigFieldRule[],
): ConfigValidationResult {
  const problems: ConfigValidationProblem[] = []
  const seenPaths = new Set<string>()

  for (const rule of rules) {
    seenPaths.add(rule.path)
    const value = config[rule.path]
    if (value === undefined || value === null) {
      if (rule.required) {
        problems.push({
          path: rule.path,
          message: `required field ${rule.path} is missing`,
          severity: 'error',
        })
      }
      continue
    }
    if (rule.type !== 'any') {
      const typeOk = checkType(value, rule.type)
      if (!typeOk) {
        problems.push({
          path: rule.path,
          message: `field ${rule.path} expected type ${rule.type}, got ${typeof value}`,
          severity: 'error',
        })
        continue
      }
    }
    if (rule.allowedValues !== undefined && !rule.allowedValues.includes(value)) {
      problems.push({
        path: rule.path,
        message: `field ${rule.path} value ${String(value)} is not in allowed values`,
        severity: 'error',
      })
    }
    if (typeof value === 'number' && (rule.min !== undefined || rule.max !== undefined)) {
      if (rule.min !== undefined && value < rule.min) {
        problems.push({
          path: rule.path,
          message: `field ${rule.path} value ${value} is below minimum ${rule.min}`,
          severity: 'error',
        })
      }
      if (rule.max !== undefined && value > rule.max) {
        problems.push({
          path: rule.path,
          message: `field ${rule.path} value ${value} exceeds maximum ${rule.max}`,
          severity: 'error',
        })
      }
    }
    if (rule.validate !== undefined) {
      const customProblem = rule.validate(value)
      if (customProblem !== null) {
        problems.push(customProblem)
      }
    }
  }

  return { valid: problems.length === 0, problems }
}

/** Check whether a value matches an expected type. */
function checkType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value)
    case 'array':
      return Array.isArray(value)
    case 'any':
      return true
    default:
      return false
  }
}

/** Migration step for one config schema version. */
export interface ConfigMigrationStep {
  /** Source schema version. */
  readonly from: string
  /** Target schema version. */
  readonly to: string
  /** Migrate one config object. Returns null when migration is not possible. */
  readonly migrate: (config: Record<string, unknown>) => Record<string, unknown> | null
}

/** Result of migrating a configuration object. */
export interface ConfigMigrationResult {
  /** Migrated config, or null when migration failed. */
  readonly migratedConfig: Record<string, unknown> | null
  /** Problems encountered during migration. */
  readonly problems: readonly ConfigValidationProblem[]
  /** Whether migration succeeded. */
  readonly migrated: boolean
}

/** Migrate a config object through a chain of migration steps.
 *
 * Steps are applied in order until the target version is reached. Unknown
 * intermediate versions stop migration with an error.
 *
 * @param config - config to migrate.
 * @param steps - ordered migration steps.
 * @param fromVersion - current schema version.
 * @param toVersion - target schema version.
 * @returns migration result.
 */
export function migrateConfig(
  config: Record<string, unknown>,
  steps: readonly ConfigMigrationStep[],
  fromVersion: string,
  toVersion: string,
): ConfigMigrationResult {
  const problems: ConfigValidationProblem[] = []
  let current = { ...config }
  let currentVersion = fromVersion

  while (currentVersion !== toVersion) {
    const step = steps.find((s) => s.from === currentVersion)
    if (step === undefined) {
      problems.push({
        path: 'schema',
        message: `no migration step from ${currentVersion} to ${toVersion}`,
        severity: 'error',
      })
      return { migratedConfig: null, problems, migrated: false }
    }
    const migrated = step.migrate(current)
    if (migrated === null) {
      problems.push({
        path: 'schema',
        message: `migration from ${currentVersion} to ${step.to} failed`,
        severity: 'error',
      })
      return { migratedConfig: null, problems, migrated: false }
    }
    current = migrated
    currentVersion = step.to
  }

  return { migratedConfig: current, problems, migrated: true }
}

/** Preserve user-defined settings during migration.
 *
 * Fields present in the user config but not in the migrated config are
 * preserved under a `_preserved` key, keyed by their original path.
 *
 * @param migrated - migrated config.
 * @param userConfig - original user config.
 * @param preservedPaths - paths to preserve from the user config.
 * @returns merged config with preserved fields.
 */
export function preserveUserSettings(
  migrated: Record<string, unknown>,
  userConfig: Record<string, unknown>,
  preservedPaths: readonly string[],
): Record<string, unknown> {
  const result = { ...migrated }
  const preserved: Record<string, unknown> = {}
  for (const path of preservedPaths) {
    if (path in userConfig) {
      preserved[path] = userConfig[path]
    }
  }
  if (Object.keys(preserved).length > 0) {
    result._preserved = preserved
  }
  return result
}

/** Check whether a migrated config still contains required fields.
 * @param config - migrated config object.
 * @param requiredFields - required field paths.
 * @returns list of missing field paths, sorted.
 */
export function checkConfigCompleteness(
  config: Record<string, unknown>,
  requiredFields: readonly string[],
): readonly string[] {
  const missing: string[] = []
  for (const field of requiredFields) {
    if (!(field in config)) {
      missing.push(field)
    }
  }
  return missing.sort()
}
