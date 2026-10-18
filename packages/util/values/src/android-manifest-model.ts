/**
 * Regex-based review helpers for AndroidManifest.xml text.
 *
 * The helpers scan manifest text with regular expressions instead of parsing
 * XML, so they read attributes in any order and accept self-closing or paired
 * elements, but they cannot resolve XML entities, namespace aliases, comments,
 * or included files. Attribute values must be double- or single-quoted, and only
 * a literal `android:` prefix is recognized. Treat the results as review input,
 * never as an authoritative interpretation of a manifest.
 *
 * All helpers are deterministic, hold no state, and perform no I/O.
 *
 * @module @deepseek-ai/dsh-util-values/android-manifest-model
 */

/** SDK levels that both Android manifests and Gradle build scripts declare. */
export interface AndroidSdkLevels {
  /** Minimum SDK level as a decimal integer, or `null` when absent or not a decimal integer. */
  readonly minSdkVersion: number | null
  /** Target SDK level as a decimal integer, or `null` when absent or not a decimal integer. */
  readonly targetSdkVersion: number | null
}

/** Reviewable values read from AndroidManifest.xml text. */
export interface AndroidManifest extends AndroidSdkLevels {
  /** Package name declared by the root `<manifest>` element, or `null` when the text declares none. */
  readonly packageName: string | null
  /** Distinct permission names in document order. */
  readonly permissions: readonly string[]
}

/**
 * Review aid listing a non-exhaustive subset of Android runtime (dangerous)
 * permissions, fully qualified and sorted lexicographically.
 *
 * The Android platform owns the authoritative list, and that list varies by API
 * level, so this array is a review aid, not the Android platform list. A
 * permission outside the array is not necessarily safe.
 */
export const DANGEROUS_PERMISSIONS: readonly string[] = [
  'android.permission.ACCESS_BACKGROUND_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.BODY_SENSORS',
  'android.permission.CALL_PHONE',
  'android.permission.CAMERA',
  'android.permission.GET_ACCOUNTS',
  'android.permission.READ_CONTACTS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.READ_PHONE_STATE',
  'android.permission.READ_SMS',
  'android.permission.RECEIVE_SMS',
  'android.permission.RECORD_AUDIO',
  'android.permission.SEND_SMS',
  'android.permission.WRITE_CONTACTS',
  'android.permission.WRITE_EXTERNAL_STORAGE',
]

/**
 * Read reviewable values from AndroidManifest.xml text.
 *
 * Reads the root `<manifest>` element's `package` attribute, the
 * `minSdkVersion` and `targetSdkVersion` attributes with or without a literal
 * `android:` prefix, and the `android:name` attribute of every
 * `<uses-permission>` tag. SDK levels are read only from quoted decimal
 * integers, so preview levels such as `"S"` and fractional levels become
 * `null`. Permission names keep document order and lose duplicates.
 *
 * Text-scan limitations: attributes may appear in any order, but values must be
 * double- or single-quoted; namespace aliases other than a literal `android:`
 * prefix are not followed; XML entities are not decoded; comments are scanned
 * as markup; `package` is read from the root element only; and the
 * `uses-permission-sdk-23` element name is not read as `uses-permission`.
 *
 * @param xml - AndroidManifest.xml text to scan.
 * @returns the parsed values; text without a matching element yields `null` fields and an empty permission list.
 */
export function parseAndroidManifest(xml: string): AndroidManifest {
  return {
    packageName: readPackageName(xml),
    minSdkVersion: readSdkLevel(xml, MIN_SDK_ATTRIBUTE),
    targetSdkVersion: readSdkLevel(xml, TARGET_SDK_ATTRIBUTE),
    permissions: readPermissions(xml),
  }
}

/**
 * Select the manifest permissions that appear in {@link DANGEROUS_PERMISSIONS}.
 *
 * Comparison is exact and fully qualified, so an unprefixed or differently
 * cased name never matches.
 *
 * @param manifest - parsed manifest to review.
 * @returns the matching permission names in manifest order.
 */
export function dangerousPermissions(manifest: AndroidManifest): readonly string[] {
  return manifest.permissions.filter(permission => DANGEROUS_PERMISSIONS.includes(permission))
}

/** Minimum target SDK level an app must declare to satisfy the review policy. */
export interface AndroidSdkPolicy {
  /** Lowest accepted `targetSdkVersion`. */
  readonly minTargetSdkVersion: number
}

/**
 * Report SDK-level problems against a policy, in a fixed order.
 *
 * Emitted problems, in order: `targetSdkVersion is missing`,
 * `targetSdkVersion <n> is below the required <m>`, `minSdkVersion is missing`,
 * and `minSdkVersion <n> is above targetSdkVersion <m>`. Each comparison is
 * reported only when the parsed values make it checkable.
 *
 * @param manifest - parsed manifest to audit.
 * @param policy - minimum accepted target SDK level.
 * @returns problem strings; an empty array means no problem is detectable.
 */
