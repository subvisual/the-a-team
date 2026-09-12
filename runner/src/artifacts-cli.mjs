#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { isMain } from './entrypoint.mjs'
import {
  validateWireflow,
  validatePageBrief,
  validateComponents,
  validateFeatureArtifacts,
} from './artifacts.mjs'
export async function artifactsCommand(argv) {
  try {
    const [kind, ...args] = argv,
      options = {}
    for (let i = 0; i < args.length; i++) {
      const key = args[i]
      if (
        !['--input', '--stdin', '--mode', '--path', '--feature', '--root', '--stage'].includes(
          key,
        ) ||
        Object.hasOwn(options, key)
      )
        throw new Error(`Invalid artifact option ${key}`)
      options[key] = key === '--stdin' ? true : args[++i]
      if (options[key] === undefined) throw new Error(`${key} requires a value`)
    }
    const mode = options['--mode'] || 'strict'
    if (!['strict', 'permissive'].includes(mode))
      throw new Error('mode must be strict or permissive')
    let report
    if (kind === 'feature') {
      if (!options['--feature'] || mode !== 'strict')
        throw new Error('feature requires --feature and strict mode')
      report = await validateFeatureArtifacts({
        featureDir: options['--feature'],
        root: options['--root'],
        stage: options['--stage'],
      })
    } else {
      const validator = {
        wireflow: validateWireflow,
        'page-brief': validatePageBrief,
        components: validateComponents,
      }[kind]
      if (!validator || Boolean(options['--input']) === Boolean(options['--stdin']))
        throw new Error('Specify artifact kind and exactly one of --input or --stdin')
      report = validator(
        JSON.parse(readFileSync(options['--stdin'] ? 0 : options['--input'], 'utf8')),
        { path: options['--path'] || options['--input'] || 'stdin' },
      )
    }
    return {
      ...report,
      mode,
      eligible: mode === 'strict' && report.eligible,
      diagnostics: report.diagnostics.map((d) => ({
        ...d,
        severity: mode === 'permissive' ? 'warning' : d.severity,
      })),
    }
  } catch (error) {
    return {
      schemaVersion: 1,
      ok: false,
      eligible: false,
      mode: 'strict',
      diagnostics: [{ severity: 'error', field: 'input', message: error.message }],
      ids: {},
    }
  }
}
if (isMain(import.meta.url)) {
  const report = await artifactsCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.mode === 'permissive' || report.ok ? 0 : 2
}
