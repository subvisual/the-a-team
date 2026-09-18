# Opt-in agent workflow trial

`/feature "<prompt>" --repo <target> --orchestration-mode agent` selects the
agent workflow. Omitting the flag, or selecting `harness`, uses the existing
skill-based workflow. Shared phase skills, craft, and reference files keep their
existing behavior. Agents compose that same craft under the adapter below.

This is an interactive Claude Code trial coordinated by the feature main thread.
`feature-cli.mjs` records and validates state; it does not launch role agents.
Project-agent availability must be checked in the host before initialization.
The host must expose the agents from this harness checkout and their Skill tool;
do not assume a separate target repo automatically discovers harness agents.
If a required role cannot be invoked, stop with the missing capability. Never
silently fall back to the harness arm or copy agent files into the target.

## Dispatch map

| Phase | Harness arm | Agent arm |
| --- | --- | --- |
| Discovery | Main-thread `ateam-discovery` | Fresh `ateam-pm` composing discovery craft |
| Definition | Main-thread `ateam-definition` | Fresh `ateam-pm` composing definition craft |
| Definition review | Existing human gate | Fresh `ateam-definition-reviewer`, then existing human gate |
| Design | Main-thread `ateam-design` | Fresh `ateam-designer` composing design craft |
| Design review | Existing human gate | Fresh `ateam-design-reviewer`, then existing human gate |
| Spec | Main-thread `ateam-spec` | Fresh `ateam-designer` composing spec craft |
| Issues | Main-thread `ticket-writer` | Fresh `ateam-pm` composing `ticket-writer` |
| Dev | Runner executor and independent reviewer | Same isolated Builder/Verifier runner sessions |
| PR artifacts | Main-thread plan refresh and report | Fresh `ateam-delivery` composing plan/report craft |
| Assembly, publication, final gate | Supervisor and human | Supervisor and human |

The dev lane already uses agent sessions in both arms. Keep its launch policy,
output schemas, revision-bound approval and verification unchanged. The project
Builder/Verifier definitions describe these seats; they are not alternate runner
launchers. Lead and adjudication remain outside this trial. Cold gate review is
part of the agent workflow being evaluated; record its cost separately.

## Agent-only interaction adapter

The supervisor explicitly includes this adapter in every trial dispatch. It
overrides interaction and dispatch instructions in composed skills and their
references only for that agent invocation; craft and quality bars still apply.

1. Before dispatch, run the existing `start` and context checks. Pass absolute
   harness/target/feature/product/intake paths, phase, manifest revision, allowed
   output paths, and SHA-256 digests of each consumed file. Enumerate directory
   inputs as files. Include staged human answers and returned specialist results.
   Include a checkpoint naming the next movement and completed movements.
2. Agents never call manifest commands or mutate Git. Return proposed completion,
   configuration or failure to the supervisor. The supervisor alone invokes the
   existing CLI and commits. A skill's `complete` example is a proposed operation
   in this arm. Definition outputs include `acceptance.json`, its required history,
   `prd.md`, `briefs/`, and epics under the existing gate contract.
3. Human-channel detection is explicit: every role dispatch has
   `humanChannel: supervisor`, `interactiveTurnBudget: 0`. Whenever a skill or
   reference says ask, confirm, grill, read back or wait, return the question or
   exact proposed artifact with `status: escalated` immediately. The supervisor
   presents it to the human and stops until answered; it never manufactures an
   answer, read-back approval, run brief or gate-policy authorization.
4. Durable artifacts still require human review before canonical writes. Return
   drafts in the handoff, preserving them in supervisor-owned trial scratch
   outside canonical artifact trees. After review, dispatch a fresh agent with
   those exact draft digests and human answers to apply the authorized changes.
   Escalation questions may use `context.md`'s `## Awaiting answers` exception.
   Definition/design nonblocking uncertainties remain visible flags; Must-scope
   uncertainty blocks exactly as in harness mode. No reference may restart a grill
   inside a role session, including JTBD interviews and board build checklists.
