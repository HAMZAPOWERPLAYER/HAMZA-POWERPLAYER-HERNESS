import { describe, expect, it } from 'vitest'
import {
  findUnityEntryPoints,
  parseUnityCsproj,
  parseUnitySln,
  type UnityCsprojProject,
} from '../src/unity-csharp-project.ts'

describe('parseUnityCsproj', () => {
  it('parses a full csproj with all fields and references', () => {
    const text = [
      '<Project Sdk="Microsoft.NET.Sdk">',
      '  <PropertyGroup>',
      '    <ProjectGuid>{11111111-1111-1111-1111-111111111111}</ProjectGuid>',
      '    <TargetFramework>net8.0</TargetFramework>',
      '    <OutputType>WinExe</OutputType>',
      '    <RootNamespace>My.Game</RootNamespace>',
      '    <AssemblyName>My.Game</AssemblyName>',
      '  </PropertyGroup>',
      '  <ItemGroup>',
      '    <ProjectReference Include="../Shared/Shared.csproj" />',
      '    <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />',
      '  </ItemGroup>',
      '  <ItemGroup>',
      '    <Compile Include="Program.cs" />',
      '    <Compile Include="Properties/AssemblyInfo.cs" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n')

    expect(parseUnityCsproj(text)).toEqual({
      projectGuid: '{11111111-1111-1111-1111-111111111111}',
      targetFramework: 'net8.0',
      outputType: 'WinExe',
      rootNamespace: 'My.Game',
      assemblyName: 'My.Game',
      projectReferences: ['../Shared/Shared.csproj'],
      packageReferences: ['Newtonsoft.Json'],
      compileItems: ['Program.cs', 'Properties/AssemblyInfo.cs'],
    })
  })

  it('returns null scalars and empty lists for empty text', () => {
    expect(parseUnityCsproj('')).toEqual({
      projectGuid: null,
      targetFramework: null,
      outputType: null,
      rootNamespace: null,
      assemblyName: null,
      projectReferences: [],
      packageReferences: [],
      compileItems: [],
    })
  })

  it('reads every PropertyGroup scalar', () => {
    const text = [
      '<Project>',
      '  <PropertyGroup>',
      '    <ProjectGuid>{22222222-2222-2222-2222-222222222222}</ProjectGuid>',
      '    <TargetFramework>netstandard2.0</TargetFramework>',
      '    <OutputType>Library</OutputType>',
      '    <RootNamespace>Lib</RootNamespace>',
      '    <AssemblyName>Lib.dll</AssemblyName>',
      '  </PropertyGroup>',
      '</Project>',
    ].join('\n')
    const parsed = parseUnityCsproj(text)
    expect(parsed.projectGuid).toBe('{22222222-2222-2222-2222-222222222222}')
    expect(parsed.targetFramework).toBe('netstandard2.0')
    expect(parsed.outputType).toBe('Library')
    expect(parsed.rootNamespace).toBe('Lib')
    expect(parsed.assemblyName).toBe('Lib.dll')
  })

  it('lets a duplicate scalar key last-win within a group', () => {
    const text = [
      '<Project>',
      '  <PropertyGroup>',
      '    <TargetFramework>net472</TargetFramework>',
      '    <TargetFramework>net8.0</TargetFramework>',
      '  </PropertyGroup>',
      '</Project>',
    ].join('\n')
    expect(parseUnityCsproj(text).targetFramework).toBe('net8.0')
  })

  it('merges multiple PropertyGroup groups, later overrides earlier', () => {
    const text = [
      '<Project>',
      '  <PropertyGroup>',
      '    <OutputType>Library</OutputType>',
      '  </PropertyGroup>',
      '  <PropertyGroup>',
      '    <OutputType>Exe</OutputType>',
      '  </PropertyGroup>',
      '</Project>',
    ].join('\n')
    expect(parseUnityCsproj(text).outputType).toBe('Exe')
  })

  it('separates ProjectReference from PackageReference', () => {
    const text = [
      '<Project>',
      '  <ItemGroup>',
      '    <ProjectReference Include="../Core/Core.csproj" />',
      '    <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />',
      '    <ProjectReference Include="../Shared/Shared.csproj" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n')
    const parsed = parseUnityCsproj(text)
    expect(parsed.projectReferences).toEqual(['../Core/Core.csproj', '../Shared/Shared.csproj'])
    expect(parsed.packageReferences).toEqual(['Newtonsoft.Json'])
  })

  it('collects Compile Include items', () => {
    const text = [
      '<Project>',
      '  <ItemGroup>',
      '    <Compile Include="Program.cs" />',
      '    <Compile Include="Properties/AssemblyInfo.cs" />',
      '    <Compile Include="Models/Model.cs" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n')
    expect(parseUnityCsproj(text).compileItems).toEqual([
      'Program.cs',
      'Properties/AssemblyInfo.cs',
      'Models/Model.cs',
    ])
  })

  it('reads elements regardless of Condition attributes', () => {
    const text = [
      '<Project>',
      '  <ItemGroup>',
      '    <Compile Include="Debug.cs" Condition="\'$(Configuration)\' == \'Debug\'" />',
      '    <Compile Include="Release.cs" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n')
    expect(parseUnityCsproj(text).compileItems).toEqual(['Debug.cs', 'Release.cs'])
  })

  it('accepts double-quoted Include values', () => {
    const text = '<Project><ItemGroup><PackageReference Include="Newtonsoft.Json" /></ItemGroup></Project>'
    expect(parseUnityCsproj(text).packageReferences).toEqual(['Newtonsoft.Json'])
  })

  it('accepts single-quoted Include values', () => {
    const text = "<Project><ItemGroup><PackageReference Include='Newtonsoft.Json' /></ItemGroup></Project>"
    expect(parseUnityCsproj(text).packageReferences).toEqual(['Newtonsoft.Json'])
  })

  it('accepts unquoted Include values', () => {
    const text = '<Project><ItemGroup><Compile Include=Program.cs /></ItemGroup></Project>'
    expect(parseUnityCsproj(text).compileItems).toEqual(['Program.cs'])
  })

  it('ignores malformed sections without throwing', () => {
    const text = '<Project><PropertyGroup><TargetFramework>net8.0</PropertyGroup></Project>'
    expect(() => parseUnityCsproj(text)).not.toThrow()
    const parsed = parseUnityCsproj(text)
    expect(parsed.projectGuid).toBeNull()
    expect(parsed.compileItems).toHaveLength(0)
  })

  it('merges ItemGroup references across groups', () => {
    const text = [
      '<Project>',
      '  <ItemGroup>',
      '    <ProjectReference Include="../A/A.csproj" />',
      '  </ItemGroup>',
      '  <ItemGroup>',
      '    <ProjectReference Include="../B/B.csproj" />',
      '  </ItemGroup>',
      '</Project>',
    ].join('\n')
    expect(parseUnityCsproj(text).projectReferences).toEqual(['../A/A.csproj', '../B/B.csproj'])
  })
})

