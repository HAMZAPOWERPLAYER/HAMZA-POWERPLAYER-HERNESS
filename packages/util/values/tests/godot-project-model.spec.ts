import { describe, expect, it } from 'vitest'
import { formatGodotSummary, godotMajorVersion, parseGodotProject, type GodotProject } from '../src/godot-project-model.ts'

/** Parse a project from the given lines joined with `\n`. */
function parse(...lines: readonly string[]): GodotProject {
  return parseGodotProject(lines.join('\n'))
}

/** Build a project that carries only feature tags, for the version heuristic. */
function withFeatures(features: readonly string[]): GodotProject {
  return { configVersion: null, applicationName: null, mainScene: null, features, autoload: {} }
}

describe('parseGodotProject', () => {
  it('ignores blank lines and comment lines', () => {
    const project = parse('', '; a comment', '# another comment', '   ', 'config_version=5')
    expect(project.configVersion).toBe(5)
    expect(project.applicationName).toBeNull()
  })

  it('reads quoted values, strips the surrounding quotes, and preserves inner whitespace', () => {
    const project = parse('[application]', 'config/name="  My Game  "', 'run/main_scene="res://main.tscn"')
    expect(project.applicationName).toBe('  My Game  ')
    expect(project.mainScene).toBe('res://main.tscn')
  })

  it('keeps unquoted values as written', () => {
    const project = parse('[application]', 'run/main_scene=res://main.tscn')
    expect(project.mainScene).toBe('res://main.tscn')
  })

  it('leaves a value unchanged when its double quotes are unbalanced', () => {
    expect(parse('[application]', 'config/name="Unclosed').applicationName).toBe('"Unclosed')
    expect(parse('[application]', 'config/name=Unclosed"').applicationName).toBe('Unclosed"')
  })

  it('reads an empty value as an empty string rather than null', () => {
    expect(parse('[application]', 'config/name=').applicationName).toBe('')
    expect(parse('[application]', 'config/name=""').applicationName).toBe('')
  })

  it('ignores lines without an equals sign and lines with an empty key', () => {
    const project = parse('[application]', 'config/name', '=orphan', ' run/main_scene =res://kept.tscn')
    expect(project.applicationName).toBeNull()
    expect(project.mainScene).toBe('res://kept.tscn')
  })

  it('ignores keys in the sections it does not read', () => {
    const project = parse('[rendering]', 'config/name="Wrong"', 'config_version=9', '[application]', 'config/name="Right"')
    expect(project.applicationName).toBe('Right')
    expect(project.configVersion).toBeNull()
  })

  it('matches section names and keys case-sensitively', () => {
    const project = parse('[Application]', 'config/name="Ignored"', '[application]', 'Config/Name="Also ignored"')
    expect(project.applicationName).toBeNull()
  })

  it('returns nulls and empty collections when no recognized section appears', () => {
    const project = parse('config_version=4', '[input]', 'ui_accept=Space')
    expect(project.configVersion).toBe(4)
    expect(project.applicationName).toBeNull()
    expect(project.mainScene).toBeNull()
    expect(project.features).toHaveLength(0)
    expect(project.autoload).toEqual({})
  })

  it('returns the same empty result for the empty string', () => {
    expect(parseGodotProject('')).toEqual({
      configVersion: null,
      applicationName: null,
      mainScene: null,
      features: [],
      autoload: {},
    })
  })

  it('lets a later duplicate application key win', () => {
    const project = parse('[application]', 'config/name="First"', 'config/name="Second"')
    expect(project.applicationName).toBe('Second')
  })

  it('lets a later duplicate autoload key win without moving its position', () => {
    const project = parse('[autoload]', 'A="res://a.gd"', 'B="res://b.gd"', 'A="res://a2.gd"')
    expect(project.autoload).toEqual({ A: 'res://a2.gd', B: 'res://b.gd' })
    expect(Object.keys(project.autoload)).toEqual(['A', 'B'])
  })

  it('reads a top-level config_version as a number, bare or quoted', () => {
    expect(parse('config_version=5').configVersion).toBe(5)
    expect(parse('config_version="5"').configVersion).toBe(5)
  })

  it('returns null when config_version is absent', () => {
    expect(parse('[application]', 'config/name="X"').configVersion).toBeNull()
  })

  it('returns null for a config_version that is not a decimal integer', () => {
    expect(parse('config_version=4.5').configVersion).toBeNull()
    expect(parse('config_version=abc').configVersion).toBeNull()
    expect(parse('config_version=').configVersion).toBeNull()
    expect(parse('config_version=0x10').configVersion).toBeNull()
  })

  it('lets a later config_version replace an earlier one, valid or not', () => {
    expect(parse('config_version=5', 'config_version=broken').configVersion).toBeNull()
    expect(parse('config_version=broken', 'config_version=6').configVersion).toBe(6)
  })

  it('extracts every quoted feature tag of a PackedStringArray in order', () => {
    const project = parse('[application]', 'config/features=PackedStringArray("4.3", "GL Compatibility", "C#")')
    expect(project.features).toEqual(['4.3', 'GL Compatibility', 'C#'])
    expect(project.features).toHaveLength(3)
  })

  it('extracts a single feature tag', () => {
    const project = parse('[application]', 'config/features=PackedStringArray("4.2")')
    expect(project.features).toContain('4.2')
    expect(project.features).toHaveLength(1)
  })

  it('returns no tags for an empty PackedStringArray or another value form', () => {
    expect(parse('[application]', 'config/features=PackedStringArray()').features).toHaveLength(0)
    expect(parse('[application]', 'config/features="4.3"').features).toHaveLength(0)
    expect(parse('[application]', 'config/features=4.3').features).toHaveLength(0)
  })

  it('drops an unterminated quoted tag at the end of a PackedStringArray', () => {
    const project = parse('[application]', 'config/features=PackedStringArray("4.3", "broken)')
    expect(project.features).toEqual(['4.3'])
  })

  it('reads every autoload entry with its quotes stripped', () => {
    const project = parse('[autoload]', 'Player="*res://player.gd"', 'UI="res://ui.tscn"')
    expect(project.autoload).toEqual({ Player: '*res://player.gd', UI: 'res://ui.tscn' })
  })

  it('keeps a leading asterisk as part of an autoload key', () => {
    const project = parse('[autoload]', '*Enemy="*res://enemy.gd"')
    expect(project.autoload['*Enemy']).toBe('*res://enemy.gd')
  })

  it('reads the main scene', () => {
    const project = parse('[application]', 'run/main_scene="res://scenes/world.tscn"')
    expect(project.mainScene).toBe('res://scenes/world.tscn')
  })

  it('parses a full project.godot document', () => {
    const text = [
      '; Engine configuration file.',
      '; Comments and blank lines are ignored.',
      '',
      'config_version=5',
      '',
      '[application]',
      '',
      'config/name="Platformer Demo"',
      'run/main_scene="res://scenes/main.tscn"',
      'config/features=PackedStringArray("4.3", "GL Compatibility")',
      '',
      '[autoload]',
      '',
      'GameState="*res://autoload/game_state.gd"',
      '*AudioBus="*res://autoload/audio_bus.gd"',
      '',
      '[rendering]',
      '',
      'renderer/rendering_method="gl_compatibility"',
    ].join('\n')
    expect(parseGodotProject(text)).toEqual({
      configVersion: 5,
      applicationName: 'Platformer Demo',
      mainScene: 'res://scenes/main.tscn',
      features: ['4.3', 'GL Compatibility'],
      autoload: {
        GameState: '*res://autoload/game_state.gd',
        '*AudioBus': '*res://autoload/audio_bus.gd',
      },
    })
  })

  it('tolerates CRLF line endings', () => {
    const project = parseGodotProject('config_version=5\r\n[application]\r\nconfig/name="Windows Build"')
    expect(project.configVersion).toBe(5)
    expect(project.applicationName).toBe('Windows Build')
  })
})

