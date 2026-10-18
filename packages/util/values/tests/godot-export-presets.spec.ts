import { describe, expect, it } from 'vitest'
import {
  formatExportPresets,
  parseExportPresets,
  summarizeExportPresets,
  type GodotExportPreset,
  type GodotExportPresetSummary,
} from '../src/godot-export-presets.ts'

/** Parse presets from the given lines joined with `\n`. */
function parse(...lines: readonly string[]): readonly GodotExportPreset[] {
  return parseExportPresets(lines.join('\n'))
}

/** Optional fields of a summary fixture; omitted fields take the absent or false default. */
interface PresetFields {
  readonly name?: string | null
  readonly platform?: string | null
  readonly exportPath?: string | null
  readonly runnable?: boolean
}

/**
 * Build one preset fixture for the summary tests.
 * @param index - preset index.
 * @param fields - fields to set; an omitted field is absent, and `runnable` defaults to `false`.
 * @returns a preset with `hasOptions` false.
 */
function preset(index: number, fields: PresetFields = {}): GodotExportPreset {
  return {
    index,
    name: fields.name ?? null,
    platform: fields.platform ?? null,
    exportPath: fields.exportPath ?? null,
    runnable: fields.runnable ?? false,
    hasOptions: false,
  }
}

/** Summary of an empty preset list, used as the base of the formatting fixtures. */
const EMPTY_SUMMARY: GodotExportPresetSummary = {
  total: 0,
  runnable: 0,
  missingExportPath: [],
  duplicatePlatforms: [],
  platforms: [],
}

