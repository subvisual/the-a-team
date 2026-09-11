import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  lstatSync,
  copyFileSync,
  existsSync,
  realpathSync,
} from 'node:fs'
import { join, dirname, basename, resolve, relative, isAbsolute } from 'node:path'
import { spawnSync, execFileSync } from 'node:child_process'
import { release } from 'node:os'
import { digest, json, readCatalog, validateVersions } from './evaluation.mjs'
const HARNESS = resolve(import.meta.dirname, '../..')
export function resolveEvidenceOutput(root, output) {
  const canonicalRoot = realpathSync(root)
  let ancestor = resolve(output)
  const missing = []
  // Resolve through the nearest existing ancestor before creating missing directories.
  // lstat keeps dangling symlinks visible; realpath then rejects them without writes.
  while (true) {
    try {
      lstatSync(ancestor)
      break
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      const parent = dirname(ancestor)
      if (parent === ancestor) throw error
      missing.unshift(basename(ancestor))
      ancestor = parent
    }
  }
  const canonicalOutput = resolve(realpathSync(ancestor), ...missing)
  const rel = relative(canonicalRoot, canonicalOutput)
  if (!(rel === '..' || rel.startsWith('../') || isAbsolute(rel)))
    throw Error('Evaluation evidence must be outside the harness checkout')
  return canonicalOutput
}
const save = (path, value) => writeFileSync(path, json(value), { flag: 'wx' })
const exact = (text) => `^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
export function assessProcess(result, testName) {
  const counts = Object.fromEntries(
    ['pass', 'fail', 'cancelled', 'skipped'].map((key) => [
      key,
      Number(result.stdout?.match(new RegExp(`^# ${key} (\\d+)$`, 'm'))?.[1] ?? NaN),
    ]),
  )
  const unmatchedSkips = (
    result.stdout?.match(/^ok .* # SKIP test name does not match pattern$/gm) || []
  ).length
  const selected = !testName || result.stdout?.split('\n').includes(`# Subtest: ${testName}`)
  const passed =
    selected &&
    result.status === 0 &&
    !result.error &&
    !result.signal &&
    counts.pass > 0 &&
    counts.fail === 0 &&
    counts.cancelled === 0 &&
    counts.skipped === unmatchedSkips
  return {
    status: passed ? 'passed' : 'failed',
    reason: passed
      ? 'Selected regression assertions passed'
      : 'Selected regression did not complete with nonzero passing assertions and zero failures/skips',
    counts: Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, Number.isNaN(v) ? null : v]),
    ),
  }
}
export function sourceSnapshot(root = HARNESS) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
  const paths = [
    ...new Set(
      execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
        cwd: root,
        encoding: 'utf8',
      })
        .split('\0')
        .filter(Boolean),
    ),
  ].sort()
  const files = paths.map((path) => {
    const absolute = join(root, path)
    if (!lstatSync(absolute).isFile())
      throw Error(`Evaluation source must be a regular file: ${path}`)
    return { path, digest: digest(readFileSync(absolute)) }
  })
  return {
    head: git('rev-parse', 'HEAD'),
    worktreeStatus: git('status', '--short'),
    digest: digest(json(files)),
    skillBundleDigest: digest(json(files.filter((f) => f.path.startsWith('.claude/skills/')))),
    files,
  }
}
function runCase(scenario, root, dir, metadata, profile) {
  mkdirSync(dir)
  const env = {
    ...process.env,
    ATEAM_EVALUATION_CASE_DIR: dir,
    ATEAM_EVALUATION_HARNESS_DIGEST: metadata.harnessDigest,
    ATEAM_NATIVE_SANDBOX_TEST: profile === 'native' ? '1' : '0',
  }
  const args = [
    '--test',
    '--test-reporter=tap',
    `--test-name-pattern=${exact(scenario.testName)}`,
    scenario.testFile,
  ]
  const started = Date.now()
  const result = spawnSync(process.execPath, args, {
    cwd: join(root, 'runner'),
    env,
    encoding: 'utf8',
    timeout: 180_000,
    maxBuffer: 8 * 1024 * 1024,
  })
  const outcome = assessProcess(result, scenario.testName)
  save(join(dir, 'record.json'), {
    schemaVersion: 1,
    scenarioId: scenario.id,
    scenarioVersion: scenario.version,
    kind: 'deterministic',
    synthetic: true,
    versions: metadata,
    expected: scenario.expected,
  })
  save(join(dir, 'outcome.json'), outcome)
  save(join(dir, 'trace.json'), {
    command: [process.execPath, ...args],
    cwd: join(root, 'runner'),
    profile,
    durationMs: Date.now() - started,
    exitCode: result.status,
    signal: result.signal,
    error: result.error?.message || null,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  })
  save(join(dir, 'subjective.json'), {
    status: 'not-scored',
    assessments: [],
    reason: 'Deterministic assertions do not establish expert usability or model capability',
  })
  return outcome
}
export function seedVersions(original, sourceFiles, after, runConfiguration) {
  const files = sourceFiles.map((file) =>
    file.path === 'runner/src/context.mjs' ? { ...file, digest: digest(after) } : file,
  )
  const configuration = {
    ...runConfiguration,
    profile: 'portable',
    nativeBackend: 'not-run',
    mutationId: 'drop-global-invariant-v1',
  }
  const versions = {
    ...original,
    harnessDigest: digest(json(files)),
    configuration: { id: 'ateam-corpus-v1:seeded:portable', digest: digest(json(configuration)) },
    input: { id: 'crosscutting-invariant:seed-v1', digest: digest(after) },
  }
  return { versions, files, configuration }
}
export function runCorpus({ output, profile = 'portable' } = {}) {
  if (!['portable', 'native'].includes(profile)) throw Error('profile must be portable or native')
  if (!output) throw Error('Pass an output directory outside the harness')
  output = resolveEvidenceOutput(HARNESS, output)
  if (profile === 'native' && process.platform !== 'darwin')
    throw Error('Native profile requires macOS; no fallback backend')
  if (existsSync(output))
    throw Error('Use a new output directory; evaluation evidence is immutable')
  const catalog = readCatalog(),
    snapshot = sourceSnapshot()
  const rubric = readFileSync(new URL('../evaluation/rubric.json', import.meta.url), 'utf8')
  const playwrightPath = process.env.ATEAM_PLAYWRIGHT_MODULE
  const playwrightPackage =
    playwrightPath && existsSync(join(dirname(playwrightPath), 'package.json'))
      ? JSON.parse(readFileSync(join(dirname(playwrightPath), 'package.json')))
      : null
  const python = spawnSync('python3', ['--version'], { encoding: 'utf8' })
  const configuration = {
    profile,
    node: process.version,
    platform: process.platform,
    osRelease: release(),
    arch: process.arch,
    pythonVersion: python.status === 0 ? python.stdout.trim() : 'unavailable',
    playwrightVersion: playwrightPackage?.version || null,
    playwrightEntryDigest:
      playwrightPath && existsSync(playwrightPath) ? digest(readFileSync(playwrightPath)) : null,
    ci: {
      runId: process.env.GITHUB_RUN_ID || null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || null,
      imageVersion: process.env.ImageVersion || null,
    },
    browserChannel: process.env.ATEAM_BROWSER_CHANNEL || 'chrome',
    playwrightModule: process.env.ATEAM_PLAYWRIGHT_MODULE || null,
    synthetic: true,
    publishing: false,
    agentLaunches: false,
    nativeBackend: profile === 'native' ? 'macos-seatbelt' : 'not-run',
  }
  mkdirSync(output, { recursive: true })
  save(join(output, 'source-manifest.json'), snapshot)
  save(join(output, 'configuration.json'), configuration)
  for (const file of snapshot.files) {
    const destination = join(output, 'source', file.path)
    mkdirSync(dirname(destination), { recursive: true })
    copyFileSync(join(HARNESS, file.path), destination)
  }
  const metadata = (scenario) => ({
    harnessRevision: snapshot.head,
    harnessDigest: snapshot.digest,
    skillBundleDigest: snapshot.skillBundleDigest,
    model: 'not-used:deterministic',
    cli: {
      name: 'node:test',
      version: process.version,
      runnerVersion: JSON.parse(readFileSync(join(HARNESS, 'runner/package.json'))).version,
    },
    configuration: { id: `${catalog.id}:${profile}`, digest: digest(json(configuration)) },
    sourceCommit: snapshot.head,
    input: {
      id: `${scenario.id}:v${scenario.version}`,
      digest: digest(json({ scenario, sourceDigest: snapshot.digest })),
    },
    rubric: { id: 'deterministic-v1', digest: digest(rubric) },
  })
  const outcomes = []
  for (const scenario of catalog.scenarios) {
    const versions = metadata(scenario)
    validateVersions(versions)
    const dir = join(output, scenario.id)
    let outcome
    const reason =
      profile !== 'native' && scenario.environment !== 'portable'
        ? `${scenario.environment} scenario requires --profile native`
        : scenario.environment === 'browser' && !configuration.playwrightModule
          ? 'Trusted ATEAM_PLAYWRIGHT_MODULE is unavailable'
          : null
    if (reason) {
      mkdirSync(dir)
      outcome = { status: 'not-run', reason }
      save(join(dir, 'record.json'), {
        schemaVersion: 1,
        scenarioId: scenario.id,
        scenarioVersion: scenario.version,
        kind: 'deterministic',
        synthetic: true,
        versions,
        expected: scenario.expected,
      })
      save(join(dir, 'outcome.json'), outcome)
      save(join(dir, 'trace.json'), { command: null, events: [], reason })
      save(join(dir, 'subjective.json'), { status: 'not-scored', assessments: [] })
    } else outcome = runCase(scenario, HARNESS, dir, versions, profile)
    outcomes.push({ scenarioId: scenario.id, ...outcome })
    console.log(`${scenario.id}: ${outcome.status}`)
  }
  // Deliberately remove the production invariant selector in a retained source copy.
  // Tests are unchanged. This is a defect probe, never a production code mutation.
  const scenario = catalog.scenarios.find((s) => s.id === 'crosscutting-invariant')
  const mutantRoot = join(output, 'source'),
    mutantPath = join(mutantRoot, 'runner/src/context.mjs')
  const before = readFileSync(mutantPath, 'utf8'),
    needle = 'index.globalInvariants.includes(s.id) ||'
  if (before.split(needle).length !== 2)
    throw Error(
      'Seed mutation no longer matches exactly once; update the versioned probe deliberately',
    )
  const after = before.replace(needle, 'false || /* seeded defect: dropped global invariant */')
  writeFileSync(mutantPath, after)
  const seed = seedVersions(metadata(scenario), snapshot.files, after, configuration)
  save(join(output, 'seeded-source-manifest.json'), {
    ...snapshot,
    digest: seed.versions.harnessDigest,
    files: seed.files,
    mutationId: 'drop-global-invariant-v1',
  })
  save(join(output, 'seeded-configuration.json'), seed.configuration)
  const failed = runCase(
    scenario,
    mutantRoot,
    join(output, 'seeded-defect'),
    seed.versions,
    'portable',
  )
  const trace = JSON.parse(readFileSync(join(output, 'seeded-defect/trace.json')))
  const detected =
    failed.status === 'failed' &&
    trace.stdout.includes('GLOBAL_INVARIANT_DROPPED: narrow task lost authorization obligation') &&
    trace.stdout.includes('ERR_ASSERTION')
  // Retain the mutant separately and restore the reproducible source snapshot bytes.
  copyFileSync(mutantPath, join(output, 'seeded-context.mjs'))
  writeFileSync(mutantPath, before)
  const corrected = outcomes.find((o) => o.scenarioId === scenario.id)?.status === 'passed'
  save(join(output, 'seed-proof.json'), {
    schemaVersion: 1,
    mutationId: 'drop-global-invariant-v1',
    path: 'runner/src/context.mjs',
    beforeDigest: digest(before),
    afterDigest: digest(after),
    expectedReason: 'GLOBAL_INVARIANT_DROPPED',
    detected,
    correctedPassed: corrected,
  })
  const drift = sourceSnapshot().digest !== snapshot.digest
  const summary = {
    schemaVersion: 1,
    corpusId: catalog.id,
    corpusVersion: catalog.version,
    profile,
    versions: {
      harnessRevision: snapshot.head,
      harnessDigest: snapshot.digest,
      skillBundleDigest: snapshot.skillBundleDigest,
    },
    deterministic: {
      passed: outcomes.filter((o) => o.status === 'passed').length,
      failed: outcomes.filter((o) => o.status === 'failed').length,
      notRun: outcomes.filter((o) => o.status === 'not-run').length,
      scenarios: outcomes,
    },
    seedProof: { detected, correctedPassed: corrected },
    sourceDrift: drift,
    agentTrials: {
      status: 'not-run',
      count: 0,
      reason: 'No model spend or model invocation authorized by this command',
    },
    humanEvaluation: {
      status: 'not-run',
      count: 0,
      reason: 'No human study or expert grading was conducted',
    },
    releaseEvidence: { eligible: false, unresolvedDependencies: catalog.unresolvedDependencies },
  }
  save(join(output, 'summary.json'), summary)
  return {
    summary,
    ok:
      !drift &&
      detected &&
      corrected &&
      !summary.deterministic.failed &&
      (profile !== 'native' || !summary.deterministic.notRun),
  }
}
