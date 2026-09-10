#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMain } from './entrypoint.mjs'
import { resolvePolicy, readInvocationAuthorization } from './policy.mjs'
import { loadConfig } from './config.mjs'
import {
  planCombinedRevision,
  verifyCombinedRevision,
  validateCombinedRecord,
} from './combined-verification.mjs'

export async function combinedCommand(argv) {
  try {
    const [command, ...args] = argv,
      options = {}
    if (!['plan', 'verify', 'check'].includes(command))
      throw Error('combined command must be plan, verify or check')
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--root', '--branch', '--issues', '--record', '--authorization-file'].includes(args[i]) ||
        args[i + 1] === undefined ||
        Object.hasOwn(options, args[i])
      )
        throw Error(`invalid combined option ${args[i]}`)
      options[args[i]] = args[i + 1]
    }
    if (!options['--root'] || !options['--branch'] || !options['--issues'])
      throw Error('--root, --branch and --issues are required')
    const root = resolve(options['--root']),
      approvedIssues = JSON.parse(readFileSync(options['--issues'], 'utf8'))
    const policy = await resolvePolicy({
      repoPath: root,
      cfg: loadConfig(),
      authorization: readInvocationAuthorization(options['--authorization-file']),
    })
    const context = { root, branch: options['--branch'], policy, approvedIssues }
    if (command === 'plan') {
      if (options['--record']) throw Error('--record only applies to check')
      return await planCombinedRevision(context)
    }
    if (command === 'check') {
      if (!options['--record']) throw Error('--record is required for check')
      const result = await validateCombinedRecord(options['--record'], context)
      return { status: result.valid ? 'passed' : 'stale', ...result }
    }
    if (options['--record']) throw Error('--record only applies to check')
    return await verifyCombinedRevision({ ...context, repo: policy.target.remote || root })
  } catch (error) {
    return {
      status: 'error',
      error: { message: error.message, code: error.code || 'combined-invalid' },
    }
  }
}
if (isMain(import.meta.url)) {
  const result = await combinedCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify({ schemaVersion: 1, ...result }, null, 2) + '\n')
  process.exitCode = ['passed', 'planned'].includes(result.status) ? 0 : 2
}
