import { describe, expect, it } from 'vitest'
import {
  analyzeFlutterDependencies,
  flutterDependencyHealth,
  formatFlutterDependencyIssue,
  type FlutterDependencyIssue,
} from '../src/flutter-deps.ts'
import type { FlutterPubspec } from '../src/flutter-pubspec-model.ts'

function pubspec(overrides: {
  readonly sdkConstraint?: string | null
  readonly dependencies?: readonly string[]
  readonly hasFlutterSdkDependency?: boolean
}): FlutterPubspec {
  const dependencies = overrides.dependencies ?? ['flutter', 'http', 'provider']
  return {
    name: 'my_app',
    description: null,
    sdkConstraint: overrides.sdkConstraint === undefined ? '>=3.0.0 <4.0.0' : overrides.sdkConstraint,
    dependencies,
    devDependencies: [],
    dependencyCount: dependencies.length,
    hasFlutterSdkDependency: overrides.hasFlutterSdkDependency ?? true,
  }
}

const known = ['flutter', 'http', 'provider']

describe('analyzeFlutterDependencies', () => {
  it('reports no issues for a healthy pubspec', () => {
    const issues = analyzeFlutterDependencies(pubspec({}), known)
    expect(issues).toHaveLength(0)
  })

  it('reports a declared dependency missing from the known set', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter', 'http', 'provider', 'missing_pkg'] }),
      known,
    )
    expect(issues).toEqual([{ name: 'missing_pkg', kind: 'missing', detail: 'not in known package set' }])
  })

  it('sorts multiple missing issues by name', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter', 'z_pkg', 'a_pkg', 'http'] }),
      ['flutter', 'http'],
    )
    expect(issues).toEqual([
      { name: 'a_pkg', kind: 'missing', detail: 'not in known package set' },
      { name: 'z_pkg', kind: 'missing', detail: 'not in known package set' },
    ])
  })

  it('reports a known package not declared in the pubspec', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter', 'http'] }),
      ['flutter', 'http', 'provider'],
    )
    expect(issues).toEqual([{ name: 'provider', kind: 'undeclared', detail: 'not declared in pubspec' }])
  })

  it('sorts multiple undeclared issues by name', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter'] }),
      ['z_known', 'a_known', 'flutter'],
    )
    expect(issues).toEqual([
      { name: 'a_known', kind: 'undeclared', detail: 'not declared in pubspec' },
      { name: 'z_known', kind: 'undeclared', detail: 'not declared in pubspec' },
    ])
  })

  it('reports a missing Flutter SDK dependency', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ hasFlutterSdkDependency: false }),
      known,
    )
    expect(issues).toEqual([{
      name: 'flutter',
      kind: 'flutter-sdk-missing',
      detail: 'pubspec does not declare the Flutter SDK dependency',
    }])
  })

  it('reports a missing environment.sdk constraint', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ sdkConstraint: null }),
      known,
    )
    expect(issues).toEqual([{
      name: 'flutter',
      kind: 'sdk-constraint-missing',
      detail: 'environment.sdk constraint not declared',
    }])
  })

  it('treats every declared dependency as missing when the known set is empty', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter', 'http'] }),
      [],
    )
    expect(issues).toEqual([
      { name: 'flutter', kind: 'missing', detail: 'not in known package set' },
      { name: 'http', kind: 'missing', detail: 'not in known package set' },
    ])
  })

  it('does not duplicate issues when the known set repeats entries', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter', 'http', 'provider'] }),
      ['flutter', 'http', 'http', 'provider', 'provider'],
    )
    expect(issues).toHaveLength(0)
  })

  it('sorts same-name issues by kind when several findings apply', () => {
    const issues = analyzeFlutterDependencies(
      pubspec({ dependencies: ['flutter'], sdkConstraint: null, hasFlutterSdkDependency: false }),
      [],
    )
    expect(issues).toEqual([
      { name: 'flutter', kind: 'flutter-sdk-missing', detail: 'pubspec does not declare the Flutter SDK dependency' },
      { name: 'flutter', kind: 'missing', detail: 'not in known package set' },
      { name: 'flutter', kind: 'sdk-constraint-missing', detail: 'environment.sdk constraint not declared' },
    ])
  })
})

