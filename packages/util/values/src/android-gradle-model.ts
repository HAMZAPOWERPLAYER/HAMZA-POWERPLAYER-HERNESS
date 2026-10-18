/**
 * Regex-based extraction of Android SDK levels and identifiers from Gradle
 * build-script text, for either the Groovy or the Kotlin DSL.
 *
 * Recognized declarations, all on one line and with a single-quoted,
 * double-quoted, or bare value:
 *
 * - `minSdk 21`, `minSdkVersion 21`, `minSdk = 21`, `minSdkVersion = 21`
 * - `targetSdk 33`, `targetSdkVersion 33`, `targetSdk = 33`, `targetSdkVersion = 33`
 * - `compileSdk 34`, `compileSdkVersion 34`, `compileSdk = 34`, `compileSdkVersion = 34`
 * - `applicationId "com.example.app"`, `applicationId 'com.example.app'`, `applicationId = "com.example.app"`
 * - `namespace "com.example.app"`, `namespace 'com.example.app'`, `namespace = "com.example.app"`
 *
 * Reading rules:
 *
 * - A later occurrence of a field replaces an earlier one, so each reported
 *   value is the last match in the file; a flavor or build-type override
 *   written after `defaultConfig` therefore wins.
 * - A line whose first non-whitespace characters are `//` or `#` is skipped
 *   entirely, so a commented-out declaration never contributes a value.
 * - A level is a decimal integer. An expression such as
 *   `minSdkVersion flutter.minSdkVersion`, a version-catalog reference, a
 *   fractional number, or a quoted non-integer leaves the field `null`.
 *
 * Limits of this regex subset: the reader does not evaluate the build script.
 * It does not resolve variables, properties, catalog aliases, string
 * concatenation, conditionals, or plugin-applied configuration; it does not
 * recognize block comments or declarations split across lines; and a
 * declaration it cannot read as a literal is reported as `null` rather than
 * resolved. Treat the result as review input, never as the build's effective
 * configuration.
 *
 * Every function is deterministic, holds no state, and performs no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/android-gradle-model
 */

import { auditAndroidSdkLevels, type AndroidSdkPolicy } from './android-manifest-model.ts'

/** Reviewable Android values read from one Gradle build script. */
export interface GradleAndroidConfig {
  /** `applicationId` string, or `null` when the script declares none. */
  readonly applicationId: string | null
  /** `namespace` string, or `null` when the script declares none. */
  readonly namespace: string | null
  /** `minSdk` or `minSdkVersion` level, or `null` when absent or not a decimal integer. */
  readonly minSdkVersion: number | null
  /** `targetSdk` or `targetSdkVersion` level, or `null` when absent or not a decimal integer. */
  readonly targetSdkVersion: number | null
  /** `compileSdk` or `compileSdkVersion` level, or `null` when absent or not a decimal integer. */
  readonly compileSdkVersion: number | null
}

/**
 * Build a global pattern for one SDK-level declaration.
 *
 * The pattern accepts a bare field name or a `Version`-suffixed one, an
 * optional `=` (the Groovy call style omits it), and a single-quoted,
 * double-quoted, or bare decimal integer. The leading `[^A-Za-z0-9_]` keeps a
 * longer identifier such as `myMinSdk` from matching, and the trailing
 * `(?![.\w])` rejects a fractional or suffixed number such as `34.0` or `21L`.
 *
 * @param baseName - field name without the optional `Version` suffix, such as `minSdk`.
 * @returns a pattern with the `g` flag whose capture groups hold the single-quoted, double-quoted, and bare value, in that order.
 */
function sdkLevelPattern(baseName: string): RegExp {
  return new RegExp(
    `(?:^|[^A-Za-z0-9_])${baseName}(?:Version)?\\s*(?:=\\s*)?(?:'(-?\\d+)'|"(-?\\d+)"|(-?\\d+)(?![.\\w]))`,
    'g',
  )
}

/**
 * Build a global pattern for one quoted identifier declaration.
 *
 * Only a single- or double-quoted string counts, with or without `=`, so a
 * longer property name such as `applicationIdSuffix` never reads as
 * `applicationId`.
 *
 * @param name - property name, such as `applicationId`.
 * @returns a pattern with the `g` flag whose capture groups hold the single-quoted and double-quoted value, in that order.
 */
function identifierPattern(name: string): RegExp {
  return new RegExp(`(?:^|[^A-Za-z0-9_])${name}\\s*(?:=\\s*)?(?:'([^']*)'|"([^"]*)")`, 'g')
}

/** `minSdk`/`minSdkVersion` declaration of the minimum SDK level. */
const MIN_SDK_PATTERN = sdkLevelPattern('minSdk')

/** `targetSdk`/`targetSdkVersion` declaration of the target SDK level. */
const TARGET_SDK_PATTERN = sdkLevelPattern('targetSdk')

/** `compileSdk`/`compileSdkVersion` declaration of the compile SDK level. */
const COMPILE_SDK_PATTERN = sdkLevelPattern('compileSdk')

/** `applicationId` declaration with a quoted string value. */
const APPLICATION_ID_PATTERN = identifierPattern('applicationId')

/** `namespace` declaration with a quoted string value. */
const NAMESPACE_PATTERN = identifierPattern('namespace')

/**
 * Read the last level declared on one line.
 *
 * @param line - one trimmed, non-comment build-script line.
 * @param pattern - global pattern built by {@link sdkLevelPattern}.
 * @returns the last level the line declares, or `undefined` when it declares none.
 */
