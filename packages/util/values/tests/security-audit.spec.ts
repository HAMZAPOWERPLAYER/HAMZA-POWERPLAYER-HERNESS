import { describe, expect, it } from 'vitest'
import {
  auditFailures,
  auditPassed,
  checkAbsolutePath,
  checkPathTraversal,
  checkSecretLeakage,
  checkSymlinkEscape,
  checkToolArgument,
  runSecurityAudit,
  type SecurityCheckResult,
} from '../src/security-audit.ts'

describe('checkPathTraversal', () => {
  it('passes for normal paths', () => {
    expect(checkPathTraversal('src/main.ts')).toEqual({
      check: 'path-traversal',
      passed: true,
    })
  })

  it('rejects ../ traversal', () => {
    const r = checkPathTraversal('../etc/passwd')
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('traversal')
  })

  it('rejects ..\\ traversal', () => {
    const r = checkPathTraversal('..\\..\\windows\\system32')
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('traversal')
  })

  it('rejects traversal in middle of path', () => {
    const r = checkPathTraversal('src/../../etc/passwd')
    expect(r.passed).toBe(false)
  })

  it('accepts paths with dots that are not traversal', () => {
    expect(checkPathTraversal('src/file.test.ts')).toEqual({
      check: 'path-traversal',
      passed: true,
    })
  })
})

describe('checkAbsolutePath', () => {
  it('passes for relative paths', () => {
    expect(checkAbsolutePath('src/main.ts')).toEqual({
      check: 'absolute-path',
      passed: true,
    })
  })

  it('rejects POSIX absolute paths', () => {
    const r = checkAbsolutePath('/etc/passwd')
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('absolute path')
  })

  it('rejects Windows absolute paths', () => {
    const r = checkAbsolutePath('C:\\Windows\\System32')
    expect(r.passed).toBe(false)
  })

  it('rejects UNC paths', () => {
    const r = checkAbsolutePath('\\\\server\\share')
    expect(r.passed).toBe(false)
  })
})

describe('checkSymlinkEscape', () => {
  it('passes for normal paths', () => {
    expect(checkSymlinkEscape('src/main.ts')).toEqual({
      check: 'symlink-escape',
      passed: true,
    })
  })

  it('rejects ../ traversal', () => {
    const r = checkSymlinkEscape('../secret')
    expect(r.passed).toBe(false)
  })

  it('rejects traversal in middle', () => {
    const r = checkSymlinkEscape('src/../../etc')
    expect(r.passed).toBe(false)
  })

  it('rejects trailing ..', () => {
    const r = checkSymlinkEscape('src/..')
    expect(r.passed).toBe(false)
  })
})

describe('checkSecretLeakage', () => {
  it('passes for normal text', () => {
    expect(checkSecretLeakage('hello world')).toEqual({
      check: 'secret-leakage',
      passed: true,
    })
  })

  it('rejects sk- API keys', () => {
    const r = checkSecretLeakage('token: sk-abcdefghijklmnopqrstuvwxyz')
    expect(r.passed).toBe(false)
    expect(r.reason).toContain('secret')
  })

  it('rejects password assignments', () => {
    const r = checkSecretLeakage('password = "supersecret123"')
    expect(r.passed).toBe(false)
  })

  it('rejects API key assignments', () => {
    const r = checkSecretLeakage('api_key=abc123def456')
    expect(r.passed).toBe(false)
  })

  it('passes for text with word secret but no value', () => {
    const r = checkSecretLeakage('this is a secret message')
    expect(r.passed).toBe(true)
  })
})

describe('checkToolArgument', () => {
  it('passes for normal arguments', () => {
    expect(checkToolArgument('--output=result.txt')).toEqual({
      check: 'shell-injection',
      passed: true,
    })
  })

  it('rejects shell metacharacters', () => {
    for (const ch of ['&', '|', ';', '<', '>', '$', '`', '\\', '"', "'"]) {
      const r = checkToolArgument(`file${ch}name`)
      expect(r.passed).toBe(false)
      expect(r.reason).toContain('shell metacharacters')
    }
  })

  it('passes for alphanumeric arguments', () => {
    expect(checkToolArgument('filename123')).toEqual({
      check: 'shell-injection',
      passed: true,
    })
  })
})

describe('runSecurityAudit', () => {
  it('runs all checks on each input', () => {
    const results = runSecurityAudit([
      { name: 'path1', value: '../etc/passwd' },
    ])
    expect(results.length).toBe(5)
    expect(results.find((r) => r.check === 'path-traversal')?.passed).toBe(false)
    expect(results.find((r) => r.check === 'symlink-escape')?.passed).toBe(false)
    expect(results.find((r) => r.check === 'absolute-path')?.passed).toBe(true)
    expect(results.find((r) => r.check === 'secret-leakage')?.passed).toBe(true)
    expect(results.find((r) => r.check === 'shell-injection')?.passed).toBe(true)
  })

  it('skips empty values', () => {
    const results = runSecurityAudit([
      { name: 'empty', value: '' },
      { name: 'nullish', value: null },
    ])
    expect(results).toEqual([])
  })

  it('returns results for multiple inputs', () => {
    const results = runSecurityAudit([
      { name: 'a', value: 'src/main.ts' },
      { name: 'b', value: '../secret' },
    ])
    expect(results.length).toBe(10)
  })
})

describe('auditPassed', () => {
  it('returns true when all passed', () => {
    expect(auditPassed([{ check: 'a', passed: true }])).toBe(true)
  })

  it('returns false when any failed', () => {
    expect(
      auditPassed([
        { check: 'a', passed: true },
        { check: 'b', passed: false },
      ]),
    ).toBe(false)
  })

  it('returns true for empty results', () => {
    expect(auditPassed([])).toBe(true)
  })
})

describe('auditFailures', () => {
  it('returns empty when all passed', () => {
    expect(auditFailures([{ check: 'a', passed: true }])).toEqual([])
  })

  it('returns failure reasons', () => {
    const results = auditFailures([
      { check: 'path-traversal', passed: false, reason: 'bad path' },
      { check: 'secret-leakage', passed: false, reason: 'secret found' },
    ])
    expect(results).toEqual([
      'path-traversal: bad path',
      'secret-leakage: secret found',
    ])
  })
})
