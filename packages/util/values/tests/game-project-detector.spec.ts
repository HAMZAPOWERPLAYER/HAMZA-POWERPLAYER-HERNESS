import { describe, expect, it } from 'vitest'
import { buildGameProjectCapability, detectGameEngine } from '../src/index.ts'

describe('detectGameEngine', () => {
  it('returns unknown for an empty file list', () => {
    const d = detectGameEngine([])
    expect(d.engine).toBe('unknown')
    expect(d.version).toBeNull()
    expect(d.evidence).toEqual([])
    expect(d.confidence).toBe('low')
    expect(d.buildTools).toEqual([])
    expect(d.testTools).toEqual([])
    expect(d.editorAutomation).toEqual([])
    expect(d.missingDeps).toEqual([])
  })

  it('returns unknown when no marker matches', () => {
    const d = detectGameEngine(['readme.md', 'src/main.rs'])
    expect(d.engine).toBe('unknown')
    expect(d.evidence).toEqual([])
  })

  it('detects Unity from ProjectVersion.txt with high confidence', () => {
    const d = detectGameEngine(['ProjectSettings/ProjectVersion.txt'])
    expect(d.engine).toBe('unity')
    expect(d.confidence).toBe('high')
    expect(d.evidence).toEqual(['ProjectSettings/ProjectVersion.txt'])
    expect(d.version).toBeNull()
  })

  it('detects Unity markers case-insensitively', () => {
    const d = detectGameEngine(['PROJECTSETTINGS/PROJECTVERSION.TXT'])
    expect(d.engine).toBe('unity')
  })

  it('extracts a Unity version embedded in an observed file name', () => {
    const d = detectGameEngine(['tools/unity 2022.3.10/projectsettings/projectversion.txt'])
    expect(d.engine).toBe('unity')
    expect(d.version).toBe('2022.3.10')
  })

  it('sorts Unity evidence files', () => {
    const d = detectGameEngine(['Game.csproj', 'Assets/Main.unity'])
    expect(d.engine).toBe('unity')
    expect(d.evidence).toEqual(['Assets/Main.unity', 'Game.csproj'])
  })

  it('lists Unity build, test, and editor tooling observed in marker file names', () => {
    const d = detectGameEngine([
      'Packages/manifest.json',
      'ProjectSettings/ProjectVersion.txt',
      'UnityHub.asset',
      'UnityBatchMode.asset',
      'Game.csproj',
      'Game.sln',
      'Assets/EditModeNunit.unity',
      'Assets/PlayMode.unity',
      'Assets/Editor/CustomEditor.prefab',
      'EditorWindow.prefab',
    ])
    expect(d.engine).toBe('unity')
    expect(d.buildTools).toEqual(['unity-batchmode', 'unity-editor', 'visual-studio'])
    expect(d.testTools).toEqual(['editmode-tests', 'nunit', 'playmode-tests'])
    expect(d.editorAutomation).toEqual(['custom-inspectors', 'editor-scripts', 'editor-windows'])
    expect(d.missingDeps).toEqual([])
  })

  it('reports Unity missing dependencies when manifest and version file are absent', () => {
    const d = detectGameEngine(['Assets/Main.unity'])
    expect(d.engine).toBe('unity')
    expect(d.missingDeps).toEqual([
      'ProjectSettings/ProjectVersion.txt',
      'packages/manifest.json',
    ])
  })

  it('detects Godot from project.godot without missing dependencies', () => {
    const d = detectGameEngine(['project.godot'])
    expect(d.engine).toBe('godot')
    expect(d.version).toBeNull()
    expect(d.evidence).toEqual(['project.godot'])
    expect(d.missingDeps).toEqual([])
  })

  it('extracts the Godot config version embedded in an observed file name', () => {
    const d = detectGameEngine(['config_version=4-project.godot'])
    expect(d.engine).toBe('godot')
    expect(d.version).toBe('4')
  })

  it('treats .cs files under a godot path as Godot markers', () => {
    const d = detectGameEngine(['addons/godot-plugin/Behavior.cs'])
    expect(d.engine).toBe('godot')
  })

  it('lists Godot build, test, and editor tooling observed in marker file names', () => {
    const d = detectGameEngine([
      'project.godot',
      'godot_4.2.tscn',
      'export_presets.cfg.gd',
      'addons/gdunit4.tscn',
      'addons/guth_hd.tscn',
      'editor_plugin.gd',
      'level_editor.gd',
    ])
    expect(d.engine).toBe('godot')
    expect(d.buildTools).toEqual(['export-presets', 'godot-editor'])
    expect(d.testTools).toEqual(['gdunit', 'guth'])
    expect(d.editorAutomation).toEqual(['editor-plugins', 'editor-scripts'])
    expect(d.version).toBeNull()
    expect(d.missingDeps).toEqual([])
  })

  it('detects Flutter from pubspec.yaml without missing dependencies', () => {
    const d = detectGameEngine(['pubspec.yaml'])
    expect(d.engine).toBe('flutter')
    expect(d.version).toBeNull()
    expect(d.missingDeps).toEqual([])
  })

  it('lists Flutter build, test, and editor tooling observed in marker file names', () => {
    const d = detectGameEngine([
      'pubspec.yaml',
      'lib/main.dart',
      'test/flutter_test.dart',
      'test/widget_test.dart',
      '.vscode/tasks.dart',
      '.idea/misc.dart',
    ])
    expect(d.engine).toBe('flutter')
    expect(d.buildTools).toEqual(['dart-sdk', 'flutter-sdk'])
    expect(d.testTools).toEqual(['dart-test', 'flutter-test'])
    expect(d.editorAutomation).toEqual(['android-studio', 'vscode'])
    expect(d.version).toBeNull()
    expect(d.missingDeps).toEqual([])
  })

  it('detects Android from AndroidManifest.xml and reports the missing build file', () => {
    const d = detectGameEngine(['AndroidManifest.xml'])
    expect(d.engine).toBe('android')
    expect(d.version).toBeNull()
    expect(d.evidence).toEqual(['AndroidManifest.xml'])
    expect(d.missingDeps).toEqual(['build.gradle'])
  })

  it('extracts an Android target SDK embedded in an observed file name', () => {
    const d = detectGameEngine(['targetsdkversion=33.androidmanifest.xml'])
    expect(d.engine).toBe('android')
    expect(d.version).toBe('33')
  })

  it('lists Android build, test, and editor tooling observed in marker file names', () => {
    const d = detectGameEngine([
      'AndroidManifest.xml',
      'app/build.gradle',
      'settings.gradle',
      'androidsdk/build.gradle',
      'androidtest/Flow.kt',
      'android/EspressoTest.java',
      'android/RobolectricTest.java',
      'fastlane/androidmanifest.xml',
    ])
    expect(d.engine).toBe('android')
    expect(d.buildTools).toEqual(['android-sdk', 'gradle', 'gradle-settings'])
    expect(d.testTools).toEqual(['android-test', 'espresso', 'robolectric'])
    expect(d.editorAutomation).toEqual(['fastlane'])
    expect(d.version).toBeNull()
    expect(d.missingDeps).toEqual([])
  })

  it('breaks marker-count ties in engine declaration order', () => {
    const d = detectGameEngine(['a.gd', 'b.dart'])
    expect(d.engine).toBe('godot')
  })

  it('picks the engine with the most markers', () => {
    const d = detectGameEngine(['a.gd', 'b.gd', 'c.dart'])
    expect(d.engine).toBe('godot')
    expect(d.evidence).toEqual(['a.gd', 'b.gd'])
  })
})

