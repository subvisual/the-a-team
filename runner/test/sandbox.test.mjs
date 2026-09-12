import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import net from 'node:net'
import { git } from './approval-fixtures.mjs'

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'ateam-boundary-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'source'),
    scratchDir = join(root, 'scratch')
  mkdirSync(cwd)
  mkdirSync(scratchDir)
  mkdirSync(join(cwd, '.github/workflows'), { recursive: true })
  writeFileSync(join(cwd, '.github/workflows/ci.yml'), 'original')
  git(cwd, ['init', '--initial-branch=main'])
  git(cwd, ['add', '.github/workflows/ci.yml'])
  git(cwd, ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '-m', 'fixture'])
  writeFileSync(join(cwd, '.env'), 'synthetic-local-credential')
  writeFileSync(join(root, 'outside'), 'private synthetic fixture')
  symlinkSync(join(root, 'outside'), join(cwd, 'escape'))
  return {
    root,
    cwd,
    scratchDir,
    policy: {
      writePaths: ['.'],
      authorization: { protectedPaths: [] },
      sandbox: { backend: 'macos-seatbelt', toolchainPaths: [] },
    },
  }
}

test('environment is replaced and unavailable backends fail closed', async (t) => {
  const { sandboxEnvironment, runSandboxed } = await import('../src/sandbox.mjs')
  const f = fixture(t)
  const env = sandboxEnvironment(
    f.scratchDir,
    {
      PATH: '/bad',
      GH_TOKEN: 'fake',
      CANARY: 'fake',
      NODE_OPTIONS: '--require /bad',
      ANTHROPIC_API_KEY: 'model',
    },
    false,
  )
  for (const key of ['GH_TOKEN', 'CANARY', 'NODE_OPTIONS', 'ANTHROPIC_API_KEY'])
    assert.equal(env[key], undefined)
  await assert.rejects(
    runSandboxed('/usr/bin/true', [], {
      ...f,
      policy: { ...f.policy, sandbox: { backend: 'unavailable' } },
    }),
    /unavailable|unsupported/,
  )
})

// Run explicitly with ATEAM_NATIVE_SANDBOX_TEST=1 on the documented backend.
// Default suite still checks fail-closed behavior; it never falls back to no sandbox.
test(
  'native executor boundary denies nested escapes, protected writes and inherited secrets',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const { runSandboxed } = await import('../src/sandbox.mjs')
    const f = fixture(t)
    const program = `const fs=require('fs'),cp=require('child_process');
const denied=p=>{try{fs.readFileSync(p);return false}catch{return true}};
const write=p=>{try{fs.writeFileSync(p,'changed');return true}catch{return false}};
const child=cp.spawnSync('/bin/sh',['-c','echo nope > "$1"','sh',${JSON.stringify(join(f.root, 'outside'))}]);
console.log(JSON.stringify({outside:denied(${JSON.stringify(join(f.root, 'outside'))}),symlink:denied('escape'),protected:write('.github/workflows/ci.yml'),commonDir:write('.git/commondir'),ordinary:write('result.txt'),scratch:write(process.env.TMPDIR+'/build.txt'),childDenied:child.status!==0,canary:process.env.ATEAM_FAKE_SECRET,github:process.env.GH_TOKEN}));`
    const r = await runSandboxed(process.execPath, ['-e', program], {
      ...f,
      role: 'executor',
      env: { ATEAM_FAKE_SECRET: 'synthetic', GH_TOKEN: 'fake' },
    })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout), {
      outside: true,
      symlink: true,
      protected: false,
      commonDir: false,
      ordinary: true,
      scratch: true,
      childDenied: true,
    })
    assert.equal(readFileSync(join(f.root, 'outside'), 'utf8'), 'private synthetic fixture')
  },
)

test(
  'native reviewer source is read-only while build scratch is writable',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const { runSandboxed } = await import('../src/sandbox.mjs')
    const f = fixture(t)
    const r = await runSandboxed(
      process.execPath,
      [
        '-e',
        `const fs=require('fs');let denied=false;try{fs.writeFileSync('change.txt','x')}catch{denied=true};fs.writeFileSync(process.env.TMPDIR+'/build','ok');console.log(denied)`,
      ],
      { ...f, role: 'reviewer' },
    )
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout.trim(), 'true')
  },
)

