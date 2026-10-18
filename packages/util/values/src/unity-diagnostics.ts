/**
 * Unity project diagnostics.
 *
 * Analyzes Unity project files (ProjectVersion.txt, .csproj, .sln, .unity,
 * .prefab, .asset, Packages/manifest.json) and reports structural issues
 * without invoking the Unity Editor. Performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/unity-diagnostics
 */

import { parseUnityCsproj } from './unity-csharp-project.ts';

/** One Unity project diagnostic finding. */
export interface UnityDiagnostic {
  /** Severity. */
  readonly severity: 'info' | 'warning' | 'error';
  /** Category of the finding. */
  readonly category: string;
  /** Human-readable message. */
  readonly message: string;
  /** Related file path, if any. */
  readonly file: string | null;
  /** Suggested resolution, if any. */
  readonly suggestion: string | null;
}

/** Result of diagnosing a Unity project from observed files. */
export interface UnityDiagnosticResult {
  /** All findings. */
  readonly findings: readonly UnityDiagnostic[];
  /** Whether any errors were found. */
  readonly hasErrors: boolean;
  /** Whether any warnings were found. */
  readonly hasWarnings: boolean;
}

/** An observed file with its path and, when read, its content. */
export interface ObservedUnityFile {
  /** File path. */
  readonly path: string;
  /** File content, or null when unreadable. */
  readonly content: string | null;
}

/**
 * Diagnose a Unity project from observed files.
 *
 * @param files - observed Unity project files with their paths and contents.
 * @returns the collected findings and whether any are errors or warnings.
 */
export function diagnoseUnityProject(files: readonly ObservedUnityFile[]): UnityDiagnosticResult {
  const findings: UnityDiagnostic[] = [];

  const projectVersionFile = files.find((f) =>
    f.path.toLowerCase().includes('projectsettings/projectversion.txt'),
  );
  const manifestFile = files.find((f) => f.path.toLowerCase().includes('packages/manifest.json'));
  const csprojFiles = files.filter((f) => f.path.toLowerCase().endsWith('.csproj'));
  const slnFiles = files.filter((f) => f.path.toLowerCase().endsWith('.sln'));

  if (projectVersionFile === undefined) {
    findings.push({
      severity: 'error',
      category: 'project',
      message: 'ProjectSettings/ProjectVersion.txt not found; Unity project may be incomplete.',
      file: null,
      suggestion: 'Ensure the Unity project root contains ProjectSettings/ProjectVersion.txt.',
    });
  } else if (projectVersionFile.content === null) {
    findings.push({
      severity: 'error',
      category: 'project',
      message: 'ProjectSettings/ProjectVersion.txt could not be read.',
      file: projectVersionFile.path,
      suggestion: 'Check file permissions and encoding.',
    });
  } else {
    const versionMatch = /(\d+\.\d+\.\d+)/.exec(projectVersionFile.content);
    if (versionMatch === null) {
      findings.push({
        severity: 'warning',
        category: 'project',
        message: 'ProjectVersion.txt does not contain a recognizable version number.',
        file: projectVersionFile.path,
        suggestion: 'Verify the Unity version matches the installed editor.',
      });
    }
  }

  if (manifestFile === undefined) {
    findings.push({
      severity: 'warning',
      category: 'dependencies',
      message: 'Packages/manifest.json not found; package dependencies cannot be verified.',
      file: null,
      suggestion: 'Ensure the Unity project contains a Packages/manifest.json file.',
    });
  } else if (manifestFile.content === null) {
    findings.push({
      severity: 'error',
      category: 'dependencies',
      message: 'Packages/manifest.json could not be read.',
      file: manifestFile.path,
      suggestion: 'Check file permissions and encoding.',
    });
  }

  for (const csproj of csprojFiles) {
    if (csproj.content === null) {
      findings.push({
        severity: 'error',
        category: 'build',
        message: `C# project file ${csproj.path} could not be read.`,
        file: csproj.path,
        suggestion: 'Check file permissions and encoding.',
      });
      continue;
    }
    try {
      parseUnityCsproj(csproj.content);
    } catch (error) {
      findings.push({
        severity: 'error',
        category: 'build',
        message: `C# project file ${csproj.path} failed to parse: ${String(error)}`,
        file: csproj.path,
        suggestion: 'Verify the .csproj file is well-formed XML.',
      });
    }
  }

  for (const sln of slnFiles) {
    if (sln.content === null) {
      findings.push({
        severity: 'error',
        category: 'build',
        message: `Solution file ${sln.path} could not be read.`,
        file: sln.path,
        suggestion: 'Check file permissions and encoding.',
      });
    }
  }

  const sceneFiles = files.filter((f) => f.path.toLowerCase().endsWith('.unity'));
  if (sceneFiles.length === 0) {
    findings.push({
      severity: 'info',
      category: 'scenes',
      message: 'No Unity scene (.unity) files found.',
      file: null,
      suggestion: 'Add at least one scene to the project.',
    });
  }

  return {
    findings,
    hasErrors: findings.some((f) => f.severity === 'error'),
    hasWarnings: findings.some((f) => f.severity === 'warning'),
  };
}