function readLastLevel(line: string, pattern: RegExp): number | undefined {
  let level: number | undefined
  for (const match of line.matchAll(pattern)) {
    const raw = match[1] ?? match[2] ?? match[3]
    if (raw === undefined) continue
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) level = parsed
  }
  return level
}

/**
 * Read the last quoted identifier declared on one line.
 *
 * @param line - one trimmed, non-comment build-script line.
 * @param pattern - global pattern built by {@link identifierPattern}.
 * @returns the last quoted value the line declares, or `undefined` when it declares none.
 */
function readLastIdentifier(line: string, pattern: RegExp): string | undefined {
  let value: string | undefined
  for (const match of line.matchAll(pattern)) {
    value = match[1] ?? match[2]
  }
  return value
}

/**
 * Read the Android SDK levels and identifiers from Gradle build-script text.
 *
 * Accepts the Groovy call and Kotlin assignment spellings listed on this
 * module, with a single-quoted, double-quoted, or bare decimal integer for a
 * level and a single- or double-quoted string for `applicationId` and
 * `namespace`. A line whose first non-whitespace characters are `//` or `#` is
 * skipped, and the last match in the file wins for each field. The function
 * never throws: text that declares no readable value yields `null` fields.
 *
 * @param text - full contents of a Gradle build script, Groovy or Kotlin DSL.
 * @returns the parsed values; see this module's documentation for the limits of the regex subset.
 */
export function parseGradleAndroidConfig(text: string): GradleAndroidConfig {
  let applicationId: string | null = null
  let namespace: string | null = null
  let minSdkVersion: number | null = null
  let targetSdkVersion: number | null = null
  let compileSdkVersion: number | null = null

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('//') || line.startsWith('#')) continue
    applicationId = readLastIdentifier(line, APPLICATION_ID_PATTERN) ?? applicationId
    namespace = readLastIdentifier(line, NAMESPACE_PATTERN) ?? namespace
    minSdkVersion = readLastLevel(line, MIN_SDK_PATTERN) ?? minSdkVersion
    targetSdkVersion = readLastLevel(line, TARGET_SDK_PATTERN) ?? targetSdkVersion
    compileSdkVersion = readLastLevel(line, COMPILE_SDK_PATTERN) ?? compileSdkVersion
  }

  return { applicationId, namespace, minSdkVersion, targetSdkVersion, compileSdkVersion }
}

/**
 * Audit Gradle-declared SDK levels against a policy.
 *
 * Delegates to {@link auditAndroidSdkLevels} in the manifest module so both
 * readers are judged by one rule set on purpose: a project cannot satisfy one
 * reader and fail the other, and a new rule applies to both at once. Only the
 * two SDK levels take part in the audit; a Gradle script declares no manifest
 * package and no permission list, so the remaining members are empty.
 *
 * @param config - parsed Gradle Android configuration to audit.
 * @param policy - minimum accepted target SDK level.
 * @returns problem strings; an empty array means no problem is detectable.
 */
export function auditGradleAndroidConfig(config: GradleAndroidConfig, policy: AndroidSdkPolicy): readonly string[] {
  return auditAndroidSdkLevels(config, policy)
}

/**
 * Render one summary line for a parsed Gradle Android configuration.
 *
 * The line is `applicationId=<value|unknown> namespace=<value|unknown>
 * minSdk=<n|unknown> targetSdk=<n|unknown> compileSdk=<n|unknown>`.
 *
 * @param config - parsed configuration to summarize.
 * @returns the rendered summary line.
 */
export function formatGradleAndroidSummary(config: GradleAndroidConfig): string {
  const applicationId = config.applicationId ?? 'unknown'
  const namespace = config.namespace ?? 'unknown'
  const minSdk = config.minSdkVersion ?? 'unknown'
  const targetSdk = config.targetSdkVersion ?? 'unknown'
  const compileSdk = config.compileSdkVersion ?? 'unknown'
  return `applicationId=${applicationId} namespace=${namespace} minSdk=${minSdk} targetSdk=${targetSdk} compileSdk=${compileSdk}`
}

/**
 * Compare Gradle-declared values with values read from AndroidManifest.xml.
 *
 * Reports, in this order and only when both sides declare a value:
 * `applicationId <a> differs from manifest package <b>`,
 * `minSdkVersion <a> differs from manifest <b>`, and
 * `targetSdkVersion <a> differs from manifest <b>`. A comparison whose either
 * side is `null` is skipped, so an undeclared value never counts as a
 * difference.
 *
 * @param config - parsed Gradle Android configuration.
 * @param manifest - manifest package name and SDK levels to compare against.
 * @returns disagreement messages; an empty array means every comparable value agreed.
 */
export function gradleConfigAgreesWithManifest(
  config: GradleAndroidConfig,
  manifest: {
    readonly packageName: string | null
    readonly minSdkVersion: number | null
    readonly targetSdkVersion: number | null
  },
): readonly string[] {
  const differences: string[] = []
  if (config.applicationId !== null && manifest.packageName !== null && config.applicationId !== manifest.packageName) {
    differences.push(`applicationId ${config.applicationId} differs from manifest package ${manifest.packageName}`)
  }
  if (config.minSdkVersion !== null && manifest.minSdkVersion !== null && config.minSdkVersion !== manifest.minSdkVersion) {
    differences.push(`minSdkVersion ${config.minSdkVersion} differs from manifest ${manifest.minSdkVersion}`)
  }
  if (
    config.targetSdkVersion !== null
    && manifest.targetSdkVersion !== null
    && config.targetSdkVersion !== manifest.targetSdkVersion
  ) {
    differences.push(`targetSdkVersion ${config.targetSdkVersion} differs from manifest ${manifest.targetSdkVersion}`)
  }
  return differences
}