test(
  'native policy resists parent renames and grants only one explicitly authorized protected file',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const { runSandboxed } = await import('../src/sandbox.mjs')
    const f = fixture(t)
    writeFileSync(join(f.cwd, 'Jenkinsfile'), 'original')
    f.policy.authorization = {
      id: 'synthetic-explicit-maintenance',
      protectedPaths: ['.github/workflows/ci.yml', 'Jenkinsfile'],
    }
    const program = `const fs=require('fs');const attempt=fn=>{try{fn();return true}catch{return false}};
console.log(JSON.stringify({allowed:attempt(()=>fs.writeFileSync('.github/workflows/ci.yml','authorized')),singleFile:attempt(()=>fs.writeFileSync('Jenkinsfile','authorized')),sibling:attempt(()=>fs.writeFileSync('.github/workflows/other.yml','bad')),parentRename:attempt(()=>fs.renameSync('.github','moved')),credentialRename:attempt(()=>fs.renameSync('.env','leaked'))}));`
    const r = await runSandboxed(process.execPath, ['-e', program], { ...f, role: 'executor' })
    assert.equal(r.code, 0, r.stderr)
    assert.deepEqual(JSON.parse(r.stdout), {
      allowed: true,
      singleFile: true,
      sibling: false,
      parentRename: false,
      credentialRename: false,
    })
  },
)

test(
  'native child reaches only its declared supervisor proxy endpoint',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const { runSandboxed } = await import('../src/sandbox.mjs')
    const f = fixture(t)
    const endpoint = net.createServer((s) => s.end('hello'))
    await new Promise((r) => endpoint.listen(0, '127.0.0.1', r))
    t.after(() => endpoint.close())
    const port = endpoint.address().port
    const r = await runSandboxed(
      process.execPath,
      [
        '-e',
        `const net=require('net');const s=net.connect(${port},'127.0.0.1');s.on('connect',()=>{console.log('escaped');s.destroy()});s.on('error',()=>console.log('denied'));setTimeout(()=>s.destroy(),500).unref()`,
      ],
      { ...f, role: 'reviewer' },
    )
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout.trim(), 'denied')
    f.policy.sandbox.modelAuthorities = [`127.0.0.1:${port}`]
    const proxied = await runSandboxed(
      process.execPath,
      [
        '-e',
        `const http=require('http');const p=new URL(process.env.HTTPS_PROXY);const req=http.request({host:p.hostname,port:p.port,method:'CONNECT',path:'127.0.0.1:${port}'});req.on('connect',(res,s,head)=>{console.log(res.statusCode);s.destroy()});req.on('error',e=>{console.error(e);process.exitCode=1});req.end()`,
      ],
      { ...f, role: 'executor', model: true },
    )
    assert.equal(proxied.code, 0, proxied.stderr)
    assert.equal(proxied.stdout.trim(), '200')
  },
)

test(
  'exact CI authorization can create missing parents outside the ordinary write roots',
  { skip: process.env.ATEAM_NATIVE_SANDBOX_TEST !== '1' },
  async (t) => {
    const { runSandboxed } = await import('../src/sandbox.mjs')
    const f = fixture(t)
    rmSync(join(f.cwd, '.github'), { recursive: true })
    f.policy.writePaths = ['src']
    f.policy.authorization = {
      id: 'explicit-new-ci',
      protectedPaths: ['.github/workflows/new.yml'],
    }
    const program = `const fs=require('fs');fs.mkdirSync('.github/workflows',{recursive:true});fs.writeFileSync('.github/workflows/new.yml','authorized');let denied=false;try{fs.writeFileSync('.github/workflows/other.yml','bad')}catch{denied=true};console.log(denied)`
    const r = await runSandboxed(process.execPath, ['-e', program], { ...f, role: 'executor' })
    assert.equal(r.code, 0, r.stderr)
    assert.equal(r.stdout.trim(), 'true')
  },
)
