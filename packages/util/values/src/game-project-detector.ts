/**
 * Game project detection and capability reporting.
 *
 * Detects game engines and platforms from observed workspace files without
 * performing filesystem access or invoking engine tooling. Detection is based
 * purely on file markers and manifest contents that the caller has already
 * observed. Performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/game-project-detector
 */

/** Game engine families that can be detected. */
export type GameEngine = 'unity' | 'godot' | 'flutter' | 'android' | 'unknown';

/** Engine detection result with confidence and required prerequisites. */
export interface EngineDetection {
  /** Detected engine, or 'unknown' when none is confidently identified. */
  readonly engine: GameEngine;
  /** Detected major version, or null when not determinable. */
  readonly version: string | null;
  /** Evidence files that led to the detection, in sorted order. */
  readonly evidence: readonly string[];
  /** Confidence level of the detection. */
  readonly confidence: 'low' | 'medium' | 'high';
  /** Build tools detected for the engine. */
  readonly buildTools: readonly string[];
  /** Test tools detected for the engine. */
  readonly testTools: readonly string[];
  /** Editor automation available for the engine. */
  readonly editorAutomation: readonly string[];
  /** Missing dependencies that prevent full verification. */
  readonly missingDeps: readonly string[];
}

/** Complete project capability report. */
export interface GameProjectCapability {
  /** Detected engine. */
  readonly engine: GameEngine;
  /** Detected project root, or null when unknown. */
  readonly projectRoot: string | null;
  /** Engine-specific detection result. */
  readonly detection: EngineDetection;
  /** Verification operations supported for this project. */
  readonly supportedVerification: readonly string[];
  /** Known restrictions for this project. */
  readonly restrictions: readonly string[];
}

/**
 * Detect the game engine and version from observed file markers.
 *
 * @param files - observed workspace file paths.
 * @returns the detected engine with version, evidence, confidence, tooling, and missing dependencies.
 */
export function detectGameEngine(files: readonly string[]): EngineDetection {
  const unityMarkers = files.filter((f) => isUnityProjectFile(f));
  const godotMarkers = files.filter((f) => isGodotProjectFile(f));
  const flutterMarkers = files.filter((f) => isFlutterProjectFile(f));
  const androidMarkers = files.filter((f) => isAndroidProjectFile(f));

  const counts = {
    unity: unityMarkers.length,
    godot: godotMarkers.length,
    flutter: flutterMarkers.length,
    android: androidMarkers.length,
  };

  const best = Object.entries(counts).reduce(
    (best, [engine, count]) =>
      count > best.count ? { engine: engine as GameEngine, count } : best,
    { engine: 'unknown' as GameEngine, count: 0 },
  );

  if (best.count === 0) {
    return {
      engine: 'unknown',
      version: null,
      evidence: [],
      confidence: 'low',
      buildTools: [],
      testTools: [],
      editorAutomation: [],
      missingDeps: [],
    };
  }

  const engine = best.engine;
  const evidence = evidenceFor(engine, files).sort();

  switch (engine) {
    case 'unity':
      return detectUnity(unityMarkers, evidence);
    case 'godot':
      return detectGodot(godotMarkers, evidence);
    case 'flutter':
      return detectFlutter(flutterMarkers, evidence);
    case 'android':
      return detectAndroid(androidMarkers, evidence);
    default:
      return {
        engine: 'unknown',
        version: null,
        evidence: [],
        confidence: 'low',
        buildTools: [],
        testTools: [],
        editorAutomation: [],
        missingDeps: [],
      };
  }
}

/**
 * Build a complete project capability report from observed files.
 *
 * @param files - observed workspace file paths.
 * @param projectRoot - detected project root, or null when unknown.
 * @returns the capability report covering detection, supported verification, and restrictions.
 */
export function buildGameProjectCapability(
  files: readonly string[],
  projectRoot: string | null = null,
): GameProjectCapability {
  const detection = detectGameEngine(files);
  const supported = supportedVerificationFor(detection.engine);
  const restrictions = restrictionsFor(detection.engine, files);
  return {
    engine: detection.engine,
    projectRoot,
    detection,
    supportedVerification: supported,
    restrictions: restrictions,
  };
}