describe('parseExportPresets', () => {
  it('returns no presets for empty text', () => {
    expect(parseExportPresets('')).toEqual([])
  })

  it('reads one full preset together with its options section', () => {
    const presets = parse(
      '[preset.0]',
      'name="Windows Desktop"',
      'platform="Windows Desktop"',
      'export_path="build/windows/game.exe"',
      'runnable=true',
      '[preset.0.options]',
      'custom_template/debug=""',
    )
    expect(presets).toEqual([
      {
        index: 0,
        name: 'Windows Desktop',
        platform: 'Windows Desktop',
        exportPath: 'build/windows/game.exe',
        runnable: true,
        hasOptions: true,
      },
    ])
  })

  it('leaves hasOptions false when no options section appears', () => {
    const presets = parse('[preset.2]', 'name="Plain"', 'platform="Web"', 'export_path="out.html"', 'runnable=false')
    expect(presets).toEqual([
      { index: 2, name: 'Plain', platform: 'Web', exportPath: 'out.html', runnable: false, hasOptions: false },
    ])
  })

  it('returns presets sorted by index regardless of file order', () => {
    const presets = parse('[preset.5]', 'name="Five"', '[preset.2]', 'name="Two"', '[preset.9]', 'name="Nine"')
    expect(presets.map(entry => entry.index)).toEqual([2, 5, 9])
    expect(presets.map(entry => entry.name)).toEqual(['Two', 'Five', 'Nine'])
  })

  it('marks hasOptions from an options section written before its preset', () => {
    const presets = parse('[preset.3.options]', 'texture_format/s3tc=true', '[preset.3]', 'name="Web"')
    expect(presets).toHaveLength(1)
    expect(presets.map(entry => entry.hasOptions)).toEqual([true])
  })

  it('creates no preset for an options section whose index opens no preset', () => {
    expect(parse('[preset.4.options]', 'custom_template/debug=""')).toEqual([])
  })

  it('keeps other presets when an options section matches no preset', () => {
    const presets = parse('[preset.9.options]', '[preset.1]', 'name="Only"')
    expect(presets.map(entry => entry.index)).toEqual([1])
    expect(presets.map(entry => entry.hasOptions)).toEqual([false])
  })

  it('ignores blank lines, comment lines, and CRLF endings', () => {
    const presets = parse(
      '; comment',
      '# comment',
      '   ; indented comment\r',
      '\t# indented hash\r',
      '',
      '   \r',
      '[preset.1]',
      'name="Main"\r',
    )
    expect(presets.map(entry => entry.name)).toEqual(['Main'])
  })

  it('ignores lines without an equals sign and lines with an empty key', () => {
    const presets = parse('[preset.1]', 'name', '=orphan', ' runnable = TRUE ', '[', '  export_path = build/out.exe  ')
    expect(presets.map(entry => entry.name)).toEqual([null])
    expect(presets.map(entry => entry.runnable)).toEqual([true])
    expect(presets.map(entry => entry.exportPath)).toEqual(['build/out.exe'])
  })

  it('strips one pair of surrounding double quotes and keeps inner whitespace', () => {
    const presets = parse('[preset.0]', 'name="  My Game  "', 'export_path="res://out.exe"')
    expect(presets.map(entry => entry.name)).toEqual(['  My Game  '])
    expect(presets.map(entry => entry.exportPath)).toEqual(['res://out.exe'])
  })

  it('keeps unquoted values as written', () => {
    const presets = parse('[preset.0]', 'name=Linux/X11', 'platform=Web')
    expect(presets.map(entry => entry.name)).toEqual(['Linux/X11'])
    expect(presets.map(entry => entry.platform)).toEqual(['Web'])
  })

  it('leaves a value unchanged when its quotes are unbalanced or the value is too short', () => {
    const presets = parse('[preset.0]', 'name="Unclosed', '[preset.1]', 'platform="')
    expect(presets.map(entry => entry.name)).toEqual(['"Unclosed', null])
    expect(presets.map(entry => entry.platform)).toEqual([null, '"'])
  })

  it('reads an empty value as an empty string rather than null', () => {
    const presets = parse('[preset.0]', 'name=', 'platform=""')
    expect(presets.map(entry => entry.name)).toEqual([''])
    expect(presets.map(entry => entry.platform)).toEqual([''])
  })

  it('lets a later duplicate key win', () => {
    const presets = parse('[preset.0]', 'name="First"', 'name="Second"')
    expect(presets.map(entry => entry.name)).toEqual(['Second'])
  })

  it('continues the same preset when its section repeats', () => {
    const presets = parse('[preset.1]', 'name="Repeat"', 'runnable=true', '[preset.1]', 'platform="Linux/X11"')
    expect(presets).toHaveLength(1)
    expect(presets.map(entry => entry.name)).toEqual(['Repeat'])
    expect(presets.map(entry => entry.platform)).toEqual(['Linux/X11'])
    expect(presets.map(entry => entry.runnable)).toEqual([true])
  })

  it('ignores keys that appear before the first section', () => {
    const presets = parse('name="Before"', 'platform="Wrong"', '[preset.1]', 'name="Kept"')
    expect(presets.map(entry => entry.name)).toEqual(['Kept'])
    expect(presets.map(entry => entry.platform)).toEqual([null])
  })

  it('ignores keys in sections that are not preset sections', () => {
    const presets = parse(
      '[resource]',
      'name="Nope"',
      '[preset.1.extra]',
      'name="Nope"',
      '[Preset.2]',
      'name="Nope"',
      '[preset.3]',
      'name="Yes"',
    )
    expect(presets.map(entry => entry.index)).toEqual([3])
    expect(presets.map(entry => entry.name)).toEqual(['Yes'])
  })

  it('ignores a preset section with a malformed index while reading zero and leading-zero indexes', () => {
    const presets = parse(
      '[preset.abc]',
      'name="Nope"',
      '[preset.]',
      'name="Nope"',
      '[preset.-1]',
      'name="Nope"',
      '[preset.99999999999999999999]',
      'name="Nope"',
      '[preset.1.options.extra]',
      'name="Nope"',
      '[preset.0]',
      'name="Zero"',
      '[preset.007]',
      'name="Leading"',
    )
    expect(presets.map(entry => entry.index)).toEqual([0, 7])
    expect(presets.map(entry => entry.name)).toEqual(['Zero', 'Leading'])
  })

  it('matches section names and keys case-sensitively', () => {
    const presets = parse(
      '[Preset.1]',
      'name="Wrong"',
      '[preset.2]',
      'Name="Also wrong"',
      'NAME="Also wrong"',
      '[preset.3]',
      'name="Right"',
    )
    expect(presets.map(entry => entry.index)).toEqual([2, 3])
    expect(presets.map(entry => entry.name)).toEqual([null, 'Right'])
  })

  it('reads runnable as true only for true in any letter case', () => {
    const presets = parse(
      '[preset.0]',
      'runnable=TRUE',
      '[preset.1]',
      'runnable=True',
      '[preset.2]',
      'runnable=TrUe',
      '[preset.3]',
      'runnable="true"',
    )
    expect(presets.map(entry => entry.runnable)).toEqual([true, true, true, true])
  })

  it('reads every other runnable value as false', () => {
    const presets = parse(
      '[preset.0]',
      'runnable=false',
      '[preset.1]',
      'runnable=yes',
      '[preset.2]',
      'runnable=1',
      '[preset.3]',
      'runnable=',
      '[preset.4]',
      'runnable=0',
    )
    expect(presets.map(entry => entry.runnable)).toEqual([false, false, false, false, false])
  })

  it('treats values as single lines and never continues them', () => {
    const presets = parse('[preset.2]', 'name="Linux', 'X11"', 'platform="Linux/X11"')
    expect(presets).toHaveLength(1)
    expect(presets.map(entry => entry.name)).toEqual(['"Linux'])
    expect(presets.map(entry => entry.platform)).toEqual(['Linux/X11'])
  })

  it('parses a realistic export_presets.cfg', () => {
    const presets = parse(
      '; Godot export presets',
      '[preset.0]',
      'name="Windows Desktop"',
      'platform="Windows Desktop"',
      'runnable=true',
      'export_path="build/windows/game.exe"',
      '[preset.0.options]',
      'custom_template/debug=""',
      'binary_format/embed_pck=false',
      '',
      '[preset.1]',
      'name="Linux/X11"',
      'platform="Linux/X11"',
      'runnable=false',
      'export_path="build/linux/game.x86_64"',
      '[preset.1.options]',
      'texture_format/s3tc=true',
      '',
      '[preset.2]',
      'name="Web"',
      'platform="Web"',
      'export_path="build/web/index.html"',
    )
    expect(presets.map(entry => entry.index)).toEqual([0, 1, 2])
    expect(presets.map(entry => entry.name)).toEqual(['Windows Desktop', 'Linux/X11', 'Web'])
    expect(presets.map(entry => entry.runnable)).toEqual([true, false, false])
    expect(presets.map(entry => entry.hasOptions)).toEqual([true, true, false])
  })
})

