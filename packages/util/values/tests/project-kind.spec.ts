import { describe, expect, it } from 'vitest'
import {
  detectProjectKind,
  detectProjectKinds,
  isGameProjectKind,
  markersForProjectKind,
  PROJECT_KIND_MARKERS,
} from '../src/index.ts'

describe('detectProjectKind', () => {
  it('detects Unity from ProjectSettings', () => {
    expect(detectProjectKind(['ProjectSettings/ProjectSettings.asset', 'Assets/Foo.cs'])).toBe('unity')
  })
  it('detects Godot from project.godot', () => {
    expect(detectProjectKind(['project.godot', 'scenes/main.tscn'])).toBe('godot')
  })
  it('detects Flutter from pubspec.yaml', () => {
    expect(detectProjectKind(['pubspec.yaml', 'lib/main.dart'])).toBe('flutter')
  })
  it('detects Android from AndroidManifest.xml', () => {
    expect(detectProjectKind(['app/src/main/AndroidManifest.xml'])).toBe('android')
  })
  it('detects Android from build.gradle', () => {
    expect(detectProjectKind(['build.gradle', 'settings.gradle'])).toBe('android')
  })
  it('detects Node from package.json', () => {
    expect(detectProjectKind(['package.json', 'src/index.ts'])).toBe('node')
  })
  it('detects Python from pyproject.toml', () => {
    expect(detectProjectKind(['pyproject.toml'])).toBe('python')
  })
  it('detects Python from requirements.txt', () => {
    expect(detectProjectKind(['requirements.txt'])).toBe('python')
  })
  it('returns unknown for no markers', () => {
    expect(detectProjectKind([])).toBe('unknown')
  })
  it('returns unknown for unrelated files', () => {
    expect(detectProjectKind(['README.md', 'notes.txt'])).toBe('unknown')
  })
  it('normalizes backslashes', () => {
    expect(detectProjectKind(['ProjectSettings\\ProjectSettings.asset'])).toBe('unity')
  })
  it('is case-insensitive', () => {
    expect(detectProjectKind(['PROJECT.GODOT'])).toBe('godot')
  })
})

describe('detectProjectKinds', () => {
  it('returns all matching kinds in priority order', () => {
    const kinds = detectProjectKinds(['pubspec.yaml', 'app/src/main/AndroidManifest.xml', 'package.json'])
    expect(kinds).toEqual(['flutter', 'android', 'node'])
  })
  it('returns empty array for unknown', () => {
    expect(detectProjectKinds(['README.md'])).toEqual([])
  })
})

describe('isGameProjectKind', () => {
  it('true for unity and godot', () => {
    expect(isGameProjectKind('unity')).toBe(true)
    expect(isGameProjectKind('godot')).toBe(true)
  })
  it('false otherwise', () => {
    expect(isGameProjectKind('flutter')).toBe(false)
    expect(isGameProjectKind('unknown')).toBe(false)
  })
})

describe('markersForProjectKind', () => {
  it('returns markers for known kinds', () => {
    expect(markersForProjectKind('unity')).toEqual(PROJECT_KIND_MARKERS.unity)
  })
  it('returns empty for unknown', () => {
    expect(markersForProjectKind('unknown')).toEqual([])
  })
})
