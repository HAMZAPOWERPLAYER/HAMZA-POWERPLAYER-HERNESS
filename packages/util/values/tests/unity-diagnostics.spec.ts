import { describe, expect, it } from 'vitest'
import { diagnoseUnityProject } from '../src/index.ts'

describe('diagnoseUnityProject', () => {
  it('reports no findings for a complete readable project', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2022.3.10f1' },
      { path: 'Packages/manifest.json', content: '{ "dependencies": {} }' },
      { path: 'Assembly-CSharp.csproj', content: '<Project Sdk="Microsoft.NET.Sdk"></Project>' },
      { path: 'Game.sln', content: 'Microsoft Visual Studio Solution File, Format Version 12.00' },
      { path: 'Assets/Scenes/Main.unity', content: '%YAML 1.1' },
    ])
    expect(result.findings).toHaveLength(0)
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
  })

  it('errors when ProjectVersion.txt is absent', () => {
    const result = diagnoseUnityProject([
      { path: 'Packages/manifest.json', content: '{}' },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'project',
      message: 'ProjectSettings/ProjectVersion.txt not found; Unity project may be incomplete.',
      file: null,
    })
    expect(result.findings[0]!.suggestion).toContain('ProjectSettings/ProjectVersion.txt')
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('errors when ProjectVersion.txt cannot be read', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: null },
      { path: 'Packages/manifest.json', content: '{}' },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'project',
      message: 'ProjectSettings/ProjectVersion.txt could not be read.',
      file: 'ProjectSettings/ProjectVersion.txt',
    })
  })

  it('warns when ProjectVersion.txt carries no recognizable version', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: unknown' },
      { path: 'Packages/manifest.json', content: '{}' },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'warning',
      category: 'project',
      message: 'ProjectVersion.txt does not contain a recognizable version number.',
      file: 'ProjectSettings/ProjectVersion.txt',
    })
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(true)
  })

  it('warns when Packages/manifest.json is absent', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2021.3.5f1' },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'warning',
      category: 'dependencies',
      message: 'Packages/manifest.json not found; package dependencies cannot be verified.',
      file: null,
    })
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(true)
  })

  it('errors when Packages/manifest.json cannot be read', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2021.3.5f1' },
      { path: 'Packages/manifest.json', content: null },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'error',
      category: 'dependencies',
      message: 'Packages/manifest.json could not be read.',
      file: 'Packages/manifest.json',
    })
  })

  it('errors once per unreadable C# project and solution file', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2022.3.10f1' },
      { path: 'Packages/manifest.json', content: '{}' },
      { path: 'Assembly-CSharp.csproj', content: null },
      { path: 'Game.csproj', content: null },
      { path: 'Game.sln', content: null },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(3)
    expect(result.findings.map(f => f.severity)).toEqual(['error', 'error', 'error'])
    expect(result.findings[0]).toMatchObject({
      category: 'build',
      message: 'C# project file Assembly-CSharp.csproj could not be read.',
      file: 'Assembly-CSharp.csproj',
    })
    expect(result.findings[1]).toMatchObject({
      category: 'build',
      message: 'C# project file Game.csproj could not be read.',
      file: 'Game.csproj',
    })
    expect(result.findings[2]).toMatchObject({
      category: 'build',
      message: 'Solution file Game.sln could not be read.',
      file: 'Game.sln',
    })
    expect(result.hasErrors).toBe(true)
  })

  it('accepts readable .csproj and .sln text that is not well-formed', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2022.3.10f1' },
      { path: 'Packages/manifest.json', content: '{}' },
      { path: 'Game.csproj', content: 'this is not xml at all' },
      { path: 'Game.sln', content: 'garbage without any project entry' },
      { path: 'Assets/Main.unity', content: '' },
    ])
    expect(result.findings).toHaveLength(0)
  })

  it('reports an info finding when no scene files exist', () => {
    const result = diagnoseUnityProject([
      { path: 'ProjectSettings/ProjectVersion.txt', content: 'm_EditorVersion: 2022.3.10f1' },
      { path: 'Packages/manifest.json', content: '{}' },
    ])
    expect(result.findings).toHaveLength(1)
    expect(result.findings[0]).toMatchObject({
      severity: 'info',
      category: 'scenes',
      message: 'No Unity scene (.unity) files found.',
      file: null,
    })
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
  })

  it('matches project paths case-insensitively', () => {
    const result = diagnoseUnityProject([
      { path: 'PROJECTSETTINGS/PROJECTVERSION.TXT', content: 'm_EditorVersion: 2022.3.10f1' },
      { path: 'PACKAGES/MANIFEST.JSON', content: '{}' },
      { path: 'SCENES/MAIN.UNITY', content: '' },
    ])
    expect(result.findings).toHaveLength(0)
  })

  it('orders findings as project, dependencies, then scenes for an empty input', () => {
    const result = diagnoseUnityProject([])
    expect(result.findings.map(f => f.severity)).toEqual(['error', 'warning', 'info'])
    expect(result.findings.map(f => f.category)).toEqual(['project', 'dependencies', 'scenes'])
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(true)
  })
})