describe('summarizeExportPresets', () => {
  it('returns zero counts and empty lists for an empty list', () => {
    expect(summarizeExportPresets([])).toEqual({
      total: 0,
      runnable: 0,
      missingExportPath: [],
      duplicatePlatforms: [],
      platforms: [],
    })
  })

  it('counts all presets and the runnable ones', () => {
    const summary = summarizeExportPresets([preset(0, { runnable: true }), preset(1), preset(2, { runnable: true })])
    expect(summary.total).toBe(3)
    expect(summary.runnable).toBe(2)
  })

  it('lists missing export paths by name in list order', () => {
    const summary = summarizeExportPresets([
      preset(0, { name: 'Alpha' }),
      preset(1, { name: 'Beta', exportPath: 'build/beta.exe' }),
      preset(2, { name: 'Gamma' }),
    ])
    expect(summary.missingExportPath).toEqual(['Alpha', 'Gamma'])
  })

  it('falls back to preset <index> when a preset with a missing path has no name', () => {
    const summary = summarizeExportPresets([preset(4), preset(7, { name: '' }), preset(9, { name: 'Named' })])
    expect(summary.missingExportPath).toEqual(['preset 4', 'preset 7', 'Named'])
  })

  it('treats an empty export path as missing', () => {
    const summary = summarizeExportPresets([preset(1, { name: 'Empty path', exportPath: '' })])
    expect(summary.missingExportPath).toEqual(['Empty path'])
  })

  it('ignores absent and empty platforms', () => {
    const summary = summarizeExportPresets([preset(0), preset(1, { platform: '' }), preset(2)])
    expect(summary.platforms).toEqual([])
    expect(summary.duplicatePlatforms).toEqual([])
  })

  it('lists each distinct platform sorted', () => {
    const summary = summarizeExportPresets([
      preset(0, { platform: 'Web' }),
      preset(1, { platform: 'Android' }),
      preset(2, { platform: 'Linux/X11' }),
    ])
    expect(summary.platforms).toEqual(['Android', 'Linux/X11', 'Web'])
    expect(summary.duplicatePlatforms).toEqual([])
  })

  it('lists platforms shared by two or more presets, sorted', () => {
    const summary = summarizeExportPresets([
      preset(0, { platform: 'Web' }),
      preset(1, { platform: 'Linux/X11' }),
      preset(2, { platform: 'Web' }),
      preset(3, { platform: 'Linux/X11' }),
      preset(4, { platform: 'Windows Desktop' }),
    ])
    expect(summary.duplicatePlatforms).toEqual(['Linux/X11', 'Web'])
    expect(summary.platforms).toEqual(['Linux/X11', 'Web', 'Windows Desktop'])
  })

  it('compares platform names exactly and case-sensitively', () => {
    const summary = summarizeExportPresets([preset(0, { platform: 'Web' }), preset(1, { platform: 'web' })])
    expect(summary.platforms).toEqual(['Web', 'web'])
    expect(summary.duplicatePlatforms).toEqual([])
  })
})

