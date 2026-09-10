import { realpathSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

// Node resolves a symlinked module URL, but argv retains its invocation path.
// Stdin, eval, and embedded callers may have no real file in argv[1].
export function isMain(metaUrl, argv = process.argv[1]) {
  if (typeof argv !== 'string' || !argv || argv === '-') return false
  try {
    return metaUrl === pathToFileURL(realpathSync(argv)).href
  } catch {
    return false
  }
}
