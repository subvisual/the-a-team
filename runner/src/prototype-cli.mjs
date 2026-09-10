#!/usr/bin/env node
import { isMain } from './entrypoint.mjs'
import {
  generatePrototype,
  validateFeatureFlow,
  compileFeatureFlow,
  assessFeatureFlow,
} from './prototype.mjs'

export function prototypeCommand(argv) {
  try {
    const [command, ...args] = argv,
      options = {}
    for (let i = 0; i < args.length; i++) {
      const key = args[i]
      if (
        !['--feature', '--root', '--stage', '--input'].includes(key) ||
        Object.hasOwn(options, key) ||
        !args[i + 1]
      )
        throw new Error(`Invalid prototype option ${key}`)
      options[key] = args[++i]
    }
    const handler = {
      compile: compileFeatureFlow,
      generate: generatePrototype,
      validate: validateFeatureFlow,
      assess: assessFeatureFlow,
    }[command]
    if (
      !options['--feature'] ||
      !handler ||
      (['compile', 'assess'].includes(command) && !options['--input'])
    )
      throw new Error(
        'Use compile|generate|validate|assess --feature <directory> [--root <target>] [--stage design|spec]; compile/assess require --input <feature-relative JSON>',
      )
    return handler({
      featureDir: options['--feature'],
      root: options['--root'],
      stage: options['--stage'],
      input: options['--input'],
    })
  } catch (error) {
    return { ok: false, diagnostics: [{ field: 'prototype', message: error.message }] }
  }
}
if (isMain(import.meta.url)) {
  const report = prototypeCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(report, null, 2) + '\n')
  process.exitCode = report.ok ? 0 : 2
}
