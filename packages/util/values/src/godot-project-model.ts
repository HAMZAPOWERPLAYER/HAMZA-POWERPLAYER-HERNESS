/**
 * Documented INI-subset reader for the values the harness consumes from a Godot
 * `project.godot` file: project name, main scene, export feature tags, autoload
 * singletons, and `config_version`. Parsing is text-only; nothing touches the
 * filesystem.
 *
 * Parsing rules, and the limits of this subset:
 *
 * - Text is split on `\n`. Each line is trimmed, so a trailing `\r` from a CRLF
 *   file is removed; values never span lines.
 * - A blank line, or a line whose first non-whitespace character is `;` or `#`,
 *   is ignored. A line that is neither a section header nor `key=value` is
 *   ignored as well.
 * - A section header is a line whose first character is `[` and whose last
 *   character is `]`; the trimmed text between the brackets is the section
 *   name. Section names and keys are case-sensitive.
 * - For `key=value`, the trimmed text before the first `=` is the key and the
 *   trimmed text after it is the value. A line whose key is empty is ignored.
 *   One pair of surrounding double quotes is removed from the value; only a
 *   value of at least two characters that starts and ends with `"` counts.
 * - No escapes are processed: a backslash has no special meaning, and a quote
 *   inside a quoted value ends that quoted run instead of being escaped.
 * - A later duplicate key wins over an earlier one. An autoload key keeps the
 *   position of its first occurrence.
 * - Only `[application]` and `[autoload]` are read; keys in every other
 *   section are ignored. `[application]` supplies `config/name`,
 *   `run/main_scene`, and `config/features`; `[autoload]` supplies every
 *   key/value pair, with a leading `*` kept as part of the key.
 * - `config_version` is read only before the first section header. Its value
 *   must be decimal digits with an optional sign; anything else, including an
 *   empty value, a hexadecimal literal, or a non-integer, yields `null`.
 * - `config/features` is read as a `PackedStringArray("tag", ...)` literal,
 *   which requires both the `PackedStringArray(` prefix and the closing `)`.
 *   Tags are the double-quoted substrings between the parentheses, in source
 *   order, found by a literal scan; an unterminated quote drops the rest of
 *   the value, and any other value form yields an empty tag list.
 *
 * Godot's full INI dialect (escape sequences, multi-line values, `Object(...)`
 * values, `@export` annotations, and quoted keys) is intentionally not
 * implemented.
 *
 * @module @deepseek-ai/dsh-util-values/godot-project-model
 */

import { scanIniSubset } from './ini-subset.ts'

/** Values read from one Godot `project.godot` file; each member is `null` or empty when the file omits it. */
export interface GodotProject {
  /** Top-level `config_version`, or `null` when absent or not a decimal integer. */
  readonly configVersion: number | null
  /** `config/name` from `[application]`, or `null` when absent. */
  readonly applicationName: string | null
  /** `run/main_scene` from `[application]`, or `null` when absent. */
  readonly mainScene: string | null
  /** Feature tags of `config/features`, in source order; empty when absent or not a `PackedStringArray`. */
  readonly features: readonly string[]
  /** Every `[autoload]` key/value pair; a repeated key keeps its first position and its last value. */
  readonly autoload: Readonly<Record<string, string>>
}

/** `PackedStringArray(` prefix that must open a parsed feature tag list. */
const FEATURE_ARRAY_PREFIX = 'PackedStringArray('

/** Decimal integer literal with an optional sign, the only accepted `config_version` text. */
const CONFIG_VERSION_PATTERN = /^[+-]?\d+$/

/**
 * Remove one pair of surrounding double quotes from a value.
 * @param value - trimmed value text.
 * @returns the value without one surrounding quote pair, or the value unchanged.
 */
function stripSurroundingQuotes(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value
  return value.slice(1, -1)
}

/**
 * Convert one `config_version` value to a number.
 * @param value - the trimmed, unquoted value text.
 * @returns the integer value, or `null` when the text is not a decimal integer or overflows to a non-finite number.
 */
