#!/usr/bin/env node
import { isMain } from './entrypoint.mjs'
import { applyFeatureCommand, loadFeature } from './feature-state.mjs'

export async function featureCommand(argv) {
  try {
    const [type, ...args] = argv
    const options = {}
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--feature', '--expected-revision', '--event-id', '--input'].includes(args[i]) ||
        args[i + 1] === undefined ||
        Object.hasOwn(options, args[i])
      )
        throw new Error(`Invalid feature option ${args[i]}`)
      options[args[i]] = args[i + 1]
    }
    if (!options['--feature']) throw new Error('--feature is required')
    if (type === 'show') {
      if (Object.keys(options).length !== 1) throw new Error('show accepts only --feature')
      return { status: 'success', manifest: await loadFeature(options['--feature']), error: null }
    }
    const input = JSON.parse(options['--input'] || '{}')
    if (!input || typeof input !== 'object' || Array.isArray(input) || Object.hasOwn(input, 'type'))
      throw new Error('--input must be a command object without type')
    if (!/^\d+$/.test(options['--expected-revision'] || ''))
      throw new Error('--expected-revision must be a nonnegative integer')
    return await applyFeatureCommand({
      featureDir: options['--feature'],
      expectedRevision: Number(options['--expected-revision']),
      eventId: options['--event-id'],
      command: type === 'init' ? { type, input } : { type, ...input },
    })
  } catch (error) {
    return {
      status: 'error',
      manifest: null,
      error: { code: error.code || 'feature-invalid', message: error.message },
    }
  }
}
if (isMain(import.meta.url)) {
  const result = await featureCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify({ schemaVersion: 1, ...result }, null, 2) + '\n')
  process.exitCode = result.status === 'success' ? 0 : 2
}