describe('buildGameProjectCapability', () => {
  it('defaults projectRoot to null and reports generic verification for unknown projects', () => {
    const c = buildGameProjectCapability(['readme.md'])
    expect(c.engine).toBe('unknown')
    expect(c.projectRoot).toBeNull()
    expect(c.detection.engine).toBe('unknown')
    expect(c.supportedVerification).toEqual(['generic file listing'])
    expect(c.restrictions).toEqual([
      'No game engine detected from observed files.',
      'Project-file detection only; no engine tooling is invoked.',
    ])
  })

  it('preserves the given projectRoot and embeds the detection result', () => {
    const files = ['project.godot']
    const c = buildGameProjectCapability(files, '/workspace/game')
    expect(c.projectRoot).toBe('/workspace/game')
    expect(c.engine).toBe('godot')
    expect(c.detection).toEqual(detectGameEngine(files))
  })

  it('reports Unity verification and the missing-scene restriction', () => {
    const c = buildGameProjectCapability([
      'Packages/manifest.json',
      'ProjectSettings/ProjectVersion.txt',
    ])
    expect(c.engine).toBe('unity')
    expect(c.supportedVerification).toHaveLength(5)
    expect(c.supportedVerification).toContain('project-file parsing')
    expect(c.supportedVerification).toContain('csproj/sln parsing')
    expect(c.restrictions).toEqual([
      'No Unity scene (.unity) files observed; scene-level checks unavailable.',
      'Project-file detection only; no engine tooling is invoked.',
    ])
  })

  it('omits the Unity scene restriction when a .unity file is observed', () => {
    const c = buildGameProjectCapability([
      'Assets/Main.unity',
      'Packages/manifest.json',
      'ProjectSettings/ProjectVersion.txt',
    ])
    expect(c.restrictions).toEqual([
      'Project-file detection only; no engine tooling is invoked.',
    ])
  })

  it('omits the Godot scene restriction when a .tscn file is observed', () => {
    const c = buildGameProjectCapability(['project.godot', 'levels/level_1.tscn'])
    expect(c.engine).toBe('godot')
    expect(c.restrictions).toEqual([
      'Project-file detection only; no engine tooling is invoked.',
    ])
  })

  it('keeps the Godot scene restriction when no .tscn file is observed', () => {
    const c = buildGameProjectCapability(['project.godot'])
    expect(c.restrictions).toContain(
      'No Godot scene (.tscn) files observed; scene-level checks unavailable.',
    )
  })

  it('reports engine-specific verification sets', () => {
    expect(buildGameProjectCapability(['project.godot']).supportedVerification).toContain(
      'scene (.tscn) parsing',
    )
    expect(buildGameProjectCapability(['pubspec.yaml']).supportedVerification).toContain(
      'pubspec.yaml parsing',
    )
    expect(buildGameProjectCapability(['AndroidManifest.xml']).supportedVerification).toContain(
      'permission review',
    )
  })
})
