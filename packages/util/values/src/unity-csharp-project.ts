/**
 * Unity .csproj / .sln text review helpers.
 *
 * Parses MSBuild-style C# project text and Visual Studio solution text into
 * small dependency graphs for game project inspection. The parsers scan text
 * with regular expressions instead of building an XML tree, so they accept
 * XML-ish input, tolerate missing or malformed sections, and never throw on
 * malformed text. Nothing here touches the filesystem, resolves packages, or
 * evaluates MSBuild conditions.
 *
 * @module @deepseek-ai/dsh-util-values/unity-csharp-project
 */

/** A parsed Unity C# project file (`.csproj`). */
export interface UnityCsprojProject {
  /** Visual Studio project GUID, or `null` when the file declares none. */
  readonly projectGuid: string | null
  /** Target framework moniker, or `null` when the file declares none. */
  readonly targetFramework: string | null
  /** Output type such as `Exe`, `WinExe`, or `Library`, or `null` when absent. */
  readonly outputType: string | null
  /** Root namespace, or `null` when the file declares none. */
  readonly rootNamespace: string | null
  /** Assembly name, or `null` when the file declares none. */
  readonly assemblyName: string | null
  /** Project reference include paths in document order. */
  readonly projectReferences: readonly string[]
  /** Package reference include paths in document order. */
  readonly packageReferences: readonly string[]
  /** Compile include paths in document order. */
  readonly compileItems: readonly string[]
}

/** One project entry parsed from a Visual Studio solution (`.sln`) file. */
export interface UnitySolutionProject {
  /** Project name as declared in the solution. */
  readonly name: string
  /** Relative path to the project file from the solution directory. */
  readonly relativePath: string
  /** Project GUID, or `null` when the entry declares none. */
  readonly projectGuid: string | null
}

/** An ItemGroup child tag carrying an `Include` attribute. */
const ITEM_TAG = /<(ProjectReference|PackageReference|Compile)\b[^>]*\/?>/gi

/** The `Include` attribute value, accepting double, single, or unquoted text. */
const INCLUDE_ATTRIBUTE = /Include\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>/]+))/

/** A solution `Project("{guid}") = "name", "path", "{guid}"` entry, anywhere in the text. */
const SOLUTION_PROJECT = /Project\(\s*"\{([^}]*)\}"\s*\)\s*=\s*"([^"]*)"\s*,\s*"([^"]*)"\s*,\s*"(\{[^}]*\})"/gi

/**
 * Parse a Unity C# project file (`.csproj`) text.
 *
 * Reads `PropertyGroup` children (`ProjectGuid`, `TargetFramework`,
 * `OutputType`, `RootNamespace`, `AssemblyName`) and `ItemGroup` children
 * carrying an `Include` attribute (`ProjectReference`, `PackageReference`,
 * `Compile`). Duplicate scalar keys last-win within a group, and groups merge
 * in document order so a later group overrides an earlier one.
 * `Condition="..."` attributes are recognized syntactically but not evaluated,
 * so a conditional element is still read. Values may be quoted or unquoted.
 * No XML namespace handling, entity decoding, or conditional evaluation is
 * performed.
 *
 * @param text - MSBuild XML-ish `.csproj` text.
 * @returns the parsed project; absent scalar fields are `null` and absent lists are empty.
 */
export function parseUnityCsproj(text: string): UnityCsprojProject {
  let projectGuid: string | null = null
  let targetFramework: string | null = null
  let outputType: string | null = null
  let rootNamespace: string | null = null
  let assemblyName: string | null = null
  const projectReferences: string[] = []
  const packageReferences: string[] = []
  const compileItems: string[] = []

  const propertyGroup = /<PropertyGroup\b[^>]*>([\s\S]*?)<\/PropertyGroup>/gi
  for (const group of text.matchAll(propertyGroup)) {
    const body = group[1] ?? ''
    const child = /<(ProjectGuid|TargetFramework|OutputType|RootNamespace|AssemblyName)\b[^>]*>([^<]*)<\/\1>/gi
    for (const match of body.matchAll(child)) {
      const key = match[1] ?? ''
      const value = (match[2] ?? '').trim()
      switch (key) {
        case 'ProjectGuid':
          projectGuid = value
          break
        case 'TargetFramework':
          targetFramework = value
          break
        case 'OutputType':
          outputType = value
          break
        case 'RootNamespace':
          rootNamespace = value
          break
        case 'AssemblyName':
          assemblyName = value
          break
        default:
          break
      }
    }
  }

  const itemGroup = /<ItemGroup\b[^>]*>([\s\S]*?)<\/ItemGroup>/gi
  for (const group of text.matchAll(itemGroup)) {
    const body = group[1] ?? ''
    for (const match of body.matchAll(ITEM_TAG)) {
      const kind = match[1] ?? ''
      const tag = match[0] ?? ''
      const include = INCLUDE_ATTRIBUTE.exec(tag)
      const value = (include?.[1] ?? include?.[2] ?? include?.[3]) ?? null
      if (value === null) continue
      switch (kind) {
        case 'ProjectReference':
          projectReferences.push(value)
          break
        case 'PackageReference':
          packageReferences.push(value)
          break
        case 'Compile':
          compileItems.push(value)
          break
        default:
          break
      }
    }
  }

  return {
    projectGuid,
    targetFramework,
    outputType,
    rootNamespace,
    assemblyName,
    projectReferences,
    packageReferences,
    compileItems,
  }
}

/**
 * Parse a Visual Studio solution (`.sln`) text.
 *
 * Reads `Project("{guid}") = "name", "path", "{guid}"` entries from both the
 * top level and `GlobalSection(ProjectSections) = postProject` blocks. Each
 * project is returned once; duplicates by project GUID are collapsed, keeping
 * the first occurrence, and the result is sorted by name. Malformed sections
 * are ignored.
 *
 * @param text - Visual Studio solution `.sln` text.
 * @returns the projects declared by the solution, sorted by name.
 */
export function parseUnitySln(text: string): readonly UnitySolutionProject[] {
  const seen = new Set<string>()
  const projects: UnitySolutionProject[] = []
  for (const match of text.matchAll(SOLUTION_PROJECT)) {
    const projectGuidRaw = match[4] ?? ''
    const projectGuid = projectGuidRaw === '' ? null : projectGuidRaw
    if (projectGuid === null || seen.has(projectGuid)) continue
    seen.add(projectGuid)
    projects.push({
      name: match[2] ?? '',
      relativePath: match[3] ?? '',
      projectGuid,
    })
  }
  projects.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return projects
}

/**
 * Find candidate Unity entry-point projects.
 *
 * Returns the assembly names of projects whose `OutputType` is `Exe` or
 * `WinExe`, sorted in ascending order. This is a heuristic: the output type
 * alone does not guarantee a playable entry point, and a project with no
 * declared assembly name is skipped.
 *
 * @param projects - parsed C# projects to inspect.
 * @returns matching assembly names, sorted in ascending order.
 */
export function findUnityEntryPoints(projects: readonly UnityCsprojProject[]): readonly string[] {
  const names: string[] = []
  for (const project of projects) {
    if (project.outputType !== 'Exe' && project.outputType !== 'WinExe') continue
    if (project.assemblyName === null) continue
    names.push(project.assemblyName)
  }
  names.sort()
  return names
}
