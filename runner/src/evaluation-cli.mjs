import { readFileSync } from 'node:fs'
import { runCorpus } from './evaluation-runner.mjs'
import { saveAgentTrial, saveReconciliation } from './evaluation.mjs'
import { isMain } from './entrypoint.mjs'
export function main(args = process.argv.slice(2)) {
  const [command, ...rest] = args
  if (command === 'run') {
    const options = {}
    while (rest.length) {
      const flag = rest.shift(),
        value = rest.shift()
      if (!['--output', '--profile'].includes(flag) || !value || options[flag.slice(2)])
        throw Error('Use run --output <new-directory> [--profile portable|native]')
      options[flag.slice(2)] = value
    }
    const result = runCorpus(options)
    console.log(JSON.stringify(result.summary))
    return result.ok ? 0 : 1
  }
  if (['record-trial', 'reconcile'].includes(command) && rest.length === 2) {
    const [output, input] = rest
    const record = JSON.parse(readFileSync(input, 'utf8'))
    const saved =
      command === 'record-trial'
        ? saveAgentTrial(output, record)
        : saveReconciliation(output, record)
    console.log(JSON.stringify({ status: 'saved', saved }))
    return 0
  }
  throw Error(
    'Use run --output <directory> [--profile portable|native], record-trial <directory> <record.json>, or reconcile <directory> <record.json>',
  )
}
if (isMain(import.meta.url)) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
