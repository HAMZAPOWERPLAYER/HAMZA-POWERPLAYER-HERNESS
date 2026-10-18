import { describe, expect, it } from 'vitest'
import {
  auditGradleAndroidConfig,
  formatGradleAndroidSummary,
  gradleConfigAgreesWithManifest,
  parseGradleAndroidConfig,
  type GradleAndroidConfig,
} from '../src/android-gradle-model.ts'

/**
 * Build a Gradle config fixture whose unspecified fields are `null`.
 * @param fields - fields to set on the fixture.
 * @returns a complete config with the given fields and `null` for the rest.
 */
function gradleConfig(fields: Partial<GradleAndroidConfig> = {}): GradleAndroidConfig {
  return {
    applicationId: null,
    namespace: null,
    minSdkVersion: null,
    targetSdkVersion: null,
    compileSdkVersion: null,
    ...fields,
  }
}

const POLICY = { minTargetSdkVersion: 33 }

const FLUTTER_BUILD_GRADLE = `def localProperties = new Properties()
def localPropertiesFile = rootProject.file('local.properties')
def flutterSdkPath = localProperties.getProperty('flutter.sdk')

apply plugin: 'com.android.application'
apply from: "$flutterSdkPath/packages/flutter_tools/gradle/flutter.gradle"

android {
    namespace "com.example.flutter_app"
    compileSdkVersion 34

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_1_8
        targetCompatibility JavaVersion.VERSION_1_8
    }

    defaultConfig {
        applicationId "com.example.flutter_app"
        minSdkVersion 21
        targetSdkVersion 34
        versionCode flutterVersionCode.toInteger()
        versionName "1.0.0"
    }
}

flutter {
    source '../..'
}`