export function auditAndroidSdkLevels(manifest: AndroidSdkLevels, policy: AndroidSdkPolicy): readonly string[] {
  const problems: string[] = []
  if (manifest.targetSdkVersion === null) {
    problems.push('targetSdkVersion is missing')
  } else if (manifest.targetSdkVersion < policy.minTargetSdkVersion) {
    problems.push(`targetSdkVersion ${manifest.targetSdkVersion} is below the required ${policy.minTargetSdkVersion}`)
  }
  if (manifest.minSdkVersion === null) {
    problems.push('minSdkVersion is missing')
  } else if (manifest.targetSdkVersion !== null && manifest.minSdkVersion > manifest.targetSdkVersion) {
    problems.push(`minSdkVersion ${manifest.minSdkVersion} is above targetSdkVersion ${manifest.targetSdkVersion}`)
  }
  return problems
}

/**
 * Render one manifest summary line.
 *
 * @param manifest - parsed manifest to summarize.
 * @returns a line such as `package=com.example minSdk=24 targetSdk=34 permissions=2 dangerous=1`, with `unknown` for absent values.
 */
export function formatAndroidManifestSummary(manifest: AndroidManifest): string {
  const packageName = manifest.packageName ?? 'unknown'
  const minSdk = manifest.minSdkVersion ?? 'unknown'
  const targetSdk = manifest.targetSdkVersion ?? 'unknown'
  return `package=${packageName} minSdk=${minSdk} targetSdk=${targetSdk} permissions=${manifest.permissions.length} dangerous=${dangerousPermissions(manifest).length}`
}

/**
 * Build a pattern for one quoted attribute.
 *
 * @param name - regular expression fragment for the attribute name, including any prefix alternative.
 * @returns a pattern without the `g` flag whose first capture group holds a double-quoted value and whose second capture group holds a single-quoted value.
 */
function quotedAttribute(name: string): RegExp {
  return new RegExp(`(?:^|[\\s])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`)
}

/** Root `<manifest>` element start, excluding other elements that share the prefix. */
const ROOT_MANIFEST_TAG = /<manifest(?=[\s/>])/

/** `<uses-permission>` element start, matched across the whole document. */
const USES_PERMISSION_TAG = /<uses-permission(?=[\s/>])/g

/** `package` attribute of the root `<manifest>` element. */
const PACKAGE_ATTRIBUTE = quotedAttribute('package')

/** `minSdkVersion` attribute with an optional literal `android:` prefix. */
const MIN_SDK_ATTRIBUTE = quotedAttribute('(?:android:)?minSdkVersion')

/** `targetSdkVersion` attribute with an optional literal `android:` prefix. */
const TARGET_SDK_ATTRIBUTE = quotedAttribute('(?:android:)?targetSdkVersion')

/** `android:name` attribute of one `<uses-permission>` tag. */
const PERMISSION_NAME_ATTRIBUTE = quotedAttribute('android:name')

/**
 * Read the value captured by `pattern` from `text`.
 *
 * @param text - text to search.
 * @param pattern - pattern built by {@link quotedAttribute}; shared across calls, so it must stay without the `g` flag.
 * @returns the unquoted attribute value, or `undefined` when the pattern does not match.
 */
function readAttributeValue(text: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(text)
  if (match === null) return undefined
  return match[1] ?? match[2]
}

/**
 * Slice one element tag, from `start` through the `>` that closes it while quoted values are skipped.
 *
 * @param xml - text to scan.
 * @param start - index of the tag's opening `<`.
 * @returns the tag text, or `undefined` when the tag never closes.
 */
function readTagText(xml: string, start: number): string | undefined {
  let quote: string | undefined
  for (let index = start; index < xml.length; index += 1) {
    const character = xml.charAt(index)
    if (quote !== undefined) {
      if (character === quote) quote = undefined
    } else if (character === '"' || character === "'") {
      quote = character
    } else if (character === '>') {
      return xml.slice(start, index + 1)
    }
  }
  return undefined
}

/**
 * Read the `package` attribute of the root `<manifest>` element.
 *
 * @param xml - text to scan.
 * @returns the package name, or `null` when the root element is absent or declares none.
 */
function readPackageName(xml: string): string | null {
  const match = ROOT_MANIFEST_TAG.exec(xml)
  if (match === null) return null
  const tag = readTagText(xml, match.index)
  if (tag === undefined) return null
  return readAttributeValue(tag, PACKAGE_ATTRIBUTE) ?? null
}

/**
 * Read one quoted SDK level from the document.
 *
 * @param xml - text to scan.
 * @param pattern - pattern for the level attribute, built by {@link quotedAttribute}.
 * @returns the level as a finite decimal integer, or `null` when the attribute is absent, unquoted, or not a decimal integer.
 */
function readSdkLevel(xml: string, pattern: RegExp): number | null {
  const raw = readAttributeValue(xml, pattern)
  if (raw === undefined || !/^-?\d+$/.test(raw)) return null
  const level = Number(raw)
  return Number.isFinite(level) ? level : null
}

/**
 * Collect the permission names declared by `<uses-permission>` tags.
 *
 * @param xml - text to scan.
 * @returns the `android:name` values in document order, without duplicates.
 */
function readPermissions(xml: string): readonly string[] {
  const permissions: string[] = []
  const seen = new Set<string>()
  for (const match of xml.matchAll(USES_PERMISSION_TAG)) {
    const tag = readTagText(xml, match.index)
    if (tag === undefined) continue
    const name = readAttributeValue(tag, PERMISSION_NAME_ATTRIBUTE)
    if (name === undefined || seen.has(name)) continue
    seen.add(name)
    permissions.push(name)
  }
  return permissions
}
