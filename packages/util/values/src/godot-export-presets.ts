/**
 * Documented INI-subset reader for Godot's `export_presets.cfg`, the export
 * configuration file the editor writes next to `project.godot`. Parsing is
 * text-only; nothing touches the filesystem, and the reader holds no state.
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
 *   name. Section names are case-sensitive.
 * - `[preset.<n>]` opens the preset with index `<n>`; `[preset.<n>.options]`
 *   records that the same index carries an options section and opens no preset
 *   of its own. `<n>` must be decimal digits that fit a non-negative safe
 *   integer; a section whose name matches neither form is ignored, and keys
 *   below it are not read.
 * - A repeated `[preset.<n>]` section continues the preset it opened, so its
 *   keys update that preset instead of adding a second one.
 * - For `key=value`, the trimmed text before the first `=` is the key and the
 *   trimmed text after it is the value. A line whose key is empty, or whose
 *   text holds no `=`, is ignored. One pair of surrounding double quotes is
 *   removed from the value; only a value of at least two characters that
 *   starts and ends with `"` counts. No escapes are processed: a backslash has
 *   no special meaning, and a quote inside a quoted value ends that quoted run
 *   instead of being escaped.
 * - Keys are read only inside `[preset.<n>]` sections, and only `name`,
 *   `platform`, `export_path`, and `runnable`; any other key is ignored. A
 *   later duplicate key wins over an earlier one.
 * - `runnable` is `true` only when its value, with quotes removed, is exactly
 *   `true` in any letter case; every other value, including `false`, `yes`,
 *   `1`, and an empty value, is `false`.
 * - A `[preset.<n>.options]` section whose index never gets a `[preset.<n>]`
 *   section creates no preset. The mark survives section order, so an options
 *   section before its preset still sets that preset's `hasOptions`.
 * - The returned presets are sorted by index.
 *
 * Godot's full INI dialect (escape sequences, multi-line values, `Object(...)`
 * values, and quoted keys) is intentionally not implemented.
 *
 * @module @deepseek-ai/dsh-util-values/godot-export-presets
 */

import { scanIniSubset } from './ini-subset.ts'

/** One export preset read from Godot `export_presets.cfg` text. */
export interface GodotExportPreset {
  /** Index `n` of the preset's `[preset.<n>]` section. */
  readonly index: number
  /** `name` value after quote removal, or `null` when the preset declares no name. */
  readonly name: string | null
  /** `platform` value after quote removal, or `null` when the preset declares no platform. */
  readonly platform: string | null
  /** `export_path` value after quote removal, or `null` when the preset declares no export path. */
  readonly exportPath: string | null
  /** `true` only when `runnable` reads `true` in any letter case; every other value is `false`. */
  readonly runnable: boolean
  /** `true` when a `[preset.<n>.options]` section names this preset's index. */
  readonly hasOptions: boolean
}

/** Aggregate view of a preset list; {@link summarizeExportPresets} derives every member. */
export interface GodotExportPresetSummary {
  /** Number of presets summarized. */
  readonly total: number
  /** Number of presets whose `runnable` is `true`. */
  readonly runnable: number
  /** Display name of each preset without an export path, in list order. */
  readonly missingExportPath: readonly string[]
  /** Platform names shared by two or more presets, sorted. */
  readonly duplicatePlatforms: readonly string[]
  /** Distinct non-empty platform names, sorted. */
  readonly platforms: readonly string[]
}

/** Mutable working record for one preset while its sections are read. */
interface PartialPreset {
  index: number
  name: string | null
  platform: string | null
  exportPath: string | null
  runnable: boolean
  hasOptions: boolean
}

/** Preset index inside a section name: one or more decimal digits. */
const INDEX_PATTERN = /^\d+$/

/** Section-name prefix of every preset section. */
const PRESET_SECTION_PREFIX = 'preset.'

/** Section-name suffix of a preset's options section. */
const OPTIONS_SECTION_SUFFIX = '.options'

/** One recognized `preset.<n>` section name, with or without the `.options` suffix. */
interface PresetSectionName {
  /** Preset index `<n>` parsed from the section name. */
  readonly index: number
  /** `true` when the section name carried the `.options` suffix. */
  readonly options: boolean
}

/**
 * Classify a trimmed section name as a preset or options section.
 *
 * @param name - section name with the surrounding brackets and whitespace removed.
 * @returns the parsed index and whether the name carried `.options`, or `null` when the name is not a preset section.
 */
function readPresetSectionName(name: string): PresetSectionName | null {
  if (!name.startsWith(PRESET_SECTION_PREFIX)) return null
  const rest = name.slice(PRESET_SECTION_PREFIX.length)
  const options = rest.endsWith(OPTIONS_SECTION_SUFFIX)
  const digits = options ? rest.slice(0, -OPTIONS_SECTION_SUFFIX.length) : rest
  if (!INDEX_PATTERN.test(digits)) return null
  const index = Number(digits)
  if (!Number.isSafeInteger(index)) return null
  return { index, options }
}