describe('formatExportPresets', () => {
  it('renders the platform line with comma-separated platforms', () => {
    const summary: GodotExportPresetSummary = {
      total: 2,
      runnable: 1,
      missingExportPath: [],
      duplicatePlatforms: [],
      platforms: ['Linux/X11', 'Web'],
    }
    expect(formatExportPresets(summary)).toBe('presets=2 runnable=1 platforms=Linux/X11, Web')
  })

  it('renders none when no platform is present', () => {
    const summary: GodotExportPresetSummary = {
      total: 1,
      runnable: 0,
      missingExportPath: [],
      duplicatePlatforms: [],
      platforms: [],
    }
    expect(formatExportPresets(summary)).toBe('presets=1 runnable=0 platforms=none')
  })

  it('appends the missing export path line only when the list is non-empty', () => {
    expect(formatExportPresets({ ...EMPTY_SUMMARY, total: 2, missingExportPath: ['Alpha', 'Beta'] })).toBe(
      'presets=2 runnable=0 platforms=none\nmissing export path: Alpha, Beta',
    )
    expect(formatExportPresets(EMPTY_SUMMARY)).toBe('presets=0 runnable=0 platforms=none')
  })

  it('appends the duplicate platform line only when the list is non-empty', () => {
    expect(formatExportPresets({ ...EMPTY_SUMMARY, total: 1, runnable: 1, platforms: ['Web'], duplicatePlatforms: ['Web'] })).toBe(
      'presets=1 runnable=1 platforms=Web\nduplicate platform: Web',
    )
    expect(formatExportPresets({ ...EMPTY_SUMMARY, total: 1, runnable: 1, platforms: ['Web'] })).toBe(
      'presets=1 runnable=1 platforms=Web',
    )
  })

  it('renders every present line in order', () => {
    const summary: GodotExportPresetSummary = {
      total: 3,
      runnable: 2,
      missingExportPath: ['Gamma'],
      duplicatePlatforms: ['Linux/X11', 'Web'],
      platforms: ['Linux/X11', 'Web'],
    }
    expect(formatExportPresets(summary)).toBe(
      'presets=3 runnable=2 platforms=Linux/X11, Web\nmissing export path: Gamma\nduplicate platform: Linux/X11, Web',
    )
  })
})
