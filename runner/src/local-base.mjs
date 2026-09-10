// Adapter-side local base resolution. GitHub discovery and remote refresh are
// deliberately absent; model-service permissions belong to the execution policy.
import { defaultBranchLocal, git } from './git.mjs'
import { readProjectConfig, resolvePolicy } from './policy.mjs'

export async function resolveLocalBase({
  repoPath,
  base,
  cfg = {},
  authorization = {},
  continuationBase,
}) {
  const selected =
    continuationBase ||
    base ||
    readProjectConfig(repoPath).baseBranch ||
    cfg.base ||
    (await defaultBranchLocal(repoPath))
  if (
    typeof selected !== 'string' ||
    !selected ||
    selected.startsWith('-') ||
    /[\s\x00-\x1f]/.test(selected)
  )
    throw new Error('local base must be an explicit Git branch or commit SHA')
  const branchRef = selected.startsWith('refs/heads/') ? selected : `refs/heads/${selected}`
  const verify = (ref) =>
    git(repoPath, ['rev-parse', '--verify', '--end-of-options', `${ref}^{commit}`], {
      check: false,
    })
  let result = await verify(branchRef)
  let baseRef = branchRef
  if (result.code !== 0 && (/^[a-f0-9]{4,64}$/i.test(selected) || selected === 'HEAD')) {
    result = await verify(selected)
    baseRef = result.stdout.trim()
  }
  if (result.code !== 0 || !/^[a-f0-9]{40,64}$/.test(result.stdout.trim()))
    throw Object.assign(
      new Error(
        `local base '${selected}' is not available in ${repoPath}; prepare that branch or commit locally, then retry with --base`,
      ),
      { code: 'missing-local-base' },
    )
  return resolvePolicy({ repoPath, base: selected, baseRef, cfg, authorization, continuationBase })
}
