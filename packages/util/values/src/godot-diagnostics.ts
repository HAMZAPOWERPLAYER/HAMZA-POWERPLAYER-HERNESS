/**
 * Godot project diagnostics.
 *
 * Analyzes Godot project files (project.godot, .tscn, .tres, .gd, .cs) and
 * reports structural issues without invoking the Godot Editor. Performs no I/O
 * and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/godot-diagnostics
 */

import { parseGodotProject } from './godot-project-model.ts';
import { parseGodotScene } from './godot-scene-model.ts';

/** One Godot diagnostic finding. */
export interface GodotDiagnostic {
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

/** Result of diagnosing a Godot project from observed files. */
export interface GodotDiagnosticResult {
  /** All findings. */
  readonly findings: readonly GodotDiagnostic[];
  /** Whether any errors were found. */
  readonly hasErrors: boolean;
  /** Whether any warnings were found. */
  readonly hasWarnings: boolean;
}

/** An observed file with its path and, when read, its content. */
export interface ObservedGodotFile {
  /** File path. */
  readonly path: string;
  /** File content, or null when unreadable. */
  readonly content: string | null;
}

/**
 * Diagnose a Godot project from observed files.
 *
 * @param files - observed files with their paths and, when read, their content.
 * @returns the collected findings plus whether any errors or warnings were found.
 */
export function diagnoseGodotProject(files: readonly ObservedGodotFile[]): GodotDiagnosticResult {
  const findings: GodotDiagnostic[] = [];

  const projectGodotFile = files.find((f) => f.path.toLowerCase().endsWith('project.godot'));
  const sceneFiles = files.filter((f) => f.path.toLowerCase().endsWith('.tscn'));
  const resourceFiles = files.filter((f) => f.path.toLowerCase().endsWith('.tres'));
  const gdFiles = files.filter((f) => f.path.toLowerCase().endsWith('.gd'));
  const csFiles = files.filter((f) => f.path.toLowerCase().endsWith('.cs'));

  if (projectGodotFile === undefined) {
    findings.push({
      severity: 'error',
      category: 'project',
      message: 'project.godot not found; Godot project may be incomplete.',
      file: null,
      suggestion: 'Ensure the Godot project root contains project.godot.',
    });
  } else if (projectGodotFile.content === null) {
    findings.push({
      severity: 'error',
      category: 'project',
      message: 'project.godot could not be read.',
      file: projectGodotFile.path,
      suggestion: 'Check file permissions and encoding.',
    });
  } else {
    try {
      parseGodotProject(projectGodotFile.content);
    } catch (error) {
      findings.push({
        severity: 'error',
        category: 'project',
        message: `project.godot failed to parse: ${String(error)}`,
        file: projectGodotFile.path,
        suggestion: 'Verify project.godot is well-formed.',
      });
    }
  }

  for (const scene of sceneFiles) {
    if (scene.content === null) {
      findings.push({
        severity: 'error',
        category: 'scene',
        message: `Godot scene ${scene.path} could not be read.`,
        file: scene.path,
        suggestion: 'Check file permissions and encoding.',
      });
      continue;
    }
    try {
      parseGodotScene(scene.content);
    } catch (error) {
      findings.push({
        severity: 'error',
        category: 'scene',
        message: `Godot scene ${scene.path} failed to parse: ${String(error)}`,
        file: scene.path,
        suggestion: 'Verify the .tscn file is well-formed.',
      });
    }
  }

  for (const resource of resourceFiles) {
    if (resource.content === null) {
      findings.push({
        severity: 'error',
        category: 'resource',
        message: `Godot resource ${resource.path} could not be read.`,
        file: resource.path,
        suggestion: 'Check file permissions and encoding.',
      });
    }
  }

  for (const gd of gdFiles) {
    if (gd.content === null) {
      findings.push({
        severity: 'error',
        category: 'script',
        message: `GDScript file ${gd.path} could not be read.`,
        file: gd.path,
        suggestion: 'Check file permissions and encoding.',
      });
    }
  }

  for (const cs of csFiles) {
    if (cs.content === null) {
      findings.push({
        severity: 'error',
        category: 'script',
        message: `C# script file ${cs.path} could not be read.`,
        file: cs.path,
        suggestion: 'Check file permissions and encoding.',
      });
    }
  }

  if (sceneFiles.length === 0) {
    findings.push({
      severity: 'info',
      category: 'scenes',
      message: 'No Godot scene (.tscn) files found.',
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