/**
 * Remove one pair of surrounding double quotes from a value.
 *
 * @param value - trimmed value text.
 * @returns the text without one surrounding quote pair, or the text unchanged when it has none.
 */
function stripSurroundingQuotes(value: string): string {
  if (value.length < 2 || !value.startsWith('"') || !value.endsWith('"')) return value
  return value.slice(1, -1)
}

/**
 * Test whether a nullable text value is absent or empty.
 *
 * @param value - value to test.
 * @returns `true` when the value is `null` or `''`.
 */
function isBlank(value: string | null): value is null | '' {
  return value === null || value === ''
}

/**
 * Read the export presets out of `export_presets.cfg` text.
 *
 * The function never throws: unrecognized lines, sections, and keys are ignored
 * as documented on this module, and the result is sorted by index.
 *
 * @param text - full contents of an `export_presets.cfg` file.
 * @returns one entry per `[preset.<n>]` section; see the module documentation for parsing limits.
 */
export function parseExportPresets(text: string): readonly GodotExportPreset[] {
  const presets = new Map<number, PartialPreset>()
  const optionsIndexes = new Set<number>()
  let current: PartialPreset | null = null

  for (const item of scanIniSubset(text)) {
    if (item.kind === 'section') {
      current = null
      const section = readPresetSectionName(item.name)
      if (section === null) continue
      if (section.options) {
        optionsIndexes.add(section.index)
        continue
      }
      let preset = presets.get(section.index)
      if (preset === undefined) {
        preset = {
          index: section.index,
          name: null,
          platform: null,
          exportPath: null,
          runnable: false,
          hasOptions: false,
        }
        presets.set(section.index, preset)
      }
      current = preset
      continue
    }
    const target = current
    if (target === null) continue
    const value = stripSurroundingQuotes(item.value)
    switch (item.key) {
      case 'name':
        target.name = value
        break
      case 'platform':
        target.platform = value
        break
      case 'export_path':
        target.exportPath = value
        break
      case 'runnable':
        target.runnable = value.toLowerCase() === 'true'
        break
    }
  }

  const result = [...presets.values()]
  for (const index of optionsIndexes) {
    const preset = presets.get(index)
    if (preset !== undefined) preset.hasOptions = true
  }
  return result.sort((left, right) => left.index - right.index)
}

/**
 * Summarize a preset list for review.
 *
 * `total` counts every preset, and `runnable` counts the presets whose
 * `runnable` is `true`. `missingExportPath` holds, in list order, the display
 * name of every preset whose export path is absent or empty, where a preset
 * with an absent or empty name is displayed as `preset <index>`. `platforms`
 * holds each distinct non-empty platform, sorted; a `null` or empty platform is
 * skipped rather than counted. `duplicatePlatforms` holds, sorted, the
 * platforms that two or more presets share, compared exactly and
 * case-sensitively.
 *
 * @param presets - presets to summarize, usually returned by {@link parseExportPresets}.
 * @returns the counts and sorted lists described above; an empty input yields zero counts and empty lists.
 */
export function summarizeExportPresets(presets: readonly GodotExportPreset[]): GodotExportPresetSummary {
  const platformCounts = new Map<string, number>()
  const missingExportPath: string[] = []
  let runnable = 0

  for (const preset of presets) {
    if (preset.runnable) runnable += 1
    if (isBlank(preset.exportPath)) {
      missingExportPath.push(isBlank(preset.name) ? `preset ${preset.index}` : preset.name)
    }
    const platform = preset.platform
    if (!isBlank(platform)) platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1)
  }

  const platforms = [...platformCounts.keys()].sort()
  return {
    total: presets.length,
    runnable,
    missingExportPath,
    duplicatePlatforms: platforms.filter(platform => (platformCounts.get(platform) ?? 0) >= 2),
    platforms,
  }
}

/**
 * Render a summary as one to three lines joined with `\n`.
 *
 * The first line is `presets=<total> runnable=<n> platforms=<platforms>`, with
 * the platforms joined by commas and the literal text `none` when the summary
 * lists no platform. A `missing export path: <names>` line follows only when
 * the summary lists a missing path, then a `duplicate platform: <platforms>`
 * line only when the summary lists a duplicate. Both lists are joined by
 * commas.
 *
 * @param summary - summary to render, usually returned by {@link summarizeExportPresets}.
 * @returns the rendered text without a trailing newline; the first line is always present.
 */
export function formatExportPresets(summary: GodotExportPresetSummary): string {
  const platforms = summary.platforms.length === 0 ? 'none' : summary.platforms.join(', ')
  const lines = [`presets=${summary.total} runnable=${summary.runnable} platforms=${platforms}`]
  if (summary.missingExportPath.length > 0) {
    lines.push(`missing export path: ${summary.missingExportPath.join(', ')}`)
  }
  if (summary.duplicatePlatforms.length > 0) {
    lines.push(`duplicate platform: ${summary.duplicatePlatforms.join(', ')}`)
  }
  return lines.join('\n')
}
