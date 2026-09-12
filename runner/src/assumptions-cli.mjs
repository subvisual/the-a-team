#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { isMain } from './entrypoint.mjs'
import { validateFeatureAssumptions } from './assumptions.mjs'

export async function assumptionsCommand(argv) {
  try {
    const options = {}
    for (let index = 0; index < argv.length; index += 2) {
      const key = argv[index]
      if (
        !['--root', '--feature', '--stage'].includes(key) ||
        argv[index + 1] === undefined ||
        Object.hasOwn(options, key)
      )
        throw new Error(`Invalid assumption option ${key}`)
      options[key] = argv[index + 1]
    }
    if (!options['--root']) throw new Error('--root is required')
    const featureDir = options['--feature'] ? resolve(options['--feature']) : undefined
    const manifest =
      featureDir && existsSync(join(featureDir, 'feature.json'))
        ? JSON.parse(readFileSync(join(featureDir, 'feature.json'), 'utf8'))
        : {}
    return await validateFeatureAssumptions({
      root: resolve(options['--root']),
      featureDir,
      stage: options['--stage'] || 'discovery',
      manifest,
    })
  } catch (error) {
    return {
      schemaVersion: 1,
      ok: false,
      canAdvance: false,
      diagnostics: [
        { code: 'research-command', severity: 'error', message: error.message },
      ],
    }
  }
}
if (isMain(import.meta.url)) {
  const report = await assumptionsCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.ok ? 0 : 2
}
