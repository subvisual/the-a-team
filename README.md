# The A-Team

A local product-development harness that carries explicit evidence and human
decisions from discovery through definition, design, specification and a reviewed
implementation branch. It operates against a separate, authorized target project.
It retains failed attempts and keeps verification, human acceptance, integration,
release and product validation distinct.

Start with the [synthetic onboarding walkthrough](runner/ONBOARDING.md). It creates
a disposable sample, reaches a read-only dry-run plan, and demonstrates restart
using the same event identity without a model call or GitHub publication.

Prerequisites: Node 20+, Git 2+, Python 3 for artifact validation, and native macOS
Seatbelt for execution. Claude Code is required for model execution; `gh` is
needed only for GitHub mode. Browser checks additionally use an operator-installed
Playwright module and Chrome, configured outside target source. This repository's
runner has no npm dependencies. Provider authentication and spend require the
operator's explicit setup; doctor never installs or authenticates anything.

Run `node runner/bin/ateam-runner.mjs doctor --path /absolute/target --json` to
inspect local setup. Whole-process-tree containment is an accepted limitation documented in #37;
native availability checks do not establish that guarantee.

The skill bundle lives in `.claude/skills/`; [SKILLS.md](SKILLS.md) lists each
entry. Point the chosen agent's skill discovery at the reviewed checkout using
that agent's supported configuration, then confirm it can read the `feature`
entry and its relative resources. Keep the complete pinned bundle together;
copying one SKILL.md without its references is insufficient. Skill installation
is an explicit operator step, never a diagnostic side effect. Record the full
harness commit and location in the target's A-Team Config.

See [RUNNER.md](RUNNER.md) for commands, [execution boundaries](runner/EXECUTION.md)
for configuration and native isolation, [CONTRACT.md](CONTRACT.md) for product
and authority rules, and [combined verification](runner/COMBINED-VERIFICATION.md)
for the evidence required before delivery. No command or skill grants client
project authority, merges a PR by implication, or substitutes automated tests
for a target-user study.
