/**
 * Pure helpers for validating plain configuration objects.
 *
 * These functions are stateless and perform no I/O: they read values from a
 * {@link ConfigObject}, enforce required presence and types, and throw on
 * invalid input. They hold no mutable state.
 *
 * @module @deepseek-ai/dsh-util-values/config-validation
 */

/** A JSON-like configuration value. */
export type ConfigValue =
  | string
  | number
  | boolean
  | null
  | ConfigObject
  | ConfigArray

/** A configuration object with string keys. */
export type ConfigObject = { [key: string]: ConfigValue }

/** A readonly array of configuration values. */
export type ConfigArray = readonly ConfigValue[]

/**
 * Read a required non-empty string from `config`.
 * @param config - configuration object to read from.
 * @param key - key to read.
 * @returns the string value.
 * @throws Error when the value is missing, not a string, or empty.
 */
export function requireString(config: ConfigObject, key: string): string {
  const value = config[key] as ConfigValue | undefined
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${key} must be a non-empty string`)
  }
  return value
}

/**
 * Read a required number from `config`, optionally bounded by `min` and `max`.
 * @param config - configuration object to read from.
 * @param key - key to read.
 * @param options - optional inclusive bounds.
 * @returns the number value.
 * @throws Error when the value is missing, not a number, `NaN`, or out of range.
 */
export function requireNumber(
  config: ConfigObject,
  key: string,
  options?: { min?: number; max?: number },
): number {
  const value = config[key] as ConfigValue | undefined
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new Error(`${key} must be a number`)
  }
  if (options?.min !== undefined && value < options.min) {
    throw new Error(`${key} must be at least ${options.min}`)
  }
  if (options?.max !== undefined && value > options.max) {
    throw new Error(`${key} must be at most ${options.max}`)
  }
  return value
}

/**
 * Read a required boolean from `config`.
 * @param config - configuration object to read from.
 * @param key - key to read.
 * @returns the boolean value.
 * @throws Error when the value is missing or not a boolean.
 */
export function requireBoolean(config: ConfigObject, key: string): boolean {
  const value = config[key] as ConfigValue | undefined
  if (typeof value !== 'boolean') {
    throw new Error(`${key} must be a boolean`)
  }
  return value
}

/**
 * Read an optional string from `config`.
 * @param config - configuration object to read from.
 * @param key - key to read.
 * @returns the string value, or `undefined` when absent or not a string.
 */
export function getOptionalString(config: ConfigObject, key: string): string | undefined {
  const value = config[key] as ConfigValue | undefined
  if (typeof value !== 'string') return undefined
  return value
}

/**
 * Ensure every key in `config` is in `allowed`.
 * @param config - configuration object to validate.
 * @param allowed - allowed keys.
 * @throws Error listing any unknown keys.
 */
export function validateKeys(config: ConfigObject, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed)
  const unknown = Object.keys(config).filter((key) => !allowedSet.has(key))
  if (unknown.length > 0) {
    unknown.sort()
    throw new Error(`Unknown config keys: ${unknown.join(', ')}`)
  }
}
