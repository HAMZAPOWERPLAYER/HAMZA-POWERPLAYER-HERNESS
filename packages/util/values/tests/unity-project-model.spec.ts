import { describe, expect, it } from 'vitest'
import {
  compareEditorVersions,
  formatUnitySummary,
  parseEditorVersion,
  parsePackageManifest,
  type UnityEditorVersion,
} from '../src/unity-project-model.ts'

/** Build the one-line file text that carries a version token. */
function versionLine(token: string): string {
  return `m_EditorVersion: ${token}`
}

/** Parse one version token; a rejected token fails the calling case. */
function version(token: string): UnityEditorVersion {
  const parsed = parseEditorVersion(versionLine(token))
  if (parsed === null) throw new Error(`test token was rejected: ${token}`)
  return parsed
}

describe('parseEditorVersion', () => {
  it('parses a typical ProjectVersion.txt with both version lines', () => {
    const text = [
      'm_EditorVersion: 6000.0.23f1',
      'm_EditorVersionWithRevision: 6000.0.23f1 (1234abcd)',
    ].join('\n')
    expect(parseEditorVersion(text)).toEqual({
      major: 6000,
      minor: 0,
      patch: 23,
      releaseType: 'f',
      revision: 1,
      raw: '6000.0.23f1',
    })
  })

  it('returns null when the file has no m_EditorVersion line', () => {
    expect(parseEditorVersion('')).toBeNull()
    expect(parseEditorVersion('Assets:\n- Assets/Scenes/Level1.unity\n')).toBeNull()
  })

  it('does not read m_EditorVersionWithRevision as the editor version', () => {
    expect(parseEditorVersion('m_EditorVersionWithRevision: 6000.0.23f1 (1234abcd)')).toBeNull()
  })

  it('keeps the revision digits of the token', () => {
    expect(version('6000.0.23f1').revision).toBe(1)
    expect(version('2019.4.40f2').revision).toBe(2)
  })

  it('defaults a missing revision to 0', () => {
    const parsed = version('6000.0.23f')
    expect(parsed.revision).toBe(0)
    expect(parsed.raw).toBe('6000.0.23f')
  })

  it('tolerates surrounding whitespace and CRLF line endings', () => {
    const text = '  m_EditorVersion  :   2021.3.16f1  \r\n'
    expect(parseEditorVersion(text)).toEqual({
      major: 2021,
      minor: 3,
      patch: 16,
      releaseType: 'f',
      revision: 1,
      raw: '2021.3.16f1',
    })
  })

  it('parses every release type', () => {
    expect(version('2020.1.0a1').releaseType).toBe('a')
    expect(version('2020.1.0b2').releaseType).toBe('b')
    expect(version('2020.1.0f3').releaseType).toBe('f')
    expect(version('2020.1.0p4').releaseType).toBe('p')
  })

  it('returns null when the token lacks a release letter', () => {
    expect(parseEditorVersion(versionLine('6000.0.23'))).toBeNull()
    expect(parseEditorVersion(versionLine('6000.0'))).toBeNull()
    expect(parseEditorVersion(versionLine('6000'))).toBeNull()
  })

  it('returns null for an uppercase release letter or trailing text', () => {
    expect(parseEditorVersion(versionLine('6000.0.23F1'))).toBeNull()
    expect(parseEditorVersion(versionLine('6000.0.23f1 (1234abcd)'))).toBeNull()
  })

  it('returns null for a non-version value or an empty value', () => {
    expect(parseEditorVersion(versionLine('not-a-version'))).toBeNull()
    expect(parseEditorVersion('m_EditorVersion:')).toBeNull()
  })

  it('uses the first m_EditorVersion line of a repeated key', () => {
    const text = [versionLine('6000.0.23f1'), versionLine('6000.0.24f2')].join('\n')
    expect(parseEditorVersion(text)).toEqual({
      major: 6000,
      minor: 0,
      patch: 23,
      releaseType: 'f',
      revision: 1,
      raw: '6000.0.23f1',
    })
  })

  it('keeps the written token in raw, including leading zeros', () => {
    const parsed = version('6000.0.023f1')
    expect(parsed.patch).toBe(23)
    expect(parsed.raw).toBe('6000.0.023f1')
  })
})