describe('godotMajorVersion', () => {
  it('returns 4 for a 4.x or bare 4 feature tag', () => {
    expect(godotMajorVersion(withFeatures(['4.3', 'GL Compatibility']))).toBe(4)
    expect(godotMajorVersion(withFeatures(['4']))).toBe(4)
  })

  it('returns 3 for a 3.x or bare 3 feature tag', () => {
    expect(godotMajorVersion(withFeatures(['3.5', 'GLES3']))).toBe(3)
    expect(godotMajorVersion(withFeatures(['3']))).toBe(3)
  })

  it('returns null when both major versions appear', () => {
    expect(godotMajorVersion(withFeatures(['4.3', '3.5']))).toBeNull()
  })

  it('returns null when no version tag appears', () => {
    expect(godotMajorVersion(withFeatures(['GL Compatibility']))).toBeNull()
    expect(godotMajorVersion(withFeatures([]))).toBeNull()
  })

  it('ignores a longer numeric tag that merely starts with a digit', () => {
    expect(godotMajorVersion(withFeatures(['40.0']))).toBeNull()
  })
})

describe('formatGodotSummary', () => {
  it('renders the summary line for a complete project', () => {
    const project = parse(
      'config_version=5',
      '[application]',
      'config/name="Platformer Demo"',
      'config/features=PackedStringArray("4.3", "GL Compatibility")',
      '[autoload]',
      'GameState="*res://game_state.gd"',
      'UI="res://ui.tscn"',
    )
    expect(formatGodotSummary(project)).toBe('Godot 4 project "Platformer Demo" (config_version=5, autoloads=2)')
  })

  it('renders unknown version, name, and config_version for an empty project', () => {
    expect(formatGodotSummary(parseGodotProject(''))).toBe('Godot unknown project "unknown" (config_version=unknown, autoloads=0)')
  })

  it('renders a missing name as unknown while keeping the known major version', () => {
    expect(formatGodotSummary(withFeatures(['4.3']))).toBe('Godot 4 project "unknown" (config_version=unknown, autoloads=0)')
  })

  it('counts each autoload key once', () => {
    const project = parse('[autoload]', 'A="res://a.gd"', 'A="res://a2.gd"', 'B="res://b.gd"')
    expect(formatGodotSummary(project)).toContain('autoloads=2')
  })
})
