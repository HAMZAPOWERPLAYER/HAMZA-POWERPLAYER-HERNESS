import { describe, expect, it } from 'vitest'
import { formatFlutterPubspec, parsePubspec, pubspecDependencyDelta } from '../src/flutter-pubspec-model.ts'

describe('parsePubspec', () => {
  it('reads a realistic Flutter pubspec', () => {
    const text = [
      'name: my_app',
      'description: A sample app',
      'environment:',
      "  sdk: '>=3.0.0 <4.0.0'",
      'dependencies:',
      '  flutter:',
      '    sdk: flutter',
      '  cupertino_icons: ^1.0.2',
      '  shared_preferences: ^2.2.0',
      'dev_dependencies:',
      '  flutter_test:',
      '    sdk: flutter',
      '  flutter_lints: ^3.0.0',
    ].join('\n')
    const p = parsePubspec(text)
    expect(p.name).toBe('my_app')
    expect(p.description).toBe('A sample app')
    expect(p.sdkConstraint).toBe('>=3.0.0 <4.0.0')
    expect(p.dependencies).toEqual(['cupertino_icons', 'shared_preferences'])
    expect(p.devDependencies).toEqual(['flutter_lints', 'flutter_test'])
    expect(p.dependencyCount).toBe(2)
    expect(p.hasFlutterSdkDependency).toBe(true)
  })

  it('ignores comments and blank lines', () => {
    const text = '# top\nname: demo\n\n# trailing\ndescription: desc # inline not supported\n'
    const p = parsePubspec(text)
    expect(p.name).toBe('demo')
    expect(p.description).toBe('desc')
  })

  it('unquotes single and double quoted values', () => {
    const p = parsePubspec('name: "quoted"\ndescription: \'single\'\n')
    expect(p.name).toBe('quoted')
    expect(p.description).toBe('single')
  })

  it('reads a bare number sdk constraint', () => {
    const p = parsePubspec('environment:\n  sdk: ">=2.17.0"\n')
    expect(p.sdkConstraint).toBe('>=2.17.0')
  })

  it('returns null fields when they are absent', () => {
    const p = parsePubspec('name: only\n')
    expect(p.description).toBeNull()
    expect(p.sdkConstraint).toBeNull()
    expect(p.dependencies).toEqual([])
    expect(p.devDependencies).toEqual([])
    expect(p.dependencyCount).toBe(0)
    expect(p.hasFlutterSdkDependency).toBe(false)
  })

  it('separates dependencies and dev_dependencies', () => {
    const text = 'dependencies:\n  a: 1.0.0\ndev_dependencies:\n  b: 2.0.0\n'
    const p = parsePubspec(text)
    expect(p.dependencies).toEqual(['a'])
    expect(p.devDependencies).toEqual(['b'])
  })

  it('de-duplicates dependency names', () => {
    const text = 'dependencies:\n  a: 1.0.0\n  a: 2.0.0\n'
    const p = parsePubspec(text)
    expect(p.dependencies).toEqual(['a'])
  })

  it('sorts dependency names ascending', () => {
    const text = 'dependencies:\n  z: 1\n  a: 1\n  m: 1\n'
    const p = parsePubspec(text)
    expect(p.dependencies).toEqual(['a', 'm', 'z'])
  })

  it('reads list-form dependency values', () => {
    const text = 'dependencies:\n  - cupertino_icons\n  - shared_preferences\n'
    const p = parsePubspec(text)
    expect(p.dependencies).toEqual(['cupertino_icons', 'shared_preferences'])
  })

  it('reads a git-hosted dependency map by key', () => {
    const text = 'dependencies:\n  my_pkg:\n    git:\n      url: https://example.com/my_pkg.git\n'
    const p = parsePubspec(text)
    expect(p.dependencies).toEqual(['my_pkg'])
  })

  it('sets hasFlutterSdkDependency only when flutter sdk is declared', () => {
    const text = 'dependencies:\n  cupertino_icons: ^1.0.0\n'
    const p = parsePubspec(text)
    expect(p.hasFlutterSdkDependency).toBe(false)
  })

  it('handles a pubspec with no dependencies at all', () => {
    const p = parsePubspec('name: bare\nenvironment:\n  sdk: ">=3.0.0"\n')
    expect(p.dependencies).toEqual([])
    expect(p.devDependencies).toEqual([])
    expect(p.hasFlutterSdkDependency).toBe(false)
  })
})

describe('pubspecDependencyDelta', () => {
  it('reports missing and undeclared in sorted order', () => {
    const p = parsePubspec('dependencies:\n  a: 1\n  b: 1\n')
    const r = pubspecDependencyDelta(p, ['b', 'c'])
    expect(r.missing).toEqual(['a'])
    expect(r.undeclared).toEqual(['c'])
  })

  it('excludes devDependencies from the comparison', () => {
    const p = parsePubspec('dev_dependencies:\n  d: 1\n')
    const r = pubspecDependencyDelta(p, [])
    expect(r.missing).toEqual([])
    expect(r.undeclared).toEqual([])
  })

  it('returns empty arrays when the two sets agree', () => {
    const p = parsePubspec('dependencies:\n  a: 1\n  b: 1\n')
    const r = pubspecDependencyDelta(p, ['a', 'b'])
    expect(r.missing).toEqual([])
    expect(r.undeclared).toEqual([])
  })
})

describe('formatFlutterPubspec', () => {
  it('formats a full pubspec', () => {
    const p = parsePubspec('name: app\ndescription: d\nenvironment:\n  sdk: ">=3.0.0"\ndependencies:\n  a: 1\ndev_dependencies:\n  t: 1\n')
    expect(formatFlutterPubspec(p)).toBe('name=app sdk=>=3.0.0 deps=1 devDeps=1 flutterSdk=no')
  })

  it('uses unknown and unconstrained for absent values', () => {
    const p = parsePubspec('name: x\n')
    expect(formatFlutterPubspec(p)).toBe('name=x sdk=unconstrained deps=0 devDeps=0 flutterSdk=no')
  })
})
