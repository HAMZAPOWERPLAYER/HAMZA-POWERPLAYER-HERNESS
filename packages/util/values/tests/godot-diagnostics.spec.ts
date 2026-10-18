import { describe, expect, it } from 'vitest'
import { diagnoseGodotProject } from '../src/index.ts'

describe('diagnoseGodotProject', () => {
  it('reports no findings for a complete readable project', () => {
    const result = diagnoseGodotProject([
      {
        path: 'project.godot',
        content: 'config_version=4\n[application]\nconfig/name="Slice"\nrun/main_scene="res://Main.tscn"',
      },
      { path: 'Main.tscn', content: '[gd_scene format=3]\n[node name="Main" type="Node"]' },
      { path: 'scripts/player.gd', content: 'extends Node' },
      { path: 'scripts/Enemy.cs', content: 'class Enemy {}' },
      { path: 'data/stats.tres', content: '[resource]' },
    ])
    expect(result.findings).toHaveLength(0)
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
  })

  it('errors when project.godot is absent', () => {
    const result = diagnoseGodotProject([
      { path: 'Main.tscn', content: '[gd_scene format=3]\n[node name="Main" type="Node"]' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'project',
      message: 'project.godot not found; Godot project may be incomplete.',
      file: null,
    })
    expect(result.findings[0].suggestion).toContain('project.godot')
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('errors when project.godot cannot be read', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: null },
      { path: 'Main.tscn', content: '[gd_scene format=3]' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'project',
      message: 'project.godot could not be read.',
      file: 'project.godot',
    })
  })

  it('tolerates project.godot text outside the documented INI subset', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'gibberish without any assignment\n[unclosed section' },
      { path: 'Main.tscn', content: '[gd_scene format=3]' },
    ])
    expect(result.findings).toHaveLength(0)
    expect(result.hasErrors).toBe(false)
  })

  it('errors when a scene file cannot be read', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'config_version=4' },
      { path: 'scenes/Main.tscn', content: null },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'scene',
      message: 'Godot scene scenes/Main.tscn could not be read.',
      file: 'scenes/Main.tscn',
    })
  })

  it('errors when a resource file cannot be read', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'config_version=4' },
      { path: 'Main.tscn', content: '[gd_scene format=3]' },
      { path: 'data/stats.tres', content: null },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'resource',
      message: 'Godot resource data/stats.tres could not be read.',
      file: 'data/stats.tres',
    })
  })

  it('errors when a GDScript file cannot be read', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'config_version=4' },
      { path: 'Main.tscn', content: '[gd_scene format=3]' },
      { path: 'scripts/player.gd', content: null },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'script',
      message: 'GDScript file scripts/player.gd could not be read.',
      file: 'scripts/player.gd',
    })
  })

  it('errors when a C# script file cannot be read', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'config_version=4' },
      { path: 'Main.tscn', content: '[gd_scene format=3]' },
      { path: 'scripts/Enemy.cs', content: null },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'script',
      message: 'C# script file scripts/Enemy.cs could not be read.',
      file: 'scripts/Enemy.cs',
    })
  })

  it('reports an info finding when no scene files exist', () => {
    const result = diagnoseGodotProject([{ path: 'project.godot', content: 'config_version=4' }])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'info',
      category: 'scenes',
      message: 'No Godot scene (.tscn) files found.',
      file: null,
    })
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
  })

  it('aggregates one error per unreadable file', () => {
    const result = diagnoseGodotProject([
      { path: 'project.godot', content: 'config_version=4' },
      { path: 'Main.tscn', content: null },
      { path: 'data/stats.tres', content: null },
      { path: 'scripts/player.gd', content: null },
      { path: 'scripts/Enemy.cs', content: null },
    ])
    expect(result.findings).toHaveLength(4)
    expect(result.findings.map((f) => f.category)).toEqual(['scene', 'resource', 'script', 'script'])
    expect(result.findings.every((f) => f.severity === 'error')).toBe(true)
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('matches project paths case-insensitively', () => {
    const result = diagnoseGodotProject([
      { path: 'Project.Godot', content: 'config_version=4' },
      { path: 'SCENE.TSCN', content: '[gd_scene format=3]' },
      { path: 'SCRIPT.GD', content: 'extends Node' },
      { path: 'ENEMY.CS', content: 'class Enemy {}' },
      { path: 'DATA.TRES', content: '[resource]' },
    ])
    expect(result.findings).toHaveLength(0)
  })
})