/** Is a file a Unity project marker? */
function isUnityProjectFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.includes('projectsettings/projectversion.txt') ||
    lower.endsWith('.unity') ||
    lower.endsWith('.prefab') ||
    lower.endsWith('.asset') ||
    lower.includes('packages/manifest.json') ||
    lower.includes('projectsettings/') ||
    lower.endsWith('.csproj') ||
    lower.endsWith('.sln')
  );
}

/** Is a file a Godot project marker? */
function isGodotProjectFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('project.godot') ||
    lower.endsWith('.tscn') ||
    lower.endsWith('.tres') ||
    lower.endsWith('.gd') ||
    lower.endsWith('.cs') && lower.includes('godot')
  );
}

/** Is a file a Flutter project marker? */
function isFlutterProjectFile(path: string): boolean {
  const lower = path.toLowerCase();
  return lower.endsWith('pubspec.yaml') || lower.endsWith('.dart');
}

/** Is a file an Android project marker? */
function isAndroidProjectFile(path: string): boolean {
  const lower = path.toLowerCase();
  return (
    lower.endsWith('androidmanifest.xml') ||
    lower.endsWith('build.gradle') ||
    lower.endsWith('settings.gradle') ||
    lower.endsWith('.kt') && lower.includes('android') ||
    lower.endsWith('.java') && lower.includes('android')
  );
}

/** Evidence files for an engine, drawn from the observed set. */
function evidenceFor(engine: GameEngine, files: readonly string[]): string[] {
  switch (engine) {
    case 'unity':
      return files.filter((f) => isUnityProjectFile(f));
    case 'godot':
      return files.filter((f) => isGodotProjectFile(f));
    case 'flutter':
      return files.filter((f) => isFlutterProjectFile(f));
    case 'android':
      return files.filter((f) => isAndroidProjectFile(f));
    default:
      return [];
  }
}

/** Detect Unity version and tooling from manifest/project files. */
function detectUnity(
  unityFiles: readonly string[],
  evidence: readonly string[],
): EngineDetection {
  const version = extractUnityVersion(unityFiles);
  const buildTools = unityBuildTools(unityFiles);
  const testTools = unityTestTools(unityFiles);
  const editorAutomation = unityEditorAutomation(unityFiles);
  const missingDeps = unityMissingDeps(unityFiles);
  const confidence = unityFiles.length > 0 ? 'high' : 'medium';
  return {
    engine: 'unity',
    version,
    evidence,
    confidence,
    buildTools,
    testTools,
    editorAutomation,
    missingDeps,
  };
}

/** Detect Godot version and tooling. */
function detectGodot(
  godotFiles: readonly string[],
  evidence: readonly string[],
): EngineDetection {
  const version = extractGodotVersion(godotFiles);
  const buildTools = godotBuildTools(godotFiles);
  const testTools = godotTestTools(godotFiles);
  const editorAutomation = godotEditorAutomation(godotFiles);
  const missingDeps = godotMissingDeps(godotFiles);
  const confidence = godotFiles.length > 0 ? 'high' : 'medium';
  return {
    engine: 'godot',
    version,
    evidence,
    confidence,
    buildTools,
    testTools,
    editorAutomation,
    missingDeps,
  };
}

/** Detect Flutter version and tooling. */
function detectFlutter(
  flutterFiles: readonly string[],
  evidence: readonly string[],
): EngineDetection {
  const version = extractFlutterVersion(flutterFiles);
  const buildTools = flutterBuildTools(flutterFiles);
  const testTools = flutterTestTools(flutterFiles);
  const editorAutomation = flutterEditorAutomation(flutterFiles);
  const missingDeps = flutterMissingDeps(flutterFiles);
  const confidence = flutterFiles.length > 0 ? 'high' : 'medium';
  return {
    engine: 'flutter',
    version,
    evidence,
    confidence,
    buildTools,
    testTools,
    editorAutomation,
    missingDeps,
  };
}

/** Detect Android version and tooling. */
function detectAndroid(
  androidFiles: readonly string[],
  evidence: readonly string[],
): EngineDetection {
  const version = extractAndroidVersion(androidFiles);
  const buildTools = androidBuildTools(androidFiles);
  const testTools = androidTestTools(androidFiles);
  const editorAutomation = androidEditorAutomation(androidFiles);
  const missingDeps = androidMissingDeps(androidFiles);
  const confidence = androidFiles.length > 0 ? 'high' : 'medium';
  return {
    engine: 'android',
    version,
    evidence,
    confidence,
    buildTools,
    testTools,
    editorAutomation,
    missingDeps,
  };
}

