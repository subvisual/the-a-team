import { createHash } from 'node:crypto'
import { writeCurrentContext } from './helpers/current-context.mjs'
import { execFileSync } from 'node:child_process'
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
const fs=require('fs');let escaped=true;try{fs.writeFileSync(${JSON.stringify(join(root, 'outside'))},'bad')}catch{escaped=false};fs.writeFileSync(process.env.TMPDIR+'/build','ok');console.log(JSON.stringify({is_error:false,structured_output:{escaped,github:process.env.GH_TOKEN,canary:process.env.UNRELATED_CANARY},session_id:'synthetic',total_cost_usd:0,usage:{input_tokens:19}}));`,
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
    assert.deepEqual(result.usage, { input_tokens: 19 })
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
if(executor){
fs.writeFileSync('value.txt','good\\n');
const crypto=require('crypto'),hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const tool=process.argv.at(-1).match(/^Context tools: (.+)$/m)[1],revision=hash(fs.readFileSync('value.txt'));
fs.writeFileSync('context-inspection.json',JSON.stringify({method:'verification',summary:'Synthetic value check and source inspection',sourceRevisions:{value:revision}}));
fs.writeFileSync('context-update.json',JSON.stringify({expectedIndexRevision:hash(fs.readFileSync('docs/product/context.md')),validation:{id:'synthetic-inspection',actor:'synthetic-executor',evidence:'context-inspection.json'},sources:[{id:'value',revision}],facts:[]}));
const refreshed=cp.spawnSync(process.execPath,[tool,'revalidate','--root',process.cwd(),'--policy',process.argv.at(-1).match(/^Context policy: (.+)$/m)[1],'--update','context-update.json'],{encoding:'utf8'});if(refreshed.status!==0)throw new Error(refreshed.stdout+refreshed.stderr);
fs.unlinkSync('context-update.json');
for(const args of [['add','value.txt','docs/product/context.md','context-inspection.json'],['commit','-m','fix']]){const r=cp.spawnSync('/usr/bin/git',args,{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr)}}
const check=cp.spawnSync('/bin/sh',['-c','test "$(cat value.txt)" = good'],{encoding:'utf8'});
const authority=executor?null:JSON.parse(process.argv.at(-1).match(/^Supervisor-pinned test adequacy authority: (.+)$/m)[1]),source=authority?.sources[0];
const structured=executor?{status:'done',summary:'fixed',blocked_reason:'',tests_command:'test value',tests_ran:true,tests_passed:check.status===0}:{verdict:'approve',unmet_ac:[],notes:'committed source checked',tests_ran:true,tests_passed:check.status===0,test_command:'test value',test_output:'green',test_adequacy:[{criterion:'value is good',expected_values:{status:'independent',evidence:'literal good value'},public_behavior:{status:'exercised',evidence:'repository value check'},substituted_boundaries:{status:'none',evidence:'no substituted boundary'},requirement_source:{id:source.id,revision:source.revision},baseline_expectations:{status:'preserved',requirement_version:source.requirementVersions[0],authorization:''},judgment:'adequate',why:'the command fails unless the accepted value is present'}]};
console.log(JSON.stringify({is_error:false,structured_output:structured,session_id:executor?'synthetic-executor':'synthetic-reviewer',total_cost_usd:0}));`,
      { mode: 0o755 },
    )
    writeCurrentContext(repoPath, ['test "$(cat value.txt)" = good'])
    const contextFile = join(repoPath, 'docs/product/context.md')
    const current = readFileSync(contextFile, 'utf8')
    const index = JSON.parse(current.split('\n').slice(1, -2).join('\n'))
    index.sources = [
      {
        id: 'value',
        kind: 'code',
        path: 'value.txt',
        global: true,
        revision: createHash('sha256')
          .update(readFileSync(join(repoPath, 'value.txt')))
          .digest('hex'),
      },
    ]
    writeFileSync(contextFile, '```ateam-context\n' + JSON.stringify(index) + '\n```\n')
    execFileSync('git', ['add', 'docs/product/context.md'], { cwd: repoPath })
    execFileSync('git', ['commit', '-m', 'Record synthetic current authority'], { cwd: repoPath })
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
    const diagnostics = []
    if (result.outcome !== 'approved' && result.ctx?.runDir) {
      for (const role of ['executor', 'reviewer']) {
        const stderrPath = join(result.ctx.runDir, `${role}.stderr.txt`)
        if (existsSync(stderrPath))
          diagnostics.push(`${role} stderr:\n${readFileSync(stderrPath, 'utf8').slice(-16_384)}`)
      }
    }
    assert.equal(result.outcome, 'approved', [result.reason, ...diagnostics].filter(Boolean).join('\n'))
    assert.equal(target.calls.filter((c) => c[0] === 'approved').length, 1)
    const record = JSON.parse(readFileSync(result.ctx.approvalPath, 'utf8'))
    assert.equal(record.headSha, result.ctx.head)
    assert.equal(record.verification.commands[0].exitCode, 0)
    assert.ok(record.verification.commands[0].outputDigest)
    assert.equal(readFileSync(join(repoPath, 'value.txt'), 'utf8'), 'bad\n')
  },
)
