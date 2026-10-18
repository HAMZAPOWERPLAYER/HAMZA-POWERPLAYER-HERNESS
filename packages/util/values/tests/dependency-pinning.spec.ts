import { describe, expect, it } from 'vitest'
import {
  auditDependencySpecifiers,
  classifySpecifier,
  formatDependencyAudit,
  type DependencyPolicy,
  type DependencyViolation,
  type SpecifierKind,
} from '../src/dependency-pinning.ts'

function policy(...allowedKinds: SpecifierKind[]): DependencyPolicy {
  return { allowedKinds }
}

describe('classifySpecifier', () => {
  it('returns unknown for an empty value', () => {
    expect(classifySpecifier('')).toBe('unknown')
  })

  it('returns unknown for a whitespace-only value', () => {
    expect(classifySpecifier(' ')).toBe('unknown')
    expect(classifySpecifier('   ')).toBe('unknown')
    expect(classifySpecifier('\t\n')).toBe('unknown')
  })

  it('classifies the workspace protocol', () => {
    expect(classifySpecifier('workspace:*')).toBe('workspace')
    expect(classifySpecifier('workspace:^1.0.0')).toBe('workspace')
    expect(classifySpecifier('workspace:~')).toBe('workspace')
  })

  it('classifies workspace:* as workspace rather than wildcard', () => {
    expect(classifySpecifier('workspace:*')).toBe('workspace')
    expect(classifySpecifier('workspace:1.x')).toBe('workspace')
  })

  it('classifies file, link, and portal specifiers as file', () => {
    expect(classifySpecifier('file:../local-pkg')).toBe('file')
    expect(classifySpecifier('link:../local-pkg')).toBe('file')
    expect(classifySpecifier('portal:../local-pkg')).toBe('file')
  })

  it('classifies git hosts and git URLs as git', () => {
    expect(classifySpecifier('git+ssh://git@example.com/owner/repo')).toBe('git')
    expect(classifySpecifier('github:owner/repo')).toBe('git')
    expect(classifySpecifier('gitlab:owner/repo')).toBe('git')
    expect(classifySpecifier('bitbucket:team/repo')).toBe('git')
  })

  it('classifies a .git URL as git', () => {
    expect(classifySpecifier('https://example.com/vendor/pkg.git')).toBe('git')
    expect(classifySpecifier('git://example.com/vendor/pkg.git')).toBe('git')
  })

  it('classifies git+https as git rather than url', () => {
    expect(classifySpecifier('git+https://example.com/vendor/pkg.tgz')).toBe('git')
  })

  it('classifies http and https tarballs as url', () => {
    expect(classifySpecifier('http://example.com/pkg.tgz')).toBe('url')
    expect(classifySpecifier('https://registry.example.com/pkg/-/pkg-1.0.0.tgz')).toBe('url')
  })

  it('classifies an npm alias by the aliased specifier', () => {
    expect(classifySpecifier('npm:^1.0.0')).toBe('caret')
    expect(classifySpecifier('npm:1.2.3')).toBe('exact')
    expect(classifySpecifier('npm:*')).toBe('wildcard')
    expect(classifySpecifier('npm:latest')).toBe('tag')
    expect(classifySpecifier('npm:workspace:*')).toBe('workspace')
  })

  it('classifies a bare npm prefix as unknown', () => {
    expect(classifySpecifier('npm:')).toBe('unknown')
  })

  it('classifies a star range as wildcard', () => {
    expect(classifySpecifier('*')).toBe('wildcard')
    expect(classifySpecifier('1.2.*')).toBe('wildcard')
    expect(classifySpecifier('>=1.0.0 <2.0.0 || *')).toBe('wildcard')
  })

  it('classifies a caret range carrying a star as wildcard', () => {
    expect(classifySpecifier('^1.2.*')).toBe('wildcard')
  })

  it('classifies x-segment patterns as wildcard', () => {
    expect(classifySpecifier('x')).toBe('wildcard')
    expect(classifySpecifier('X')).toBe('wildcard')
    expect(classifySpecifier('1.x')).toBe('wildcard')
    expect(classifySpecifier('1.X')).toBe('wildcard')
    expect(classifySpecifier('1.x.x')).toBe('wildcard')
  })

  it('classifies a digit-only version as exact rather than wildcard', () => {
    expect(classifySpecifier('1.2.3')).toBe('exact')
    expect(classifySpecifier('10.20.30')).toBe('exact')
  })

  it('does not treat an alphanumeric segment as an x-segment pattern', () => {
    expect(classifySpecifier('x1')).toBe('unknown')
    expect(classifySpecifier('1.x-dev')).toBe('unknown')
  })

  it('classifies dist-tags case-insensitively', () => {
    expect(classifySpecifier('latest')).toBe('tag')
    expect(classifySpecifier('NEXT')).toBe('tag')
    expect(classifySpecifier('Beta')).toBe('tag')
    expect(classifySpecifier('alpha')).toBe('tag')
    expect(classifySpecifier('canary')).toBe('tag')
    expect(classifySpecifier('RC')).toBe('tag')
  })

  it('classifies caret and tilde ranges', () => {
    expect(classifySpecifier('^1.2.3')).toBe('caret')
    expect(classifySpecifier('^0.0.1')).toBe('caret')
    expect(classifySpecifier('~1.2.3')).toBe('tilde')
    expect(classifySpecifier('~0.1')).toBe('tilde')
  })

  it('classifies comparator ranges', () => {
    expect(classifySpecifier('>=1.2.3')).toBe('range')
    expect(classifySpecifier('<=2.0.0')).toBe('range')
    expect(classifySpecifier('>1.0.0')).toBe('range')
    expect(classifySpecifier('<2.0.0')).toBe('range')
    expect(classifySpecifier('=1.2.3')).toBe('range')
  })

  it('classifies a union range by its leading token', () => {
    expect(classifySpecifier('1.2.3 || 2.0.0')).toBe('range')
    expect(classifySpecifier('>=1.0.0 || <2.0.0')).toBe('range')
    expect(classifySpecifier('^1.0.0 || ^2.0.0')).toBe('caret')
  })

  it('classifies a hyphen range', () => {
    expect(classifySpecifier('1.2.3 - 2.0.0')).toBe('range')
  })

  it('classifies an exact version', () => {
    expect(classifySpecifier('1.2.3')).toBe('exact')
    expect(classifySpecifier('0.0.0')).toBe('exact')
  })

  it('classifies an exact version with a prerelease', () => {
    expect(classifySpecifier('1.2.3-beta.1')).toBe('exact')
    expect(classifySpecifier('1.2.3-0')).toBe('exact')
  })

  it('classifies an exact version with build metadata', () => {
    expect(classifySpecifier('1.2.3+build.5')).toBe('exact')
  })

  it('classifies an exact version with prerelease and build metadata', () => {
    expect(classifySpecifier('1.2.3-rc.1+build.5')).toBe('exact')
  })

  it('returns unknown for versions that do not match the pinned form', () => {
    expect(classifySpecifier('1.2')).toBe('unknown')
    expect(classifySpecifier('1.2.3-')).toBe('unknown')
    expect(classifySpecifier('v1.2.3')).toBe('unknown')
    expect(classifySpecifier('1.2.3 ')).toBe('unknown')
  })

  it('returns unknown for values that are not versions', () => {
    expect(classifySpecifier('not a version')).toBe('unknown')
    expect(classifySpecifier('owner/repo')).toBe('unknown')
    expect(classifySpecifier('@scope/name@1.0.0')).toBe('unknown')
  })
})