describe('parseGradleAndroidConfig', () => {
  it('reads the Groovy minSdkVersion <value> spelling', () => {
    expect(parseGradleAndroidConfig('minSdkVersion 21').minSdkVersion).toBe(21)
  })

  it('reads the Groovy minSdk <value> spelling', () => {
    expect(parseGradleAndroidConfig('minSdk 21').minSdkVersion).toBe(21)
  })

  it('reads the Kotlin minSdk = <value> spelling', () => {
    expect(parseGradleAndroidConfig('minSdk = 21').minSdkVersion).toBe(21)
  })

  it('reads the Kotlin minSdkVersion = <value> spelling', () => {
    expect(parseGradleAndroidConfig('minSdkVersion = 21').minSdkVersion).toBe(21)
  })

  it('reads the Groovy targetSdkVersion <value> spelling', () => {
    expect(parseGradleAndroidConfig('targetSdkVersion 33').targetSdkVersion).toBe(33)
  })

  it('reads the Groovy targetSdk <value> spelling', () => {
    expect(parseGradleAndroidConfig('targetSdk 33').targetSdkVersion).toBe(33)
  })

  it('reads the Kotlin targetSdk = <value> spelling', () => {
    expect(parseGradleAndroidConfig('targetSdk = 33').targetSdkVersion).toBe(33)
  })

  it('reads the Kotlin targetSdkVersion = <value> spelling', () => {
    expect(parseGradleAndroidConfig('targetSdkVersion = 33').targetSdkVersion).toBe(33)
  })

  it('reads the Groovy compileSdkVersion <value> spelling', () => {
    expect(parseGradleAndroidConfig('compileSdkVersion 34').compileSdkVersion).toBe(34)
  })

  it('reads the Groovy compileSdk <value> spelling', () => {
    expect(parseGradleAndroidConfig('compileSdk 34').compileSdkVersion).toBe(34)
  })

  it('reads the Kotlin compileSdk = <value> spelling', () => {
    expect(parseGradleAndroidConfig('compileSdk = 34').compileSdkVersion).toBe(34)
  })

  it('reads the Kotlin compileSdkVersion = <value> spelling', () => {
    expect(parseGradleAndroidConfig('compileSdkVersion = 34').compileSdkVersion).toBe(34)
  })

  it('reads single-quoted level values', () => {
    const config = parseGradleAndroidConfig(`minSdkVersion '21'
targetSdkVersion '33'
compileSdkVersion '34'`)
    expect(config.minSdkVersion).toBe(21)
    expect(config.targetSdkVersion).toBe(33)
    expect(config.compileSdkVersion).toBe(34)
  })

  it('reads double-quoted level values', () => {
    const config = parseGradleAndroidConfig(`minSdkVersion "21"
targetSdk = "33"
compileSdk = "34"`)
    expect(config.minSdkVersion).toBe(21)
    expect(config.targetSdkVersion).toBe(33)
    expect(config.compileSdkVersion).toBe(34)
  })

  it('tolerates no whitespace or extra whitespace around the assignment', () => {
    const config = parseGradleAndroidConfig(`minSdkVersion=21
targetSdkVersion    =    33`)
    expect(config.minSdkVersion).toBe(21)
    expect(config.targetSdkVersion).toBe(33)
  })

  it('ignores lines commented out with // or #', () => {
    const commented = parseGradleAndroidConfig(`// minSdkVersion 21
# targetSdkVersion 33`)
    expect(commented.minSdkVersion).toBeNull()
    expect(commented.targetSdkVersion).toBeNull()
    expect(parseGradleAndroidConfig('    // compileSdkVersion 34').compileSdkVersion).toBeNull()
  })

  it('reads an uncommented line beside commented-out declarations', () => {
    const config = parseGradleAndroidConfig(`// minSdkVersion 19
# minSdkVersion 19
minSdkVersion 21`)
    expect(config.minSdkVersion).toBe(21)
  })

  it('takes the last match when a field appears more than once', () => {
    const config = parseGradleAndroidConfig(`minSdkVersion 19
minSdkVersion 21
applicationId "com.example.first"
applicationId "com.example.second"`)
    expect(config.minSdkVersion).toBe(21)
    expect(config.applicationId).toBe('com.example.second')
  })

  it('takes the last match on one line', () => {
    expect(parseGradleAndroidConfig('minSdkVersion 19; minSdkVersion 21').minSdkVersion).toBe(21)
  })

  it('returns null for every field when the text declares none', () => {
    expect(parseGradleAndroidConfig('')).toEqual(gradleConfig())
    expect(parseGradleAndroidConfig(`dependencies {
    implementation "androidx.core:core-ktx:1.13.1"
}`)).toEqual(gradleConfig())
  })

  it('reads a realistic Flutter android/app/build.gradle block', () => {
    const config = parseGradleAndroidConfig(FLUTTER_BUILD_GRADLE)
    expect(config.applicationId).toBe('com.example.flutter_app')
    expect(config.namespace).toBe('com.example.flutter_app')
    expect(config.minSdkVersion).toBe(21)
    expect(config.targetSdkVersion).toBe(34)
    expect(config.compileSdkVersion).toBe(34)
  })

  it('reads a double-quoted applicationId', () => {
    expect(parseGradleAndroidConfig('applicationId "com.example.app"').applicationId).toBe('com.example.app')
  })

  it('reads a single-quoted applicationId', () => {
    expect(parseGradleAndroidConfig("applicationId 'com.example.app'").applicationId).toBe('com.example.app')
  })

  it('reads a Kotlin applicationId assignment', () => {
    expect(parseGradleAndroidConfig('applicationId = "com.example.kotlin"').applicationId).toBe('com.example.kotlin')
  })

  it('reads a double-quoted namespace', () => {
    expect(parseGradleAndroidConfig('namespace "com.example.ns"').namespace).toBe('com.example.ns')
  })

  it('reads a single-quoted namespace assignment', () => {
    expect(parseGradleAndroidConfig("namespace = 'com.example.ns'").namespace).toBe('com.example.ns')
  })

  it('leaves applicationId null when the script only declares a namespace', () => {
    expect(parseGradleAndroidConfig('namespace "com.example.ns"').applicationId).toBeNull()
  })

  it('does not read applicationIdSuffix as applicationId', () => {
    const config = parseGradleAndroidConfig(`applicationIdSuffix ".debug"
namespace "com.example.app"`)
    expect(config.applicationId).toBeNull()
    expect(config.namespace).toBe('com.example.app')
  })

  it('returns null for level values that are not decimal integers', () => {
    const config = parseGradleAndroidConfig(`minSdkVersion flutter.minSdkVersion
targetSdkVersion 34.0
compileSdkVersion "thirty-four"`)
    expect(config.minSdkVersion).toBeNull()
    expect(config.targetSdkVersion).toBeNull()
    expect(config.compileSdkVersion).toBeNull()
  })
})

