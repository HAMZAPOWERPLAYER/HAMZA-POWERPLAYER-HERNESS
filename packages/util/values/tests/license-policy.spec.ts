import { describe, expect, it } from 'vitest'
import {
  evaluateLicense,
  evaluateLicenses,
  formatLicenseEvaluation,
  normalizeLicenseId,
  unlicensedDependencies,
  type LicensePolicy,
} from '../src/license-policy.ts'

const POLICY: LicensePolicy = {
  allowed: ['MIT', 'Apache-2.0'],
  denied: ['GPL-3.0-only', 'AGPL-3.0-only'],
}

describe('normalizeLicenseId', () => {
  it('trims surrounding whitespace and uppercases', () => {
    expect(normalizeLicenseId('  mit ')).toBe('MIT')
  })
  it('collapses internal whitespace runs to a single space', () => {
    expect(normalizeLicenseId('Apache \t\n 2.0')).toBe('APACHE 2.0')
  })
  it('keeps hyphenated and spaced spellings distinct', () => {
    expect(normalizeLicenseId('Apache-2.0')).toBe('APACHE-2.0')
    expect(normalizeLicenseId('Apache 2.0')).toBe('APACHE 2.0')
  })
  it('returns the empty string for a blank identifier', () => {
    expect(normalizeLicenseId('   ')).toBe('')
  })
  it('preserves punctuation other than whitespace', () => {
    expect(normalizeLicenseId('gpl-3.0-or-later')).toBe('GPL-3.0-OR-LATER')
  })
})

describe('evaluateLicense', () => {
  it('allows an identifier the policy lists', () => {
    expect(evaluateLicense('MIT', POLICY)).toBe('allowed')
  })
  it('matches through case and surrounding whitespace', () => {
    expect(evaluateLicense('  apache-2.0 ', POLICY)).toBe('allowed')
  })
  it('matches policy entries that are not normalized yet', () => {
    const policy: LicensePolicy = { allowed: ['  mit '], denied: [' gpl-3.0-only'] }
    expect(evaluateLicense('MIT', policy)).toBe('allowed')
    expect(evaluateLicense('GPL-3.0-only', policy)).toBe('denied')
  })
  it('denies an identifier the policy forbids', () => {
    expect(evaluateLicense('gpl-3.0-only', POLICY)).toBe('denied')
  })
  it('prefers denial when both lists name the identifier', () => {
    expect(evaluateLicense('MIT', { allowed: ['MIT'], denied: ['mit'] })).toBe('denied')
  })
  it('leaves an unlisted identifier unknown instead of allowing it', () => {
    expect(evaluateLicense('BSD-3-Clause', POLICY)).toBe('unknown')
  })
  it('treats an empty identifier as unknown', () => {
    expect(evaluateLicense('', POLICY)).toBe('unknown')
  })
  it('treats a whitespace-only identifier as unknown', () => {
    expect(evaluateLicense('  \t ', POLICY)).toBe('unknown')
  })
  it('ignores policy entries that name no identifier', () => {
    const policy: LicensePolicy = { allowed: [''], denied: ['   '] }
    expect(evaluateLicense('', policy)).toBe('unknown')
    expect(evaluateLicense('MIT', policy)).toBe('unknown')
  })
})

