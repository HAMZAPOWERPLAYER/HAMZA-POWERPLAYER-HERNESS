/**
 * A documented INI subset scanner shared by the Godot project-file readers.
 *
 * The scanner splits text into section headers and key/value entries, ignoring
 * blank lines and `;`/`#` comments, and reports each entry with the section it
 * belongs to. Values never span lines, keys are trimmed, and no escape
 * processing is applied; callers apply their own quote stripping and key
 * interpretation. This module performs no I/O and holds no state.
 *
 * @module @deepseek-ai/dsh-util-values/ini-subset
 */

/** One line of an INI-subset document. */
export type IniLine =
  | { readonly kind: 'section'; readonly name: string }
  | { readonly kind: 'entry'; readonly section: string | null; readonly key: string; readonly value: string }

/** Scan an INI-subset document into section and entry lines.
 * @param text - document text.
 * @returns the section and entry lines in document order.
 */
export function scanIniSubset(text: string): readonly IniLine[] {
  const lines: IniLine[] = []
  let section: string | null = null
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith(';') || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      section = line.slice(1, -1).trim()
      lines.push({ kind: 'section', name: section })
      continue
    }
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line.slice(0, separator).trim()
    if (key === '') continue
    lines.push({ kind: 'entry', section, key, value: line.slice(separator + 1).trim() })
  }
  return lines
}
