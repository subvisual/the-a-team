#!/usr/bin/env node
// PreToolUse hook. Exit 2 blocks the call and shows stderr to the model.
import { denyReason } from '../deny.mjs'

let raw = ''
process.stdin.setEncoding('utf8')
process.stdin.on('data', (d) => { raw += d })
process.stdin.on('end', () => {
  let event
  try { event = JSON.parse(raw || '{}') } catch { process.exit(0) }
  const reason = denyReason({
    toolName: event.tool_name,
    toolInput: event.tool_input,
    cwd: event.cwd || process.cwd(),
  })
  if (!reason) process.exit(0)
  process.stderr.write(`ateam-runner: ${reason}\n`)
  process.exit(2)
})
