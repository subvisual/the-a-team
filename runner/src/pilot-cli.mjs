#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { calculatePilot, validatePilotHandoff, appendCheckpoint } from './pilot-scorecard.mjs'

export function renderPilot(report) {
  const measured = (item) =>
    item.total === null
      ? `unknown (${item.knownTotal} known; ${item.missingCount} missing)`
      : String(item.total)
  return (
    [
      `Pilot ${report.id} — ${report.origin}; ${report.ok ? 'valid authored records' : 'blocked records'}`,
      `Human-accepted increments: ${report.acceptedIncrements}`,
      `All attempts: ${report.attempts}; spend USD ${measured(report.metrics.spendUsd)}`,
      `Human time: ${measured(report.metrics.humanMinutes)} minutes; attribution ${report.acceptedPerHumanHour.attribution}`,
      `Accepted increments per human hour: ${report.acceptedPerHumanHour.value ?? 'unknown'} (${report.acceptedPerHumanHour.numerator} / ${report.acceptedPerHumanHour.denominatorMinutes ?? 'unknown'} minutes × 60)`,
      'The denominator includes unsuccessful and interrupted attempts in the whole cohort.',
      `First-pass acceptance: ${report.firstPassAcceptance.numerator}/${report.firstPassAcceptance.denominator}; ${report.firstPassAcceptance.definition}`,
      `Active review: ${measured(report.metrics.activeReviewMinutes)} minutes; decisions requested: ${measured(report.metrics.decisionsRequested)}`,
      `Context: USD ${measured(report.metrics.contextCostUsd)}, ${measured(report.metrics.contextMinutes)} minutes (subsets of total spend/time)`,
      `Context sufficiency: ${JSON.stringify(report.contextSufficiency)}`,
      `Escaped defects: ${JSON.stringify(report.escapedDefects)}`,
      `Observed recovery: ${report.recovery.numerator}/${report.recovery.denominator}; unrun ${report.recovery.unrun}, unknown ${report.recovery.unknown}`,
      `Observed primary-job success: ${report.primaryJob.numerator}/${report.primaryJob.denominator}; unrun ${report.primaryJob.unrun}, unknown ${report.primaryJob.unknown}`,
      ...Object.entries(report.milestones).map(
        ([name, counts]) =>
          `${name}: recorded ${counts.recorded}; unrun ${counts.unrun}; unknown ${counts.unknown}`,
      ),
      `Ordinary-assisted comparison: ${report.comparison.status}; descriptive rate ratio ${report.comparison.multiplier ?? 'unknown'}`,
      report.comparison.limitation,
      `Unrun obligations: ${report.unrunObligations.join(', ') || 'none recorded'}`,
      ...report.limitations.map((value) => `Limitation: ${value}`),
      ...report.diagnostics.map((d) => `Blocked: ${d.path}: ${d.message}`),
    ].join('\n') + '\n'
  )
}
export function pilotCommand(argv) {
  try {
    const [command, ...args] = argv,
      options = {}
    if (!['scorecard', 'handoff', 'checkpoint'].includes(command))
      throw Error('Use scorecard, handoff or checkpoint')
    const allowed =
      command === 'checkpoint'
        ? ['--input', '--previous', '--output']
        : command === 'scorecard'
          ? ['--input', '--format']
          : ['--input']
    for (let i = 0; i < args.length; i += 2) {
      if (!allowed.includes(args[i]) || !args[i + 1] || Object.hasOwn(options, args[i]))
        throw Error('Unsupported, missing or duplicate option')
      options[args[i]] = args[i + 1]
    }
    if (!options['--input']) throw Error('--input is required')
    const input = JSON.parse(readFileSync(resolve(options['--input']), 'utf8'))
    let result, ok
    if (command === 'scorecard') {
      if (options['--format'] && !['json', 'text'].includes(options['--format']))
        throw Error('Choose json or text format')
      result = calculatePilot(input)
      ok = result.ok
    } else if (command === 'handoff') {
      result = validatePilotHandoff(input)
      ok = result.readyForLive
    } else {
      if (!options['--previous'] || !options['--output'])
        throw Error('checkpoint requires --previous and a new --output snapshot')
      const bytes = readFileSync(resolve(options['--previous'])),
        previous = JSON.parse(bytes)
      const entries = appendCheckpoint(Array.isArray(previous) ? previous : previous.entries, input)
      result = {
        schemaVersion: 1,
        previous: {
          reference: basename(options['--previous']),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
        entries,
      }
      writeFileSync(resolve(options['--output']), JSON.stringify(result, null, 2) + '\n', {
        flag: 'wx',
        mode: 0o600,
      })
      ok = true
    }
    return {
      schemaVersion: 1,
      status: ok ? 'success' : 'blocked',
      result,
      error: null,
      ...(options['--format'] === 'text' ? { rendered: renderPilot(result) } : {}),
    }
  } catch (error) {
    return { schemaVersion: 1, status: 'error', result: null, error: { message: error.message } }
  }
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = pilotCommand(process.argv.slice(2))
  process.stdout.write(result.rendered || JSON.stringify(result, null, 2) + '\n')
  process.exitCode = result.status === 'success' ? 0 : 2
}