/** Extract Unity version from ProjectVersion.txt content observed in file names. */
function extractUnityVersion(files: readonly string[]): string | null {
  const versionFile = files.find((f) => f.toLowerCase().includes('projectversion.txt'));
  if (versionFile === undefined) return null;
  const match = /(\d+\.\d+\.\d+)/.exec(versionFile);
  return match ? match[1] ?? null : null;
}

/** Extract Godot version from project.godot content. */
function extractGodotVersion(files: readonly string[]): string | null {
  const godotFile = files.find((f) => f.toLowerCase().endsWith('project.godot'));
  if (godotFile === undefined) return null;
  const match = /config_version\s*=\s*(\d+)/.exec(godotFile);
  return match ? match[1] ?? null : null;
}

/** Extract Flutter version from pubspec content. */
function extractFlutterVersion(files: readonly string[]): string | null {
  const pubspec = files.find((f) => f.toLowerCase().endsWith('pubspec.yaml'));
  if (pubspec === undefined) return null;
  const match = /flutter:\s*\n\s*sdk:\s*flutter/.exec(pubspec);
  return match ? 'flutter' : null;
}

/** Extract Android version from manifest/build files. */
function extractAndroidVersion(files: readonly string[]): string | null {
  const manifest = files.find((f) => f.toLowerCase().endsWith('androidmanifest.xml'));
  if (manifest === undefined) return null;
  const match = /targetsdkversion\s*=\s*(\d+)/i.exec(manifest);
  return match ? match[1] ?? null : null;
}

/** Unity build tools observed from file names. */
function unityBuildTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('unity.exe') || lower.includes('unityhub')) tools.push('unity-editor');
    if (lower.includes('unitybatchmode')) tools.push('unity-batchmode');
    if (lower.endsWith('.csproj') || lower.endsWith('.sln')) tools.push('visual-studio');
  }
  return [...new Set(tools)].sort();
}

/** Unity test tools observed from file names. */
function unityTestTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('editmode') || lower.includes('edit_mode')) tools.push('editmode-tests');
    if (lower.includes('playmode') || lower.includes('play_mode')) tools.push('playmode-tests');
    if (lower.includes('nunit') || lower.endsWith('.cs') && lower.includes('test'))
      tools.push('nunit');
  }
  return [...new Set(tools)].sort();
}

/** Unity editor automation observed from file names. */
function unityEditorAutomation(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('editor/')) tools.push('editor-scripts');
    if (lower.includes('editorwindow')) tools.push('editor-windows');
    if (lower.includes('customeditor')) tools.push('custom-inspectors');
  }
  return [...new Set(tools)].sort();
}

/** Unity missing dependencies. */
function unityMissingDeps(files: readonly string[]): readonly string[] {
  const deps: string[] = [];
  const hasManifest = files.some((f) => f.toLowerCase().includes('packages/manifest.json'));
  if (!hasManifest) deps.push('packages/manifest.json');
  const hasProjectVersion = files.some((f) =>
    f.toLowerCase().includes('projectsettings/projectversion.txt')
  );
  if (!hasProjectVersion) deps.push('ProjectSettings/ProjectVersion.txt');
  return deps.sort();
}

/** Godot build tools observed from file names. */
function godotBuildTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('godot.exe') || lower.includes('godot_')) tools.push('godot-editor');
    if (lower.includes('export_presets.cfg')) tools.push('export-presets');
  }
  return [...new Set(tools)].sort();
}

/** Godot test tools observed from file names. */
function godotTestTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('gdunit')) tools.push('gdunit');
    if (lower.includes('guth')) tools.push('guth');
  }
  return [...new Set(tools)].sort();
}

/** Godot editor automation observed from file names. */
function godotEditorAutomation(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('editor_plugin')) tools.push('editor-plugins');
    if (lower.includes('_editor')) tools.push('editor-scripts');
  }
  return [...new Set(tools)].sort();
}

/** Godot missing dependencies. */
function godotMissingDeps(files: readonly string[]): readonly string[] {
  const deps: string[] = [];
  const hasProjectGodot = files.some((f) => f.toLowerCase().endsWith('project.godot'));
  if (!hasProjectGodot) deps.push('project.godot');
  return deps.sort();
}