describe('evaluateLicenses', () => {
  it('allows a list whose identifiers are all allowed', () => {
    expect(evaluateLicenses(['MIT', 'apache-2.0'], POLICY)).toEqual({
      entries: [
        { id: 'MIT', decision: 'allowed' },
        { id: 'APACHE-2.0', decision: 'allowed' },
      ],
      overall: 'allowed',
      unknownIds: [],
      deniedIds: [],
    })
  })
  it('denies the list when any identifier is denied', () => {
    const evaluation = evaluateLicenses(['MIT', 'GPL-3.0-only'], POLICY)
    expect(evaluation.overall).toBe('denied')
    expect(evaluation.deniedIds).toEqual(['GPL-3.0-ONLY'])
    expect(evaluation.unknownIds).toEqual([])
  })
  it('reports unknown when any identifier is unknown', () => {
    const evaluation = evaluateLicenses(['MIT', 'BSD-3-Clause'], POLICY)
    expect(evaluation.overall).toBe('unknown')
    expect(evaluation.unknownIds).toEqual(['BSD-3-CLAUSE'])
    expect(evaluation.deniedIds).toEqual([])
  })
  it('prefers denial over unknown in a mixed list', () => {
    const evaluation = evaluateLicenses(['BSD-3-Clause', 'GPL-3.0-only'], POLICY)
    expect(evaluation.overall).toBe('denied')
    expect(evaluation.deniedIds).toEqual(['GPL-3.0-ONLY'])
    expect(evaluation.unknownIds).toEqual(['BSD-3-CLAUSE'])
  })
  it('treats an empty list as unknown', () => {
    expect(evaluateLicenses([], POLICY)).toEqual({
      entries: [],
      overall: 'unknown',
      unknownIds: [],
      deniedIds: [],
    })
  })
  it('keeps entries in input order with normalized ids', () => {
    const evaluation = evaluateLicenses(['GPL-3.0-only', 'MIT', 'Zlib'], POLICY)
    expect(evaluation.entries).toEqual([
      { id: 'GPL-3.0-ONLY', decision: 'denied' },
      { id: 'MIT', decision: 'allowed' },
      { id: 'ZLIB', decision: 'unknown' },
    ])
  })
  it('keeps unknownIds in input order', () => {
    const evaluation = evaluateLicenses(['Zlib', 'BSD-3-Clause', 'MIT'], POLICY)
    expect(evaluation.unknownIds).toEqual(['ZLIB', 'BSD-3-CLAUSE'])
  })
  it('keeps deniedIds in input order', () => {
    const evaluation = evaluateLicenses(['AGPL-3.0-only', 'MIT', 'GPL-3.0-only'], POLICY)
    expect(evaluation.deniedIds).toEqual(['AGPL-3.0-ONLY', 'GPL-3.0-ONLY'])
  })
  it('de-duplicates identifiers that normalize alike', () => {
    const evaluation = evaluateLicenses(['mit', ' MIT ', 'Mit'], POLICY)
    expect(evaluation.entries).toHaveLength(1)
    expect(evaluation.entries).toEqual([{ id: 'MIT', decision: 'allowed' }])
    expect(evaluation.overall).toBe('allowed')
  })
  it('records a blank identifier as an unknown entry', () => {
    const evaluation = evaluateLicenses(['', 'MIT'], POLICY)
    expect(evaluation.entries).toEqual([
      { id: '', decision: 'unknown' },
      { id: 'MIT', decision: 'allowed' },
    ])
    expect(evaluation.unknownIds).toEqual([''])
    expect(evaluation.overall).toBe('unknown')
  })
})

describe('formatLicenseEvaluation', () => {
  it('renders only the overall line when nothing is denied or unknown', () => {
    expect(formatLicenseEvaluation(evaluateLicenses(['MIT'], POLICY))).toBe('overall: allowed')
  })
  it('renders the denied line when identifiers were denied', () => {
    expect(formatLicenseEvaluation(evaluateLicenses(['GPL-3.0-only', 'AGPL-3.0-only'], POLICY)))
      .toBe('overall: denied\ndenied: GPL-3.0-ONLY, AGPL-3.0-ONLY')
  })
  it('renders the unknown line when identifiers were unknown', () => {
    expect(formatLicenseEvaluation(evaluateLicenses(['Zlib', 'BSD-3-Clause'], POLICY)))
      .toBe('overall: unknown\nunknown: ZLIB, BSD-3-CLAUSE')
  })
  it('renders denied before unknown', () => {
    expect(formatLicenseEvaluation(evaluateLicenses(['BSD-3-Clause', 'GPL-3.0-only'], POLICY)))
      .toBe('overall: denied\ndenied: GPL-3.0-ONLY\nunknown: BSD-3-CLAUSE')
  })
  it('renders the empty evaluation', () => {
    expect(formatLicenseEvaluation(evaluateLicenses([], POLICY))).toBe('overall: unknown')
  })
})

describe('unlicensedDependencies', () => {
  it('reports names whose license is null', () => {
    expect(unlicensedDependencies({ alpha: null }, POLICY)).toEqual(['alpha'])
  })
  it('reports names whose license is empty or blank', () => {
    expect(unlicensedDependencies({ beta: '', gamma: '   ' }, POLICY)).toEqual(['beta', 'gamma'])
  })
  it('reports names whose license is unknown to the policy', () => {
    expect(unlicensedDependencies({ delta: 'BSD-3-Clause' }, POLICY)).toEqual(['delta'])
  })
  it('omits allowed and denied licenses', () => {
    expect(unlicensedDependencies({ allowed: 'mit', denied: 'GPL-3.0-only' }, POLICY)).toEqual([])
  })
  it('sorts names in code-unit order', () => {
    expect(unlicensedDependencies({ zeta: null, Alpha: null, beta: '', MIT: null }, POLICY))
      .toEqual(['Alpha', 'MIT', 'beta', 'zeta'])
  })
})
