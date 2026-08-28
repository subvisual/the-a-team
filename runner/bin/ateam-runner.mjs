#!/usr/bin/env node
import { main } from '../src/cli.mjs'

main(process.argv.slice(2)).then(
  (code) => { process.exitCode = code ?? 0 },
  (err) => {
    console.error(`ateam-runner: ${err?.message ?? err}`)
    if (process.env.ATEAM_RUNNER_DEBUG) console.error(err?.stack ?? '')
    process.exitCode = 1
  },
)
