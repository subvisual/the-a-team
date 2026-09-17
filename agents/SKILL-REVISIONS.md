# Skill integration under agent seats

[← Packet index](README.md) · [Audit](ISSUE.md) · [Authority map](AUTHORITY-MAP.md) · [Runtime contract](RUNTIME-CONTRACT.md) · [Open questions](OPEN-QUESTIONS.md)

## Decision

Skills remain the unit of reusable craft. Agent manifests declare composition. Do not add a single
`seat:` owner to every `SKILL.md`: the relationship is many-to-many, and ownership, invocation,
consumption and review are different relationships.

The prepared PM and Designer definitions use the host-supported `skills:` field to preload their
phase conductors and retain the `Skill` tool for conductor-directed craft loading. Review the exact
manifests at [`ateam-pm`](../.claude/agents/ateam-pm.md) and
[`ateam-designer`](../.claude/agents/ateam-designer.md). Other seats preload no craft skill.

## Composition map

| Seat | Conducts | May compose or consume |
|---|---|---|
| PM | [`ateam-discovery`](../.claude/skills/ateam-discovery/SKILL.md), [`ateam-definition`](../.claude/skills/ateam-definition/SKILL.md) | [`jobs-to-be-done`](../.claude/skills/jobs-to-be-done/SKILL.md), [`project-context`](../.claude/skills/project-context/SKILL.md), [`research-synthesis`](../.claude/skills/research-synthesis/SKILL.md), [`product-brainstorming`](../.claude/skills/product-brainstorming/SKILL.md), [`discovery-plan`](../.claude/skills/discovery-plan/SKILL.md), [`prd-writer`](../.claude/skills/prd-writer/SKILL.md), [`epics`](../.claude/skills/epics/SKILL.md), [`wireflow`](../.claude/skills/wireflow/SKILL.md), [`page-brief`](../.claude/skills/page-brief/SKILL.md), [`dev-research`](../.claude/skills/dev-research/SKILL.md) result |
| Designer | [`ateam-design`](../.claude/skills/ateam-design/SKILL.md), [`ateam-spec`](../.claude/skills/ateam-spec/SKILL.md) | [`design-system`](../.claude/skills/design-system/SKILL.md), [`build-lofi`](../.claude/skills/build-lofi/SKILL.md), [`wireflow`](../.claude/skills/wireflow/SKILL.md), [`page-brief`](../.claude/skills/page-brief/SKILL.md), existing target design system |
| Builder | runner executor contract | `issues.md`, `spec.md`, accepted context and project-native implementation skills |
| Verifier | runner reviewer contract | acceptance criteria, adequacy authority, rendered evidence, repository checks |
| Lead | no craft conductor in the first pilot | status/context selection, bounded seat results, authority map |

“Compose” does not imply write ownership. The seat manifest separately declares exact read/write
scope, and the canonical artifact contract remains authoritative.

## Invocation modes

The repo already has skills with pipeline and standalone paths. That is not inherently a contract
violation when each invocation path has one explicit interaction mode and the caller is known.

| Path | Caller | Interaction rule |
|---|---|---|
| Standalone | Human | Skill's documented grill, draft/review or autonomous behavior |
| Conducted | Seat/conductor | Noninteractive derivation or typed escalation exactly as documented |
| Entrypoint | Human invokes `feature` | State machine controls subsequent dispatch |

Do not invent `invocation:` frontmatter: it is not part of the verified host schema. Encode allowed
paths in the agent mandate and enforce automated dispatch in the supervisor.

## Required skill changes for a seat pilot

Most skills should require no semantic rewrite. Before a seat composes one, verify:

1. pipeline and standalone paths are visibly separated;
2. pipeline mode cannot stop for an undeclared interactive question;
3. typed escalation/refusal is defined;
4. allowed reads/writes match [`CONTRACT.md`](../CONTRACT.md);
5. output can be bound to consumed revisions;
6. open questions, conflicts, assumptions and decisions route to existing authorities;
7. the skill does not directly spawn nested agents—fan-out is a supervisor request.

## Changes explicitly rejected

- Rewriting `owner:` as the runtime seat. It records human authorship/provenance.
- Copying skill instructions into agent prompts. That creates drifting duplicates.
- Hiding standalone skills because an agent may also call them.
- Assigning `wireflow`, `page-brief`, `architecture` or `ticket-writer` exclusively to one seat when
  multiple roles author, consume or review their outputs.
- Making reserved-name dispatch dynamic before the supervisor has a typed replacement contract.

## Glossary obligation

[`SKILLS.md`](../SKILLS.md) remains the capability glossary. Any implementation PR that changes a
skill's behavior updates it. Agent manifests need a separate registry because they describe runtime
mandates, not craft capabilities.