describe('formatFlutterDependencyIssue', () => {
  it('formats a missing issue', () => {
    const issue: FlutterDependencyIssue = {
      name: 'missing_pkg',
      kind: 'missing',
      detail: 'not in known package set',
    }
    expect(formatFlutterDependencyIssue(issue)).toBe('missing_pkg: missing — not in known package set')
  })

  it('formats a flutter-sdk-missing issue', () => {
    const issue: FlutterDependencyIssue = {
      name: 'flutter',
      kind: 'flutter-sdk-missing',
      detail: 'pubspec does not declare the Flutter SDK dependency',
    }
    expect(formatFlutterDependencyIssue(issue)).toBe('flutter: flutter-sdk-missing — pubspec does not declare the Flutter SDK dependency')
  })

  it('formats an undeclared issue', () => {
    const issue: FlutterDependencyIssue = {
      name: 'provider',
      kind: 'undeclared',
      detail: 'not declared in pubspec',
    }
    expect(formatFlutterDependencyIssue(issue)).toBe('provider: undeclared — not declared in pubspec')
  })

  it('formats a sdk-constraint-missing issue', () => {
    const issue: FlutterDependencyIssue = {
      name: 'flutter',
      kind: 'sdk-constraint-missing',
      detail: 'environment.sdk constraint not declared',
    }
    expect(formatFlutterDependencyIssue(issue)).toBe('flutter: sdk-constraint-missing — environment.sdk constraint not declared')
  })
})

describe('flutterDependencyHealth', () => {
  it('is healthy when no issues apply', () => {
    expect(flutterDependencyHealth(pubspec({}), known)).toBe('healthy')
  })

  it('is warning when only a dependency is missing', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: ['flutter', 'http', 'provider', 'missing_pkg'] }),
      known,
    )).toBe('warning')
  })

  it('is warning when only a dependency is undeclared', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: ['flutter', 'http'] }),
      ['flutter', 'http', 'provider'],
    )).toBe('warning')
  })

  it('is warning when only the sdk constraint is missing', () => {
    expect(flutterDependencyHealth(pubspec({ sdkConstraint: null }), known)).toBe('warning')
  })

  it('is critical when only the Flutter SDK dependency is missing', () => {
    expect(flutterDependencyHealth(
      pubspec({ hasFlutterSdkDependency: false }),
      known,
    )).toBe('critical')
  })

  it('is critical when a missing dependency accompanies a missing Flutter SDK', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: ['flutter', 'http'], hasFlutterSdkDependency: false }),
      ['http'],
    )).toBe('critical')
  })

  it('is critical when a missing Flutter SDK accompanies a missing sdk constraint', () => {
    expect(flutterDependencyHealth(
      pubspec({ sdkConstraint: null, hasFlutterSdkDependency: false }),
      known,
    )).toBe('critical')
  })

  it('is warning when undeclared and sdk-constraint-missing combine', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: ['flutter'], sdkConstraint: null }),
      ['flutter', 'provider'],
    )).toBe('warning')
  })

  it('is critical when every issue type is present', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: ['flutter', 'missing_pkg'], sdkConstraint: null, hasFlutterSdkDependency: false }),
      ['flutter', 'extra_pkg'],
    )).toBe('critical')
  })

  it('is healthy for an empty pubspec with an empty known set', () => {
    expect(flutterDependencyHealth(
      pubspec({ dependencies: [], sdkConstraint: '>=3.0.0 <4.0.0', hasFlutterSdkDependency: true }),
      [],
    )).toBe('healthy')
  })
})