describe('compareEditorVersions', () => {
  it('orders by major', () => {
    expect(compareEditorVersions(version('2020.9.9f9'), version('2021.0.0a1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('6000.0.1f1'), version('5000.0.1f1'))).toBeGreaterThan(0)
  })

  it('orders by minor', () => {
    expect(compareEditorVersions(version('2020.1.9f1'), version('2020.2.0f1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('2020.2.0f1'), version('2020.1.9f1'))).toBeGreaterThan(0)
  })

  it('orders by patch', () => {
    expect(compareEditorVersions(version('2020.1.0f1'), version('2020.1.1f1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('2020.1.1f1'), version('2020.1.0f1'))).toBeGreaterThan(0)
  })

  it('orders release streams alpha < beta < final < patch', () => {
    expect(compareEditorVersions(version('2020.1.0a1'), version('2020.1.0b1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('2020.1.0b1'), version('2020.1.0f1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('2020.1.0f1'), version('2020.1.0p1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('2020.1.0a1'), version('2020.1.0p1'))).toBeLessThan(0)
  })

  it('orders by revision, with an omitted revision counting as 0', () => {
    expect(compareEditorVersions(version('6000.0.23f'), version('6000.0.23f1'))).toBeLessThan(0)
    expect(compareEditorVersions(version('6000.0.23f1'), version('6000.0.23f2'))).toBeLessThan(0)
  })

  it('returns 0 for equal parsed fields, ignoring the raw text', () => {
    expect(compareEditorVersions(version('2021.3.16f1'), version('2021.3.16f1'))).toBe(0)
    expect(compareEditorVersions(version('6000.0.023f1'), version('6000.0.23f1'))).toBe(0)
  })

  it('mirrors the sign when the arguments are swapped', () => {
    expect(compareEditorVersions(version('2021.3.16f1'), version('2020.1.0f1'))).toBe(1)
    expect(compareEditorVersions(version('2020.1.0f1'), version('2021.3.16f1'))).toBe(-1)
  })
})

describe('parsePackageManifest', () => {
  it('reads the string dependencies of a valid manifest and ignores other keys', () => {
    const text = JSON.stringify({
      name: 'com.example.game',
      version: '1.0.0',
      dependencies: {
        'com.unity.modules.ai': '1.0.0',
        'com.unity.textmeshpro': '3.0.6',
      },
      testables: ['com.example.tests'],
    })
    expect(parsePackageManifest(text)).toEqual({
      'com.unity.modules.ai': '1.0.0',
      'com.unity.textmeshpro': '3.0.6',
    })
  })

  it('returns null for text that is not valid JSON', () => {
    expect(parsePackageManifest('{ "dependencies": }')).toBeNull()
    expect(parsePackageManifest('not json at all')).toBeNull()
  })

  it('returns null when dependencies is missing or not an object', () => {
    expect(parsePackageManifest('{}')).toBeNull()
    expect(parsePackageManifest('{"dependencies": null}')).toBeNull()
    expect(parsePackageManifest('{"dependencies": []}')).toBeNull()
    expect(parsePackageManifest('{"dependencies": "1.0.0"}')).toBeNull()
    expect(parsePackageManifest('[]')).toBeNull()
  })

  it('returns an empty record for an empty dependencies object', () => {
    expect(parsePackageManifest('{"dependencies": {}}')).toEqual({})
  })

  it('drops every non-string dependency value', () => {
    const text = '{"dependencies": {"a": "1.0.0", "b": 2, "c": null, "d": true, "e": {"x": "1.0.0"}, "f": ["1.0.0"]}}'
    expect(parsePackageManifest(text)).toEqual({ a: '1.0.0' })
    expect(parsePackageManifest('{"dependencies": {"b": 2}}')).toEqual({})
  })

  it('keeps a __proto__ dependency name as an ordinary own entry', () => {
    const manifest = parsePackageManifest('{"dependencies": {"__proto__": "1.0.0", "com.unity.x": "1.0.0"}}')
    expect(Object.keys(manifest ?? {})).toEqual(['__proto__', 'com.unity.x'])
    expect(manifest?.['__proto__']).toBe('1.0.0')
  })
})

describe('formatUnitySummary', () => {
  it('reports the absence of a parsed version', () => {
    expect(formatUnitySummary(null)).toBe('no Unity editor version found')
  })

  it('renders the version token and the release name', () => {
    expect(formatUnitySummary(version('6000.0.23f1'))).toBe('Unity 6000.0.23f1 (final)')
  })

  it('names each release stream', () => {
    expect(formatUnitySummary(version('2020.1.0a1'))).toContain('(alpha)')
    expect(formatUnitySummary(version('2020.1.0b1'))).toContain('(beta)')
    expect(formatUnitySummary(version('2020.1.0f1'))).toContain('(final)')
    expect(formatUnitySummary(version('2020.1.0p1'))).toContain('(patch)')
  })
})
