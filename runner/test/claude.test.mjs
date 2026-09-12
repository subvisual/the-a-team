import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
  readFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runClaude } from '../src/claude.mjs'
import { runIssue } from '../src/core/loop.mjs'
import { fixtureRepo, adapter, issue } from './approval-fixtures.mjs'
import { resolvePolicy } from '../src/policy.mjs'
import { DEFAULTS } from '../src/config.mjs'

test(
  'actual Claude spawn seam enforces source/scratch boundaries and strips publishing credentials',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ateam-claude-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const cwd = join(root, 'source'),
      scratchDir = join(root, 'scratch'),
      runDir = join(root, 'evidence'),
      bin = join(root, 'bin')
    for (const path of [cwd, bin]) mkdirSync(path)
    const executable = join(bin, 'claude')
    writeFileSync(
      executable,
      `#!${realpathSync(process.execPath)}
const fs=require('fs');let escaped=true;try{fs.writeFileSync(${JSON.stringify(join(root, 'outside'))},'bad')}catch{escaped=false};fs.writeFileSync(process.env.TMPDIR+'/build','ok');console.log(JSON.stringify({is_error:false,structured_output:{escaped,github:process.env.GH_TOKEN,canary:process.env.UNRELATED_CANARY},session_id:'synthetic',total_cost_usd:0}));`,
      { mode: 0o755 },
    )
    const oldPath = process.env.PATH
    process.env.PATH = `${bin}:${oldPath}`
    t.after(() => {
      process.env.PATH = oldPath
    })
    const policy = {
      readPaths: ['.'],
      writePaths: ['.'],
      authorization: { protectedPaths: [] },
      sandbox: { backend: 'macos-seatbelt', claudeExecutable: executable },
    }
    const result = await runClaude({
      cwd,
      scratchDir,
      runDir,
      policy,
      prompt: 'Synthetic boundary probe',
      role: 'executor',
      model: 'fixture',
      tools: [],
      modelEnv: { GH_TOKEN: 'fake', UNRELATED_CANARY: 'synthetic' },
    })
    assert.equal(result.ok, true, result.errors?.join('\n'))
    assert.deepEqual(result.structured, { escaped: false })
    assert.equal(existsSync(join(root, 'outside')), false)
    assert.ok(existsSync(join(runDir, 'executor.result.json')))
    writeFileSync(
      executable,
      `#!${realpathSync(process.execPath)}\nconsole.log(JSON.stringify({is_error:false,structured_output:{status:'done'}}));`,
      { mode: 0o755 },
    )
    const unknown = await runClaude({
      cwd,
      scratchDir,
      policy,
      prompt: 'Synthetic missing accounting',
      role: 'executor',
      model: 'fixture',
      tools: [],
      modelEnv: {},
      timeoutMs: 1000,
    })
    assert.equal(unknown.costUsd, undefined)
    assert.equal(unknown.ok, true)
    // The model-process result can complete; the aggregate budget gate must
    // refuse continuation when this explicit absence reaches the supervisor.
  },
)

test(
  'native full issue loop commits privately, reviews immutable source and runs supervisor checks',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const root = mkdtempSync(join(tmpdir(), 'ateam-native-loop-'))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const credentialKeys = ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_OAUTH_TOKEN']
    const credentials = Object.fromEntries(credentialKeys.map((k) => [k, process.env[k]]))
    for (const key of credentialKeys) delete process.env[key]
    t.after(() => {
      for (const key of credentialKeys)
        if (credentials[key] !== undefined) process.env[key] = credentials[key]
    })
    const oldHome = process.env.ATEAM_RUNNER_HOME
    process.env.ATEAM_RUNNER_HOME = join(root, 'runner-home')
    t.after(() => {
      if (oldHome === undefined) delete process.env.ATEAM_RUNNER_HOME
      else process.env.ATEAM_RUNNER_HOME = oldHome
    })
    const repoPath = fixtureRepo(root),
      executable = join(root, 'synthetic-claude')
    writeFileSync(
      executable,
      `#!${realpathSync(process.execPath)}
const fs=require('fs'),cp=require('child_process');const executor=process.argv[process.argv.indexOf('--tools')+1].split(',').includes('Edit');
if(executor){fs.writeFileSync('value.txt','good\\n');for(const args of [['add','value.txt'],['commit','-m','fix']]){const r=cp.spawnSync('/usr/bin/git',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr)}}
const check=cp.spawnSync('/bin/sh',['-c','test "$(cat value.txt)" = good'],{encoding:'utf8'});
const structured=executor?{status:'done',summary:'fixed',blocked_reason:'',tests_command:'test value',tests_ran:true,tests_passed:check.status===0}:{verdict:'approve',unmet_ac:[],notes:'committed source checked',tests_ran:true,tests_passed:check.status===0,test_command:'test value',test_output:'green'};
console.log(JSON.stringify({is_error:false,structured_output:structured,session_id:executor?'synthetic-executor':'synthetic-reviewer',total_cost_usd:0}));`,
      { mode: 0o755 },
    )
    const policy = await resolvePolicy({
      repoPath,
      cfg: {
        verificationCommands: ['test "$(cat value.txt)" = good'],
        sandbox: { backend: 'macos-seatbelt', claudeExecutable: executable },
      },
    })
    const target = adapter(repoPath)
    const result = await runIssue({
      adapter: target,
      issue,
      cfg: { ...DEFAULTS, maxCycles: 1, policy },
    })
    assert.equal(result.outcome, 'approved', result.reason)
    assert.equal(target.calls.filter((c) => c[0] === 'approved').length, 1)
    const record = JSON.parse(readFileSync(result.ctx.approvalPath, 'utf8'))
    assert.equal(record.headSha, result.ctx.head)
    assert.equal(record.verification.commands[0].exitCode, 0)
    assert.ok(record.verification.commands[0].outputDigest)
    assert.equal(readFileSync(join(repoPath, 'value.txt'), 'utf8'), 'bad\n')
  },
)
