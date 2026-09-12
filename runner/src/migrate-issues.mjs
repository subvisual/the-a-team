import fs from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { migrateIssuesText } from './local-issues.mjs'

const unchanged = (left, right) =>
  ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs', 'mode'].every((key) => left[key] === right[key])

const changedSource = () =>
  Object.assign(
    new Error('issues file changed during migration; inspect the current file and retry'),
    { code: 'issues-file-changed', exitCode: 2 },
  )

export function migrateIssuesFile(path, { dryRun = false } = {}) {
  const before = fs.lstatSync(path, { bigint: true })
  if (!before.isFile()) throw new Error('migration requires a regular issues file')
  const source = fs.readFileSync(path, 'utf8')
  if (!unchanged(before, fs.lstatSync(path, { bigint: true }))) throw changedSource()
  const migration = migrateIssuesText(source)
  if (dryRun || !migration.changed) return migration

  // Create beside the original so rename is atomic on the same filesystem.
  // The original is never opened for writing. Only our exclusive temporary
  // file may be removed when a write, flush or replacement fails.
  const temporary = join(dirname(path), `.${basename(path)}.migrate-${randomUUID()}.tmp`)
  let fd = null
  let created = false
  try {
    fd = fs.openSync(temporary, 'wx', 0o600)
    created = true
    fs.writeFileSync(fd, migration.text, 'utf8')
    fs.fchmodSync(fd, Number(before.mode & 0o7777n))
    fs.fsyncSync(fd)
    fs.closeSync(fd)
    fd = null

    // Optimistic concurrency check immediately before replacement: preserve
    // any source edit or replacement that occurred while preparing the output.
    if (
      !unchanged(before, fs.lstatSync(path, { bigint: true })) ||
      fs.readFileSync(path, 'utf8') !== source ||
      !unchanged(before, fs.lstatSync(path, { bigint: true }))
    )
      throw changedSource()
    fs.renameSync(temporary, path)
    created = false
    return migration
  } finally {
    try {
      if (fd !== null) fs.closeSync(fd)
    } finally {
      if (created) fs.unlinkSync(temporary)
    }
  }
}