function parseConfigVersion(value: string): number | null {
  if (!CONFIG_VERSION_PATTERN.test(value)) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Extract the double-quoted tags of one `config/features` value.
 *
 * Only a `PackedStringArray("tag", ...)` literal is recognized. Inside it, each
 * `"` opens a tag that the next `"` closes; the text between them is the tag,
 * taken literally. An unmatched final quote drops the rest of the value.
 *
 * @param value - the trimmed, unquoted `config/features` value.
 * @returns the tags in source order, or an empty list for any other value form.
 */
function parseFeatureTags(value: string): readonly string[] {
  if (!value.startsWith(FEATURE_ARRAY_PREFIX) || !value.endsWith(')')) return []
  const body = value.slice(FEATURE_ARRAY_PREFIX.length, value.length - 1)
  const tags: string[] = []
  let cursor = 0
  while (cursor < body.length) {
    const open = body.indexOf('"', cursor)
    if (open === -1) break
    const close = body.indexOf('"', open + 1)
    if (close === -1) break
    tags.push(body.slice(open + 1, close))
    cursor = close + 1
  }
  return tags
}

/**
 * Parse the harness-relevant values out of Godot `project.godot` text.
 *
 * The function never throws: unrecognized lines, sections, and value forms are
 * ignored as documented on this module. Whitespace-only input yields a project
 * whose nullable members are `null` and whose collections are empty.
 *
 * @param text - full contents of a `project.godot` file.
 * @returns the parsed values; see the module documentation for parsing limits.
 */
export function parseGodotProject(text: string): GodotProject {
  let configVersion: number | null = null
  let applicationName: string | null = null
  let mainScene: string | null = null
  let features: readonly string[] = []
  const autoloadEntries: [string, string][] = []

  for (const item of scanIniSubset(text)) {
    if (item.kind !== 'entry') continue
    const value = stripSurroundingQuotes(item.value)
    if (item.section === null) {
      if (item.key === 'config_version') configVersion = parseConfigVersion(value)
      continue
    }
    if (item.section === 'application') {
      if (item.key === 'config/name') applicationName = value
      else if (item.key === 'run/main_scene') mainScene = value
      else if (item.key === 'config/features') features = parseFeatureTags(value)
      continue
    }
    if (item.section === 'autoload') autoloadEntries.push([item.key, value])
  }

  return {
    configVersion,
    applicationName,
    mainScene,
    features,
    autoload: Object.fromEntries(autoloadEntries),
  }
}

/**
 * Guess the Godot major version from a project's export feature tags.
 *
 * This is a heuristic over feature tags such as `4.3` or `GL Compatibility`: it
 * counts tags equal to `3` or `4`, or starting with `3.` or `4.`, and reports
 * `null` when both majors or neither appear. A project with no version tag, or
 * with tags from both majors, therefore cannot be classified.
 *
 * @param project - parsed project whose feature tags are inspected.
 * @returns the single distinct major version found, or `null`.
 */
export function godotMajorVersion(project: GodotProject): 3 | 4 | null {
  let hasMajor3 = false
  let hasMajor4 = false
  for (const feature of project.features) {
    if (feature === '3' || feature.startsWith('3.')) hasMajor3 = true
    else if (feature === '4' || feature.startsWith('4.')) hasMajor4 = true
  }
  if (hasMajor3 === hasMajor4) return null
  return hasMajor3 ? 3 : 4
}

/**
 * Render one deterministic summary line for a parsed project.
 *
 * The line is `Godot <major|unknown> project "<name>" (config_version=<n|unknown>,
 * autoloads=<count>)`, where a `null` name renders as `unknown` and the count is
 * the number of distinct autoload keys.
 *
 * @param project - parsed project to describe.
 * @returns the rendered summary line.
 */
export function formatGodotSummary(project: GodotProject): string {
  const major = godotMajorVersion(project)
  const name = project.applicationName ?? 'unknown'
  const configVersion = project.configVersion === null ? 'unknown' : String(project.configVersion)
  const autoloads = Object.keys(project.autoload).length
  return `Godot ${major === null ? 'unknown' : String(major)} project "${name}" (config_version=${configVersion}, autoloads=${autoloads})`
}
