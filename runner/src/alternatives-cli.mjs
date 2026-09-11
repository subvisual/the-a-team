#!/usr/bin/env node
import { isMain } from './entrypoint.mjs'
import { validateAlternativeFile } from './alternatives.mjs'

export async function alternativesCommand(argv) {
  try {
    const options = {}
    for (let i = 0; i < argv.length; i += 2) {
      if (
        !['--root', '--record', '--feature'].includes(argv[i]) ||
        !argv[i + 1] ||
        Object.hasOwn(options, argv[i])
      )
        throw Error('Use --root TARGET --record COMPARISON.json')
      options[argv[i]] = argv[i + 1]
    }
    if (!options['--root'] || !options['--record'])
      throw Error('Use --root TARGET --record COMPARISON.json')
    const result = await validateAlternativeFile({
      root: options['--root'],
      recordPath: options['--record'],
      featureDir: options['--feature'],
    })
    return { schemaVersion: 1, status: result.ok ? 'success' : 'blocked', result, error: null }
  } catch (error) {
    return { schemaVersion: 1, status: 'error', result: null, error: { message: error.message } }
  }
}
if (isMain(import.meta.url)) {
  const result = await alternativesCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.status === 'success' ? 0 : 2
}
