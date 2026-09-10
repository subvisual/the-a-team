import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { isMain } from './entrypoint.mjs'
import { selectTaskContext, refreshCurrentContext, revalidateCurrentContext } from './context.mjs'

export function contextCommand(argv) {
  const [command, ...args] = argv
  try {
    if (!['select', 'refresh', 'revalidate'].includes(command))
      throw new Error('Use select --root PATH [--task JSON] or refresh --root PATH --update PATH')
    const options = {}
    for (let i = 0; i < args.length; i += 2) {
      if (
        !['--root', '--task', '--update', '--policy'].includes(args[i]) ||
        args[i + 1] === undefined ||
        options[args[i]] !== undefined
      )
        throw new Error(`Invalid context option ${args[i]}`)
      options[args[i]] = args[i + 1]
    }
    if (!options['--root']) throw new Error('--root is required')
    const root = resolve(options['--root'])
    const policy = options['--policy']
      ? JSON.parse(readFileSync(resolve(options['--policy']), 'utf8'))
      : undefined
    if (
      (command === 'select' && options['--update']) ||
      (command !== 'select' && options['--task'])
    )
      throw new Error('Context option does not apply to command')
    const result =
      command === 'select'
        ? selectTaskContext({
            root,
            policy,
            task: options['--task'] ? JSON.parse(options['--task']) : {},
          })
        : (command === 'refresh' ? refreshCurrentContext : revalidateCurrentContext)({
            root,
            policy,
            update: JSON.parse(readFileSync(resolve(options['--update']), 'utf8')),
          })
    const status = ['current', 'refreshed', 'revalidated'].includes(result.status)
      ? 'success'
      : 'blocked'
    return { schemaVersion: 1, command: `context-${command}`, status, result, error: null }
  } catch (error) {
    return {
      schemaVersion: 1,
      command: `context-${command}`,
      status: 'error',
      result: null,
      error: { code: error.code || 'context-invalid', message: error.message },
    }
  }
}
if (isMain(import.meta.url)) {
  const result = contextCommand(process.argv.slice(2))
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.status === 'success' ? 0 : 1
}