describe('auditDependencySpecifiers', () => {
  it('reports no violations when every specifier is allowed', () => {
    expect(auditDependencySpecifiers({ react: '^18.2.0', preact: '^10.0.0' }, policy('caret')))
      .toEqual([])
  })

  it('reports a dependency whose kind the policy denies', () => {
    const violations = auditDependencySpecifiers({ react: '^18.2.0', pinned: '1.2.3' }, policy('caret'))
    expect(violations).toEqual([{ name: 'pinned', specifier: '1.2.3', kind: 'exact' }])
  })

  it('reports each denial with its name, specifier, and kind', () => {
    const violations = auditDependencySpecifiers({ floating: '*', tarball: 'https://example.com/p.tgz' }, policy())
    expect(violations).toHaveLength(2)
    expect(violations).toEqual([
      { name: 'floating', specifier: '*', kind: 'wildcard' },
      { name: 'tarball', specifier: 'https://example.com/p.tgz', kind: 'url' },
    ])
  })

  it('reports every dependency under an empty policy', () => {
    const violations = auditDependencySpecifiers(
      { a: '^1.0.0', b: '1.2.3', c: 'workspace:*' },
      policy(),
    )
    expect(violations).toHaveLength(3)
    expect(violations.map(violation => violation.name)).toEqual(['a', 'b', 'c'])
  })

  it('sorts violations by name in code-unit order', () => {
    const violations = auditDependencySpecifiers(
      { zeta: '1.0.0', Alpha: '1.0.0', aB: '1.0.0', 'a-b': '1.0.0', beta: '1.0.0' },
      policy(),
    )
    expect(violations.map(violation => violation.name)).toEqual(['Alpha', 'a-b', 'aB', 'beta', 'zeta'])
  })

  it('returns no violations for an empty dependency map', () => {
    expect(auditDependencySpecifiers({}, policy())).toEqual([])
  })

  it('leaves the dependency map unchanged', () => {
    const dependencies = { beta: '*', Alpha: '1.0.0' }
    auditDependencySpecifiers(dependencies, policy('caret'))
    expect(dependencies).toEqual({ beta: '*', Alpha: '1.0.0' })
  })

  it('accepts a dependency whose kind is one of several allowed', () => {
    const violations = auditDependencySpecifiers(
      { caretRange: '^1.0.0', tildeRange: '~1.0.0' },
      policy('caret', 'tilde', 'exact'),
    )
    expect(violations).toEqual([])
  })

  it('reports an unclassifiable specifier under a pinned-only policy', () => {
    const violations = auditDependencySpecifiers({ odd: 'owner/repo' }, policy('exact'))
    expect(violations).toEqual([{ name: 'odd', specifier: 'owner/repo', kind: 'unknown' }])
  })

  it('reports a workspace dependency when the policy excludes workspace', () => {
    const violations = auditDependencySpecifiers({ sibling: 'workspace:*' }, policy('exact', 'caret'))
    expect(violations).toEqual([{ name: 'sibling', specifier: 'workspace:*', kind: 'workspace' }])
  })
})