/** Flutter build tools observed from file names. */
function flutterBuildTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('flutter')) tools.push('flutter-sdk');
    if (lower.includes('dart')) tools.push('dart-sdk');
  }
  return [...new Set(tools)].sort();
}

/** Flutter test tools observed from file names. */
function flutterTestTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('flutter_test')) tools.push('flutter-test');
    if (lower.endsWith('_test.dart')) tools.push('dart-test');
  }
  return [...new Set(tools)].sort();
}

/** Flutter editor automation observed from file names. */
function flutterEditorAutomation(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('.vscode/')) tools.push('vscode');
    if (lower.includes('.idea/')) tools.push('android-studio');
  }
  return [...new Set(tools)].sort();
}

/** Flutter missing dependencies. */
function flutterMissingDeps(files: readonly string[]): readonly string[] {
  const deps: string[] = [];
  const hasPubspec = files.some((f) => f.toLowerCase().endsWith('pubspec.yaml'));
  if (!hasPubspec) deps.push('pubspec.yaml');
  return deps.sort();
}

/** Android build tools observed from file names. */
function androidBuildTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.endsWith('build.gradle')) tools.push('gradle');
    if (lower.endsWith('settings.gradle')) tools.push('gradle-settings');
    if (lower.includes('androidsdk')) tools.push('android-sdk');
  }
  return [...new Set(tools)].sort();
}

/** Android test tools observed from file names. */
function androidTestTools(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('androidtest')) tools.push('android-test');
    if (lower.includes('espresso')) tools.push('espresso');
    if (lower.includes('robolectric')) tools.push('robolectric');
  }
  return [...new Set(tools)].sort();
}

/** Android editor automation observed from file names. */
function androidEditorAutomation(files: readonly string[]): readonly string[] {
  const tools: string[] = [];
  for (const f of files) {
    const lower = f.toLowerCase();
    if (lower.includes('.idea/')) tools.push('android-studio');
    if (lower.includes('fastlane')) tools.push('fastlane');
  }
  return [...new Set(tools)].sort();
}

/** Android missing dependencies. */
function androidMissingDeps(files: readonly string[]): readonly string[] {
  const deps: string[] = [];
  const hasManifest = files.some((f) => f.toLowerCase().endsWith('androidmanifest.xml'));
  if (!hasManifest) deps.push('AndroidManifest.xml');
  const hasBuild = files.some((f) => f.toLowerCase().endsWith('build.gradle'));
  if (!hasBuild) deps.push('build.gradle');
  return deps.sort();
}

/** Supported verification operations for an engine. */
function supportedVerificationFor(engine: GameEngine): readonly string[] {
  switch (engine) {
    case 'unity':
      return [
        'project-file parsing',
        'manifest dependency review',
        'csproj/sln parsing',
        'meta file audit',
        'C# script compilation review',
      ];
    case 'godot':
      return [
        'project.godot parsing',
        'scene (.tscn) parsing',
        'resource (.tres) parsing',
        'GDScript (.gd) review',
        'export preset review',
      ];
    case 'flutter':
      return [
        'pubspec.yaml parsing',
        'dependency review',
        'Dart file review',
        'flutter_test review',
      ];
    case 'android':
      return [
        'AndroidManifest.xml review',
        'build.gradle review',
        'SDK level audit',
        'permission review',
      ];
    default:
      return ['generic file listing'];
  }
}

/** Known restrictions for an engine and file set. */
function restrictionsFor(
  engine: GameEngine,
  files: readonly string[],
): readonly string[] {
  const restrictions: string[] = [];
  restrictions.push('Project-file detection only; no engine tooling is invoked.');
  if (engine === 'unknown') {
    restrictions.push('No game engine detected from observed files.');
  }
  if (!files.some((f) => f.toLowerCase().includes('.unity')) && engine === 'unity') {
    restrictions.push('No Unity scene (.unity) files observed; scene-level checks unavailable.');
  }
  if (!files.some((f) => f.toLowerCase().endsWith('.tscn')) && engine === 'godot') {
    restrictions.push('No Godot scene (.tscn) files observed; scene-level checks unavailable.');
  }
  return restrictions.sort();
}
