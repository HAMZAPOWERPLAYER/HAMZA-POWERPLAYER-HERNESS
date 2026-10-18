import { describe, expect, it } from 'vitest'
import {
  checkConfigCompleteness,
  migrateConfig,
  preserveUserSettings,
  validateConfig,
  type ConfigFieldRule,
  type ConfigValidationResult,
  type ConfigMigrationStep,
} from '../src/config-migration.ts'

function rule(params: {
  path: string
  required?: boolean
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'any'
  allowedValues?: readonly unknown[]
  min?: number
  max?: number
  validate?: (value: unknown) => ConfigValidationProblem | null
}): ConfigFieldRule {
  return {
    path: params.path,
    required: params.required ?? false,
    type: params.type ?? 'any',
    ...(params.allowedValues !== undefined ? { allowedValues: params.allowedValues } : {}),
    ...(params.min !== undefined ? { min: params.min } : {}),
    ...(params.max !== undefined ? { max: params.max } : {}),
    ...(params.validate !== undefined ? { validate: params.validate } : {}),
  }
}

describe('validateConfig', () => {
  it('passes when all required fields are present with correct types', () => {
    const config = { name: 'app', port: 3000, debug: true }
    const rules = [
      rule({ path: 'name', type: 'string', required: true }),
      rule({ path: 'port', type: 'number', required: true }),
      rule({ path: 'debug', type: 'boolean', required: true }),
    ]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('reports missing required fields', () => {
    const config = { name: 'app' }
    const rules = [
      rule({ path: 'name', type: 'string', required: true }),
      rule({ path: 'port', type: 'number', required: true }),
    ]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].path).toBe('port')
    expect(result.problems[0].severity).toBe('error')
  })

  it('reports wrong types', () => {
    const config = { port: 'not-a-number' }
    const rules = [rule({ path: 'port', type: 'number', required: true })]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems[0].path).toBe('port')
    expect(result.problems[0].message).toContain('expected type number')
  })

  it('passes optional fields that are absent', () => {
    const config = { name: 'app' }
    const rules = [rule({ path: 'port', type: 'number', required: false })]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(true)
  })

  it('rejects disallowed values', () => {
    const config = { level: 'invalid' }
    const rules = [
      rule({ path: 'level', type: 'string', allowedValues: ['debug', 'info', 'warn'] }),
    ]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems[0].message).toContain('allowed values')
  })

  it('rejects values below minimum', () => {
    const config = { port: 80 }
    const rules = [rule({ path: 'port', type: 'number', min: 1024 })]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems[0].message).toContain('below minimum')
  })

  it('rejects values above maximum', () => {
    const config = { port: 99999 }
    const rules = [rule({ path: 'port', type: 'number', max: 65535 })]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems[0].message).toContain('exceeds maximum')
  })

  it('runs custom validation functions', () => {
    const config = { name: '' }
    const rules = [
      rule({
        path: 'name',
        type: 'string',
        validate: (v) =>
          (v as string).length === 0
            ? { path: 'name', message: 'name cannot be empty', severity: 'error' }
            : null,
      }),
    ]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems[0].message).toContain('name cannot be empty')
  })

  it('reports multiple problems', () => {
    const config = { port: 'bad', debug: 'also-bad' }
    const rules = [
      rule({ path: 'port', type: 'number', required: true }),
      rule({ path: 'debug', type: 'boolean', required: true }),
    ]
    const result = validateConfig(config, rules)
    expect(result.valid).toBe(false)
    expect(result.problems).toHaveLength(2)
  })
})

describe('migrateConfig', () => {
  const step1to2: ConfigMigrationStep = {
    from: '1.0.0',
    to: '2.0.0',
    migrate: (config) => ({ ...config, schemaVersion: '2.0.0' }),
  }
  const step2to3: ConfigMigrationStep = {
    from: '2.0.0',
    to: '3.0.0',
    migrate: (config) => ({ ...config, schemaVersion: '3.0.0', migrated: true }),
  }

  it('migrates through multiple steps', () => {
    const config = { schemaVersion: '1.0.0', name: 'app' }
    const result = migrateConfig(config, [step1to2, step2to3], '1.0.0', '3.0.0')
    expect(result.migratedConfig).toEqual({
      schemaVersion: '3.0.0',
      name: 'app',
      migrated: true,
    })
    expect(result.migrated).toBe(true)
    expect(result.problems).toEqual([])
  })

  it('returns null when no migration path exists', () => {
    const config = { schemaVersion: '1.0.0', name: 'app' }
    const result = migrateConfig(config, [step1to2], '1.0.0', '3.0.0')
    expect(result.migratedConfig).toBe(null)
    expect(result.migrated).toBe(false)
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].message).toContain('no migration step')
  })

  it('returns original config when source equals target', () => {
    const config = { schemaVersion: '2.0.0', name: 'app' }
    const result = migrateConfig(config, [step1to2, step2to3], '2.0.0', '2.0.0')
    expect(result.migratedConfig).toEqual(config)
    expect(result.migrated).toBe(true)
  })

  it('returns null when a step returns null', () => {
    const failingStep: ConfigMigrationStep = {
      from: '1.0.0',
      to: '2.0.0',
      migrate: () => null,
    }
    const config = { schemaVersion: '1.0.0' }
    const result = migrateConfig(config, [failingStep], '1.0.0', '2.0.0')
    expect(result.migratedConfig).toBe(null)
    expect(result.migrated).toBe(false)
    expect(result.problems[0].message).toContain('migration from 1.0.0 to 2.0.0 failed')
  })
})

describe('preserveUserSettings', () => {
  it('preserves user settings under _preserved', () => {
    const migrated = { schemaVersion: '2.0.0', theme: 'dark' }
    const userConfig = { schemaVersion: '1.0.0', theme: 'light', fontSize: 14 }
    const result = preserveUserSettings(migrated, userConfig, ['theme', 'fontSize'])
    expect(result.theme).toBe('dark')
    expect(result._preserved).toEqual({ theme: 'light', fontSize: 14 })
  })

  it('omits _preserved when no preserved fields exist', () => {
    const migrated = { schemaVersion: '2.0.0' }
    const userConfig = { schemaVersion: '1.0.0' }
    const result = preserveUserSettings(migrated, userConfig, ['nonexistent'])
    expect(result._preserved).toBeUndefined()
  })

  it('omits _preserved when preservedPaths is empty', () => {
    const migrated = { schemaVersion: '2.0.0' }
    const userConfig = { schemaVersion: '1.0.0', theme: 'light' }
    const result = preserveUserSettings(migrated, userConfig, [])
    expect(result._preserved).toBeUndefined()
  })
})

describe('checkConfigCompleteness', () => {
  it('returns missing fields', () => {
    const config = { name: 'app' }
    const missing = checkConfigCompleteness(config, ['name', 'port', 'debug'])
    expect(missing).toEqual(['debug', 'port'])
  })

  it('returns empty when all fields present', () => {
    const config = { name: 'app', port: 3000 }
    const missing = checkConfigCompleteness(config, ['name', 'port'])
    expect(missing).toEqual([])
  })

  it('returns empty for empty required fields', () => {
    const config = { name: 'app' }
    const missing = checkConfigCompleteness(config, [])
    expect(missing).toEqual([])
  })
})