describe('formatDependencyAudit', () => {
  it('reports that every specifier satisfies the policy', () => {
    expect(formatDependencyAudit([])).toBe('every specifier satisfies the policy')
  })

  it('renders one line per violation', () => {
    const violations = auditDependencySpecifiers({ floating: '*', local: 'file:../pkg' }, policy())
    expect(formatDependencyAudit(violations)).toBe('floating: * (wildcard)\nlocal: file:../pkg (file)')
  })

  it('renders a single violation without a trailing newline', () => {
    const violations: readonly DependencyViolation[] = [{ name: 'pinned', specifier: '1.2.3', kind: 'exact' }]
    expect(formatDependencyAudit(violations)).toBe('pinned: 1.2.3 (exact)')
  })

  it('preserves the given violation order', () => {
    const violations: readonly DependencyViolation[] = [
      { name: 'zeta', specifier: '*', kind: 'wildcard' },
      { name: 'alpha', specifier: '^1.0.0', kind: 'caret' },
    ]
    expect(formatDependencyAudit(violations)).toBe('zeta: * (wildcard)\nalpha: ^1.0.0 (caret)')
  })

  it('formats an audit end to end', () => {
    const violations = auditDependencySpecifiers(
      { zeta: '^1.0.0', alpha: '1.0.0', beta: '~1.0.0' },
      policy('caret'),
    )
    expect(formatDependencyAudit(violations)).toBe('alpha: 1.0.0 (exact)\nbeta: ~1.0.0 (tilde)')
  })
})
