// Explicit diagnostic for the open #37 lifecycle gap, excluded from npm test.
// This uses only synthetic local processes and always cleans up its own leaf.
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { run } from '../../src/sh.mjs'

const root = mkdtempSync(join(tmpdir(), 'ateam-orphan-probe-'))
const pidFile = join(root, 'leaf.pid')
const leaf = `process.on('SIGTERM',()=>{});setInterval(()=>{},1000)`
const middle = `const child=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{detached:true,stdio:'ignore'});require('fs').writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref()`
const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(middle)}],{stdio:'ignore'});setInterval(()=>{},1000)`
let pid
try {
  const result = await run(process.execPath, ['-e', parent], {check:false,timeoutMs:400,killGraceMs:100})
  pid = existsSync(pidFile) ? Number(readFileSync(pidFile,'utf8')) : null
  await new Promise(resolve=>setTimeout(resolve,150))
  let escaped=false
  if(pid) try {process.kill(pid,0);escaped=true} catch(error) {if(error.code!=='ESRCH')throw error}
  console.log(JSON.stringify({issue:37,timedOut:result.timedOut,exitCode:result.code,escaped,status:escaped?'lifecycle-gap-reproduced':'not-reproduced-in-this-run'}))
  process.exitCode=escaped?1:0
} finally {
  if(!pid && existsSync(pidFile))pid=Number(readFileSync(pidFile,'utf8'))
  if(pid) try {process.kill(-pid,'SIGKILL')} catch(error) {if(error.code!=='ESRCH' && error.code!=='EPERM')throw error}
  rmSync(root,{recursive:true,force:true})
}