describe('auditGradleAndroidConfig', () => {
  it('reports a target level below the shared policy minimum', () => {
    expect(auditGradleAndroidConfig(gradleConfig({ minSdkVersion: 24, targetSdkVersion: 30 }), POLICY))
      .toEqual(['targetSdkVersion 30 is below the required 33'])
  })

  it('reports missing levels with the shared rule text', () => {
    expect(auditGradleAndroidConfig(gradleConfig(), POLICY))
      .toEqual(['targetSdkVersion is missing', 'minSdkVersion is missing'])
  })

  it('returns an empty array for a config that satisfies the policy', () => {
    expect(auditGradleAndroidConfig(gradleConfig({ minSdkVersion: 24, targetSdkVersion: 34 }), POLICY)).toEqual([])
  })
})

describe('formatGradleAndroidSummary', () => {
  it('renders every field of a complete config', () => {
    const config = gradleConfig({
      applicationId: 'com.example.app',
      namespace: 'com.example.app',
      minSdkVersion: 21,
      targetSdkVersion: 34,
      compileSdkVersion: 35,
    })
    expect(formatGradleAndroidSummary(config))
      .toBe('applicationId=com.example.app namespace=com.example.app minSdk=21 targetSdk=34 compileSdk=35')
  })

  it('renders unknown for absent fields', () => {
    expect(formatGradleAndroidSummary(gradleConfig()))
      .toBe('applicationId=unknown namespace=unknown minSdk=unknown targetSdk=unknown compileSdk=unknown')
  })
})

describe('gradleConfigAgreesWithManifest', () => {
  it('returns an empty array when the values agree', () => {
    const config = gradleConfig({ applicationId: 'com.example.app', minSdkVersion: 24, targetSdkVersion: 34 })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: 'com.example.app',
      minSdkVersion: 24,
      targetSdkVersion: 34,
    })).toEqual([])
  })

  it('reports a differing applicationId against the manifest package', () => {
    const config = gradleConfig({ applicationId: 'com.example.app' })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: 'com.example.other',
      minSdkVersion: null,
      targetSdkVersion: null,
    })).toEqual(['applicationId com.example.app differs from manifest package com.example.other'])
  })

  it('reports a differing minSdkVersion', () => {
    const config = gradleConfig({ minSdkVersion: 21 })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: null,
      minSdkVersion: 24,
      targetSdkVersion: null,
    })).toEqual(['minSdkVersion 21 differs from manifest 24'])
  })

  it('reports a differing targetSdkVersion', () => {
    const config = gradleConfig({ targetSdkVersion: 33 })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: null,
      minSdkVersion: null,
      targetSdkVersion: 35,
    })).toEqual(['targetSdkVersion 33 differs from manifest 35'])
  })

  it('reports every difference in a fixed order', () => {
    const config = gradleConfig({ applicationId: 'com.example.app', minSdkVersion: 21, targetSdkVersion: 33 })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: 'com.example.other',
      minSdkVersion: 24,
      targetSdkVersion: 35,
    })).toEqual([
      'applicationId com.example.app differs from manifest package com.example.other',
      'minSdkVersion 21 differs from manifest 24',
      'targetSdkVersion 33 differs from manifest 35',
    ])
  })

  it('skips a comparison when either side is null', () => {
    const config = gradleConfig({ applicationId: 'com.example.app', minSdkVersion: null, targetSdkVersion: 33 })
    expect(gradleConfigAgreesWithManifest(config, {
      packageName: 'com.example.app',
      minSdkVersion: 24,
      targetSdkVersion: null,
    })).toEqual([])
    expect(gradleConfigAgreesWithManifest(gradleConfig(), {
      packageName: null,
      minSdkVersion: null,
      targetSdkVersion: null,
    })).toEqual([])
  })
})
