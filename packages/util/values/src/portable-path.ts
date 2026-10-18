/**
 * Lexical path-text handling for Windows and POSIX portable paths.
 *
 * Every function here treats a path as text: separators are rewritten to `/`,
 * nothing touches the filesystem, and no function resolves symlinks, folds
 * case, or resolves a drive-relative (`C:foo`) reference. A path counts as
 * absolute when it starts with `/` (UNC included) or with a drive letter
 * followed by `:`; everything else is relative.
 *
 * @module @deepseek-ai/dsh-util-values/portable-path
 */

/** A drive specifier occupying a whole path segment, as in `C:`. */
const DRIVE_SEGMENT = /^[A-Za-z]:$/

/**
 * Rewrite every backslash in `path` as a forward slash.
 *
 * @param path - path text in either separator style.
 * @returns the same text with `\` replaced by `/`.
 */
export function toPosixPath(path: string): string {
  return path.replace(/\\/g, '/')
}

/**
 * Normalize path text to a canonical forward-slash form.
 *
 * Empty and `.` segments are dropped, repeated slashes collapse to one, and
 * `..` pops the preceding segment. A `..` that cannot pop is kept literal when
 * the path is relative and dropped otherwise: it never pops a drive segment,
 * never crosses above the root of an absolute path, and never pops a `..` that
 * was already kept. Because the walk is lexical, a relative path can keep a
 * leading `..` run and a UNC prefix collapses to a single `/`.
 *
 * @param path - path text in either separator style.
 * @returns `''` for empty input, `'/'` for a root, `'C:/'` for a drive root,
 * `'C:/a/b'` for a drive path, and `'a/b'` for a relative path.
 */
export function normalizePortablePath(path: string): string {
  const posix = toPosixPath(path)
  const absolute = posix.startsWith('/')
  const segments: string[] = []
  for (const part of posix.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') {
      const last = segments.at(-1)
      if (last === undefined) {
        if (!absolute) segments.push('..')
        continue
      }
      if (last === '..') {
        segments.push('..')
        continue
      }
      if (segments.length === 1 && DRIVE_SEGMENT.test(last)) continue
      segments.pop()
      continue
    }
    segments.push(part)
  }
  const first = segments[0]
  if (!absolute && first !== undefined && DRIVE_SEGMENT.test(first)) {
    const body = segments.slice(1)
    return body.length === 0 ? `${first}/` : `${first}/${body.join('/')}`
  }
  const body = segments.join('/')
  return absolute ? `/${body}` : body
}

/**
 * Whether `path` is absolute.
 *
 * True for a leading `/`, including the UNC form `//server/share`, and for a
 * leading drive letter followed by `:` with or without a following slash. The
 * drive-relative form `C:foo` also reports true, because only a file system
 * can resolve it.
 *
 * @param path - path text in either separator style.
 * @returns whether the path is absolute.
 */
export function isAbsolutePortablePath(path: string): boolean {
  const posix = toPosixPath(path)
  return posix.startsWith('/') || /^[A-Za-z]:/.test(posix)
}

/**
 * The last non-empty segment of the normalized path.
 *
 * @param path - path text in either separator style.
 * @returns the last segment, or `''` when normalization leaves nothing or a
 * root (`/`, `C:/`).
 */
export function portableBasename(path: string): string {
  const normalized = normalizePortablePath(path)
  if (normalized === '') return ''
  const segments = normalized.split('/').filter((segment) => segment !== '')
  const last = segments.at(-1)
  if (last === undefined || DRIVE_SEGMENT.test(last)) return ''
  return last
}

/**
 * The parent part of `path`, taken from the posix form without normalization.
 *
 * Trailing slashes are ignored, so they never become the parent name. The
 * result is everything before the last separator: `.` when there is no
 * separator, `/` when that prefix is empty, and the drive plus `/` when the
 * prefix is a drive specifier. Only the parent of the last name is computed,
 * so a bare drive root (`C:/`) yields `.`.
 *
 * @param path - path text in either separator style.
 * @returns the parent path, or `'.'` when the path has no parent part.
 */
export function portableDirname(path: string): string {
  const posix = toPosixPath(path)
  let end = posix.length
  while (end > 0 && posix[end - 1] === '/') end -= 1
  if (end === 0) return posix === '' ? '.' : '/'
  const name = posix.slice(0, end)
  const slash = name.lastIndexOf('/')
  if (slash === -1) return '.'
  const parent = name.slice(0, slash)
  if (parent === '') return '/'
  return DRIVE_SEGMENT.test(parent) ? `${parent}/` : parent
}

/**
 * The extension of the basename, including its leading dot.
 *
 * @param path - path text in either separator style.
 * @returns the extension, or `''` when the basename has no dot or its only dot
 * is its first character.
 */
export function portableExtension(path: string): string {
  const base = portableBasename(path)
  const dot = base.lastIndexOf('.')
  return dot <= 0 ? '' : base.slice(dot)
}

/**
 * Join path parts with `/`, skipping empty parts.
 *
 * The join is lexical: parts are not normalized, so a repeated separator or a
 * trailing slash inside a part survives. An absolute part (see
 * {@link isAbsolutePortablePath}) discards everything joined before it. No
 * separator is added where one already exists, so the only `//` a result can
 * contain is a UNC-style prefix already present in the first part.
 *
 * @param parts - path parts, in order.
 * @returns the joined path, or `''` when every part is empty.
 */
export function joinPortable(...parts: readonly string[]): string {
  let joined = ''
  for (const part of parts) {
    if (part === '') continue
    if (joined === '' || isAbsolutePortablePath(part)) {
      joined = part
      continue
    }
    joined = joined.endsWith('/') ? `${joined}${part}` : `${joined}/${part}`
  }
  return joined
}

/**
 * Whether `child` is `parent` or lies below it.
 *
 * Both arguments are normalized first, and the comparison is case-sensitive,
 * so `C:/A` is not inside `C:/a`. A drive that differs never matches, unless
 * normalization makes the two paths equal. A parent that normalizes to `''`
 * contains nothing.
 *
 * @param parent - containing path.
 * @param child - candidate path.
 * @returns whether `child` is `parent` itself or a descendant of it.
 */
export function isPortablePathInside(parent: string, child: string): boolean {
  const normalizedParent = normalizePortablePath(parent)
  if (normalizedParent === '') return false
  const normalizedChild = normalizePortablePath(child)
  if (normalizedChild === normalizedParent) return true
  const prefix = normalizedParent.endsWith('/') ? normalizedParent : `${normalizedParent}/`
  return normalizedChild.startsWith(prefix)
}