5. No nested spawning, including shell-launched model sessions. Return specialist
   requests; the supervisor runs each sibling and supplies the result. A request
   is an `interrupted` handoff, never successful phase completion.
6. Before applying a returned draft, check the recorded input digests against the
   canonical files. Reject stale input and redispatch with current authority.
   For artifacts read and then written in place, compare against the supervisor's
   retained pre-dispatch snapshot, and separately hash returned output bytes.
   Validate actual output paths and existing artifact/obligation gates. A hash
   reported by an agent is not validation. The adapter is a host procedure, not a
   new OS sandbox or executable enforcement of all fields in RUNTIME-CONTRACT.md.

## Handoffs and bounded specialists

Every return uses the runtime contract envelope with `seat`, `feature`, `phase`,
`consumed`, `produced`, `deviations`, `openObligations`, `evidence`,
`requestedDispatches`, `status`, plus a checkpoint and `questions` array.
Questions contain `id`, `question`, `recommendation`, `blocks`, and the exact
draft digest when asking for review. Status is `complete`, `escalated`, `blocked`,
or `interrupted`. Missing input or malformed output is `blocked`; absent human
authority is `escalated`. Neither increments phase failure attempts. A crash
retains its checkpoint and is handled by the existing failure policy.

Use stable request IDs across redispatches. Retain issued IDs, results and budget
usage in supervisor trial scratch; reusing an ID reuses the result only if its
input digests match. This is attempt evidence, never a new product-decision ledger.

| Kind / skill | Typed input | Typed return | Budget |
| --- | --- | --- | --- |
| `specialist` / `dev-research` | `dev-review-v1`: drafted jobs with digests, target, context, declared defaults, optional decision candidates | Findings with job ID, cost, confidence, evidence; confidence deltas; questions; candidate removal/coarsening observations; degradation reason | Once, plus one re-fire only after material job changes |
| `digest` / no reserved skill | `digest-v1`: staged document path/digest and glossary | Line-cited claims, terms, conflicts with both citations, full-read coverage or explicit incomplete coverage | Once per document digest; failed/incomplete result stops for operator action |

Do not dispatch a reserved phase name as a specialist. Route all dev findings
through discovery's existing ledger and three-way answer rule. Missing
`dev-research` remains optional by absence: record the gap in `research-plan.md`;
missing candidate review is recorded separately. Incomplete digest coverage cannot
be called full. Neither worker writes canonical product artifacts directly.

## Completion and review

For `complete`, the supervisor verifies output digests and scope, commits the
reviewed artifacts, and calls the same phase completion CLI with actual flags.
After definition/design completion, dispatch the corresponding cold reviewer with
only current artifact paths, digests, and criteria; never author transcripts.
Surface its findings at the existing human gate. Unresolved findings affecting
Must scope, missing evidence or failed self-checks require revision and recompletion
with blocking flags; advisory preferences cannot approve or automatically veto.
If provisional gate policy would hide such a finding, stop for human disposition.

For issues, the PM writes decomposition only. The supervisor performs any already
authorized GitHub projection and epic milestone back-references. For PR, the
supervisor assembles reviewed branches first, then dispatches delivery craft and
performs existing combined checks and final human review. Roles gain no publishing
authority from participating in the trial.

## Matched run procedure

Use separate disposable target checkouts/features from the same target revision.
Pin the same harness commit, prompt, evidence inputs, model, budget, gate policy,
verification commands and human-answer corpus. Initialize one with
`orchestration_mode: harness`, one with `orchestration_mode: agent`. Do not switch
an existing feature's mode or reuse one arm's generated artifacts as the other's
starting inputs. Schema-v2 runs migrate to harness without resetting their history.

Use `runner/PILOT-PROTOCOL.md` and its existing scorecard for outcomes. Record the
arm in the evaluation configuration alongside the manifest revision. Count all
role/specialist/reviewer attempts, escalations, human minutes, elapsed time, cost,
artifact/gate defects and rework. Record missing measurements as unknown. Keep
session persistence fresh for this comparison; a resumed-session arm is separate.

No live trial is implied by a passing test suite. A live run requires a concrete
target, feature prompt, available host agents, provider setup and run budget.