describe('parseUnitySln', () => {
  it('parses multiple top-level projects', () => {
    const text = [
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "GameClient", "GameClient/GameClient.csproj", "{11111111-1111-1111-1111-111111111111}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "GameServer", "GameServer/GameServer.csproj", "{22222222-2222-2222-2222-222222222222}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "SharedLib", "SharedLib/SharedLib.csproj", "{33333333-3333-3333-3333-333333333333}"',
    ].join('\n')
    const parsed = parseUnitySln(text)
    expect(parsed).toHaveLength(3)
    expect(parsed[0]).toEqual({
      name: 'GameClient',
      relativePath: 'GameClient/GameClient.csproj',
      projectGuid: '{11111111-1111-1111-1111-111111111111}',
    })
    expect(parsed[1].name).toBe('GameServer')
    expect(parsed[2].name).toBe('SharedLib')
  })

  it('parses projects from a postProject GlobalSection', () => {
    const text = [
      'Global',
      '  GlobalSection(ProjectSections) = postProject',
      '    Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "PostProj", "PostProj/PostProj.csproj", "{44444444-4444-4444-4444-444444444444}"',
      '  EndGlobalSection',
      'EndGlobal',
    ].join('\n')
    const parsed = parseUnitySln(text)
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe('PostProj')
    expect(parsed[0].projectGuid).toBe('{44444444-4444-4444-4444-444444444444}')
  })

  it('returns each project once even when listed twice', () => {
    const text = [
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Dup", "Dup/Dup.csproj", "{55555555-5555-5555-5555-555555555555}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Dup", "Dup/Dup.csproj", "{55555555-5555-5555-5555-555555555555}"',
    ].join('\n')
    expect(parseUnitySln(text)).toHaveLength(1)
  })

  it('returns projects sorted by name', () => {
    const text = [
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Zebra", "Z/Z.csproj", "{aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Alpha", "A/A.csproj", "{bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb}"',
      'Project("{FAE04EC0-301F-11D3-BF4B-00C04F79EFBC}") = "Mid", "M/M.csproj", "{cccccccc-cccc-cccc-cccc-cccccccccccc}"',
    ].join('\n')
    const parsed = parseUnitySln(text)
    expect(parsed).toHaveLength(3)
    expect(parsed[0].name).toBe('Alpha')
    expect(parsed[1].name).toBe('Mid')
    expect(parsed[2].name).toBe('Zebra')
  })

  it('returns an empty array for empty text', () => {
    expect(parseUnitySln('')).toEqual([])
    expect(parseUnitySln('Global\nEndGlobal\n')).toEqual([])
  })

  it('ignores malformed solution text', () => {
    expect(parseUnitySln('not a solution at all')).toEqual([])
    expect(parseUnitySln('Project("bad") = no quotes here')).toEqual([])
  })
})

describe('findUnityEntryPoints', () => {
  function project(outputType: UnityCsprojProject['outputType'], assemblyName: UnityCsprojProject['assemblyName']): UnityCsprojProject {
    return {
      projectGuid: null,
      targetFramework: null,
      outputType,
      rootNamespace: null,
      assemblyName,
      projectReferences: [],
      packageReferences: [],
      compileItems: [],
    }
  }

  it('includes Exe and WinExe projects', () => {
    const projects = [project('Exe', 'Client.exe'), project('WinExe', 'Editor.exe'), project('Library', 'Shared.dll')]
    expect(findUnityEntryPoints(projects)).toEqual(['Client.exe', 'Editor.exe'])
  })

  it('excludes non-executable output types', () => {
    const projects = [project('Library', 'Shared.dll'), project('Module', 'Mod.dll'), project('WinExe', 'Editor.exe')]
    expect(findUnityEntryPoints(projects)).toEqual(['Editor.exe'])
  })

  it('returns names sorted in ascending order', () => {
    const projects = [project('Exe', 'Zebra.exe'), project('Exe', 'Alpha.exe'), project('Exe', 'Mid.exe')]
    expect(findUnityEntryPoints(projects)).toEqual(['Alpha.exe', 'Mid.exe', 'Zebra.exe'])
  })

  it('skips a project with no assembly name', () => {
    const projects = [project('Exe', null), project('Exe', 'Real.exe')]
    expect(findUnityEntryPoints(projects)).toEqual(['Real.exe'])
  })

  it('returns an empty array for no projects or no entry points', () => {
    expect(findUnityEntryPoints([])).toEqual([])
    expect(findUnityEntryPoints([project('Library', 'Shared.dll')])).toEqual([])
  })
})
