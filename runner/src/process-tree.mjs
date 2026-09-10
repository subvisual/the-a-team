import { execFileSync } from 'node:child_process'

// Retain process identities, not just process-group IDs: subprocesses may create
// a new session. Never signal a reused PID or a process with unrelated ancestry.
function inventory() {
  const output = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,stat=,lstart='], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const rows = new Map()
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.+)$/)
    if (match)
      rows.set(Number(match[1]), {
        pid: Number(match[1]),
        parent: Number(match[2]),
        group: Number(match[3]),
        state: match[4],
        identity: match[5],
      })
  }
  return rows
}
export function assertProcessInventory() {
  if (!inventory().has(process.pid)) throw new Error('process-tree inventory is unavailable')
}
export function processTree(rootPid) {
  const tracked = new Map()
  let failure = null
  const collect = () => {
    const rows = inventory()
    if (!tracked.size && rows.has(rootPid)) tracked.set(rootPid, rows.get(rootPid).identity)
    let changed = true
    while (changed) {
      changed = false
      for (const row of rows.values()) {
        if (tracked.has(row.pid)) continue
        const parent = rows.get(row.parent)
        if (parent && tracked.get(parent.pid) === parent.identity) {
          tracked.set(row.pid, row.identity)
          changed = true
        }
      }
    }
    return rows
  }
  const signal = (rows, kind) => {
    for (const [pid, identity] of [...tracked].reverse()) {
      if (rows.get(pid)?.identity !== identity) continue
      try {
        process.kill(pid, kind)
      } catch (error) {
        if (error.code !== 'ESRCH') throw error
      }
    }
  }
  const tick = () => {
    try {
      collect()
    } catch (error) {
      failure = error
    }
  }
  tick()
  const timer = setInterval(tick, 50)
  timer.unref()
  return {
    terminate(kind) {
      // Freeze the known tree before discovering new children, so a parent
      // cannot orphan an undiscovered child while shutdown enumerates it.
      let previous = -1,
        rows
      for (let pass = 0; pass < 64 && previous !== tracked.size; pass++) {
        previous = tracked.size
        rows = collect()
        signal(rows, 'SIGSTOP')
      }
      rows = collect()
      signal(rows, kind)
      if (kind !== 'SIGKILL') signal(rows, 'SIGCONT')
    },
    groupAlive(group) {
      return [...inventory().values()].some(
        (row) => row.group === group && !row.state.startsWith('Z'),
      )
    },
    alive() {
      const rows = collect()
      return [...tracked].some(
        ([pid, identity]) =>
          rows.get(pid)?.identity === identity && !rows.get(pid).state.startsWith('Z'),
      )
    },
    close() {
      clearInterval(timer)
    },
    get failure() {
      return failure
    },
  }
}
