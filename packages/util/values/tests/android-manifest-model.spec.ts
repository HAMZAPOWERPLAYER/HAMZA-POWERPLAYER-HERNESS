import { describe, expect, it } from 'vitest'
import {
  DANGEROUS_PERMISSIONS,
  auditAndroidSdkLevels,
  dangerousPermissions,
  formatAndroidManifestSummary,
  parseAndroidManifest,
  type AndroidManifest,
} from '../src/android-manifest-model.ts'

const REALISTIC_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.example.review">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <application android:name=".ReviewApplication" android:label="Review" />
</manifest>`

const INTERNET_ONLY_MANIFEST = `<manifest package="com.example.internet">
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-sdk android:minSdkVersion="24" android:targetSdkVersion="34" />
</manifest>`

const POLICY = { minTargetSdkVersion: 33 }

/**
 * Build an audit fixture manifest.
 * @param minSdkVersion - declared minimum SDK level, or `null` when undeclared.
 * @param targetSdkVersion - declared target SDK level, or `null` when undeclared.
 * @returns a manifest with no permissions and the given SDK levels.
 */
function auditManifest(minSdkVersion: number | null, targetSdkVersion: number | null): AndroidManifest {
  return { packageName: 'com.example.audit', minSdkVersion, targetSdkVersion, permissions: [] }
}

describe('parseAndroidManifest', () => {
  it('reads the package, SDK levels, and permissions of a full manifest', () => {
    const manifest = parseAndroidManifest(REALISTIC_MANIFEST)
    expect(manifest.packageName).toBe('com.example.review')
    expect(manifest.minSdkVersion).toBe(24)
    expect(manifest.targetSdkVersion).toBe(34)
    expect(manifest.permissions).toEqual([
      'android.permission.INTERNET',
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
    ])
  })

  it('reads single-quoted attribute values', () => {
    const manifest = parseAndroidManifest(`<manifest package='com.example.single'>
      <uses-sdk android:minSdkVersion='21' android:targetSdkVersion='33' />
      <uses-permission android:name='android.permission.CAMERA' />
    </manifest>`)
    expect(manifest.packageName).toBe('com.example.single')
    expect(manifest.minSdkVersion).toBe(21)
    expect(manifest.targetSdkVersion).toBe(33)
    expect(manifest.permissions).toEqual(['android.permission.CAMERA'])
  })

  it('reads bare SDK attribute names and tolerates whitespace around the equals sign', () => {
    const manifest = parseAndroidManifest(`<manifest package="com.example.bare">
      <uses-sdk minSdkVersion = "19" targetSdkVersion="29" />
    </manifest>`)
    expect(manifest.minSdkVersion).toBe(19)
    expect(manifest.targetSdkVersion).toBe(29)
  })

  it('returns null SDK levels when the uses-sdk element is absent', () => {
    const manifest = parseAndroidManifest('<manifest package="com.example.nosdk"><application android:name=".App" /></manifest>')
    expect(manifest.minSdkVersion).toBeNull()
    expect(manifest.targetSdkVersion).toBeNull()
  })

  it('returns null for non-integer SDK values', () => {
    const fractional = parseAndroidManifest('<uses-sdk android:minSdkVersion="23.5" android:targetSdkVersion="S" />')
    expect(fractional.minSdkVersion).toBeNull()
    expect(fractional.targetSdkVersion).toBeNull()
    expect(parseAndroidManifest('<uses-sdk targetSdkVersion="abc" />').targetSdkVersion).toBeNull()
  })

  it('returns null for an unquoted SDK value', () => {
    const manifest = parseAndroidManifest('<uses-sdk android:minSdkVersion=24 android:targetSdkVersion=34 />')
    expect(manifest.minSdkVersion).toBeNull()
    expect(manifest.targetSdkVersion).toBeNull()
  })

  it('returns null for an SDK value behind a namespace alias', () => {
    const manifest = parseAndroidManifest(`<manifest xmlns:tools="http://schemas.android.com/tools">
      <uses-sdk tools:minSdkVersion="35" tools:targetSdkVersion="35" />
    </manifest>`)
    expect(manifest.minSdkVersion).toBeNull()
    expect(manifest.targetSdkVersion).toBeNull()
  })

  it('keeps a zero SDK level as a declared value', () => {
    const manifest = parseAndroidManifest('<uses-sdk android:minSdkVersion="0" android:targetSdkVersion="34" />')
    expect(manifest.minSdkVersion).toBe(0)
    expect(manifest.targetSdkVersion).toBe(34)
  })

  it('de-duplicates repeated permission names in document order', () => {
    const manifest = parseAndroidManifest(`<manifest package="com.example.dupes">
      <uses-permission android:name="android.permission.CAMERA" />
      <uses-permission android:name="android.permission.INTERNET" />
      <uses-permission android:name="android.permission.CAMERA" />
    </manifest>`)
    expect(manifest.permissions).toHaveLength(2)
    expect(manifest.permissions).toEqual(['android.permission.CAMERA', 'android.permission.INTERNET'])
  })

  it('reads paired uses-permission elements', () => {
    const manifest = parseAndroidManifest(`<manifest>
      <uses-permission android:name="android.permission.RECORD_AUDIO"></uses-permission>
    </manifest>`)
    expect(manifest.permissions).toEqual(['android.permission.RECORD_AUDIO'])
  })

  it('ignores uses-permission-sdk-23 elements', () => {
    const manifest = parseAndroidManifest(`<manifest>
      <uses-permission-sdk-23 android:name="android.permission.CAMERA" />
    </manifest>`)
    expect(manifest.permissions).toEqual([])
  })

  it('ignores a namespace alias on the name attribute', () => {
    const manifest = parseAndroidManifest(`<manifest>
      <uses-permission ns:name="android.permission.CAMERA" />
    </manifest>`)
    expect(manifest.permissions).toEqual([])
  })

  it('ignores android:name on elements other than uses-permission', () => {
    const manifest = parseAndroidManifest(`<manifest>
      <application android:name=".ReviewApplication" />
      <service android:name=".SyncService" />
    </manifest>`)
    expect(manifest.permissions).toEqual([])
  })

  it('returns an empty permission list when no permission is declared', () => {
    const manifest = parseAndroidManifest('<manifest package="com.example.clean"><uses-permission /></manifest>')
    expect(manifest.permissions).toEqual([])
  })

  it('returns a null package when the text has no manifest element', () => {
    const manifest = parseAndroidManifest('<!-- not a manifest -->')
    expect(manifest.packageName).toBeNull()
    expect(manifest.permissions).toEqual([])
  })

  it('reads package from the root element only', () => {
    const manifest = parseAndroidManifest(`<manifest package="com.example.root">
      <service package="com.example.nested" />
    </manifest>`)
    expect(manifest.packageName).toBe('com.example.root')
  })
})

describe('dangerousPermissions', () => {
  it('returns dangerous permissions in document order', () => {
    expect(dangerousPermissions(parseAndroidManifest(REALISTIC_MANIFEST))).toEqual([
      'android.permission.CAMERA',
      'android.permission.ACCESS_FINE_LOCATION',
    ])
  })

  it('returns an empty array when no permission is dangerous', () => {
    expect(dangerousPermissions(parseAndroidManifest(INTERNET_ONLY_MANIFEST))).toEqual([])
  })

  it('matches only fully qualified names', () => {
    const manifest: AndroidManifest = {
      packageName: 'com.example.exact',
      minSdkVersion: 24,
      targetSdkVersion: 34,
      permissions: ['CAMERA', 'android.permission.camera'],
    }
    expect(dangerousPermissions(manifest)).toEqual([])
  })
})

describe('auditAndroidSdkLevels', () => {
  it('reports nothing for levels that satisfy the policy', () => {
    expect(auditAndroidSdkLevels(auditManifest(24, 34), POLICY)).toEqual([])
  })

  it('accepts a target level exactly at the policy minimum', () => {
    expect(auditAndroidSdkLevels(auditManifest(24, 33), POLICY)).toEqual([])
  })

  it('reports a missing target level', () => {
    expect(auditAndroidSdkLevels(auditManifest(24, null), POLICY)).toEqual(['targetSdkVersion is missing'])
  })

  it('reports a target level below the policy minimum', () => {
    expect(auditAndroidSdkLevels(auditManifest(24, 30), POLICY)).toEqual(['targetSdkVersion 30 is below the required 33'])
  })

  it('reports a missing minimum level', () => {
    expect(auditAndroidSdkLevels(auditManifest(null, 34), POLICY)).toEqual(['minSdkVersion is missing'])
  })

  it('reports a minimum level above the target level', () => {
    expect(auditAndroidSdkLevels(auditManifest(34, 33), POLICY)).toEqual(['minSdkVersion 34 is above targetSdkVersion 33'])
  })

  it('orders a low target before an inverted minimum and target', () => {
    expect(auditAndroidSdkLevels(auditManifest(34, 30), POLICY)).toEqual([
      'targetSdkVersion 30 is below the required 33',
      'minSdkVersion 34 is above targetSdkVersion 30',
    ])
  })

  it('orders both missing levels', () => {
    expect(auditAndroidSdkLevels(auditManifest(null, null), POLICY)).toEqual([
      'targetSdkVersion is missing',
      'minSdkVersion is missing',
    ])
  })

  it('omits the comparison when the target level is missing', () => {
    expect(auditAndroidSdkLevels(auditManifest(40, null), POLICY)).toEqual(['targetSdkVersion is missing'])
  })

  it('accepts a minimum level equal to the target level', () => {
    expect(auditAndroidSdkLevels(auditManifest(33, 33), POLICY)).toEqual([])
  })
})

describe('DANGEROUS_PERMISSIONS', () => {
  it('lists a non-empty array sorted lexicographically', () => {
    expect(DANGEROUS_PERMISSIONS.length).toBeGreaterThan(0)
    expect(DANGEROUS_PERMISSIONS).toEqual([...DANGEROUS_PERMISSIONS].sort())
  })

  it('contains fully qualified permission names', () => {
    expect(DANGEROUS_PERMISSIONS).toContain('android.permission.CAMERA')
    for (const permission of DANGEROUS_PERMISSIONS) {
      expect(permission).toMatch(/^android\.permission\.[A-Z0-9_]+$/)
    }
  })
})

describe('formatAndroidManifestSummary', () => {
  it('formats a full manifest with permission and dangerous counts', () => {
    expect(formatAndroidManifestSummary(parseAndroidManifest(REALISTIC_MANIFEST)))
      .toBe('package=com.example.review minSdk=24 targetSdk=34 permissions=3 dangerous=2')
  })

  it('uses unknown for absent values', () => {
    const empty: AndroidManifest = { packageName: null, minSdkVersion: null, targetSdkVersion: null, permissions: [] }
    expect(formatAndroidManifestSummary(empty))
      .toBe('package=unknown minSdk=unknown targetSdk=unknown permissions=0 dangerous=0')
  })

  it('counts dangerous permissions separately from the total', () => {
    expect(formatAndroidManifestSummary(parseAndroidManifest(INTERNET_ONLY_MANIFEST)))
      .toBe('package=com.example.internet minSdk=24 targetSdk=34 permissions=1 dangerous=0')
  })
})
