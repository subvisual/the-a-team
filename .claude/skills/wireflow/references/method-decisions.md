# The wireflow method — grill checklist (decisions + why)

Read this before grilling. Walk these in order, **one question per message, each with your
recommended answer**, resolving dependencies before moving on. These decisions were reached
by grilling a real project (Casa Financeira) one decision at a time; the *why* matters more
than the letter, so adapt to the project in front of you rather than copying the example.

The point of a wireflow: it is the artifact **between user journeys and wireframes**. It
shows *where the user goes and what the system does*, not what each screen looks like. Keep
that boundary sharp — the moment you're drawing buttons and fields, you've dropped into the
wireframe layer and left the wireflow.

## A. Unit of a wireflow = a cross-cutting, actor-anchored journey
Not one-flow-per-epic. A journey follows a real path end-to-end and may cross many
build-buckets/epics. **JTBDs are many-to-many with journeys** — a flow can serve several
jobs, a job can span flows. Organize by *actor journey*; anchor and annotate with JTBD.
*Why:* epics are a build convenience; users don't experience epics, they experience journeys.
Ask: "Who are the actors, and what end-to-end path does each one walk?"

## B. A small set of journeys covers the whole product
Aim for a handful of journeys that together touch **every JTBD and every epic**. Cross-cutting
concerns (notification channels, the agent, auth) are **woven into** the journeys they support,
not drawn as standalone flows. *Why:* a standalone "notifications flow" has no actor walking
it; it fragments the story. Propose the set, then confirm: "Here are N journeys; between them
they cover jobs 1–k and epics 1–m. Agreed, or is one missing/redundant?"

## C. The spine
One journey carries the **core** JTBD — that's the *spine*, and it goes **deeper** than the
others (more page-states, more edge cases). Page-level granularity is fine for the rest.
*Why:* uniform depth everywhere is wasteful; depth belongs where the core value is delivered.

## D. Node taxonomy (fixed vocabulary)
Confirm this vocabulary so the board reads consistently:
- **CRM / own screen** — a page you build; links to a live route.
- **External-site stub** — a site you don't own, view-only in the flow.
- **External-product stub** — a separate product/tool in the path.
- **System / engine node** — backend work, no UI.
- **Decision** — a diamond; a branch point.
- **Agent node** — an AI/automation step.
- **Start / Outcome** — the struggle and the job-done bookends.
- **Stop** — a *locked cut*: a path deliberately not taken.

**Granularity rule (critical):** one node = **one page, one page-state, or one system step**.
Never go below page-block level — that's the wireframe layer. *Why:* the taxonomy is what
encodes the system boundary (build vs external vs backend) visually, so it must stay stable.

## E. Layout = swimlanes; lane = owner, shape/colour = node type
Each journey draws **only the lanes it touches**. The lane tells you *who owns this step*;
the node type tells you *what kind of step it is*. *Why:* two orthogonal encodings (owner ×
type) carry the "what we build vs what's external / view-only / backend" story with zero labels.

**Arrows add a third, no-cost cue: a cross-lane arrow is tinted with the colour of the lane it
lands in** (same-lane arrows stay neutral gray). *Why:* hand-offs between owners are the hardest
thing to trace on a busy board — colouring the arrow by its destination lets the eye follow a
pathway across lanes without walking every elbow. It lives on the edge channel (nodes still colour
by type), so it doesn't compete with the type palette; each lane label carries a matching colour
tick so the mapping is self-documenting.

## F. System boundary is encoded by node type
Own-screen vs external-product vs external-site vs system is the whole build-vs-buy story, made
visible by shape/colour. Don't add a "built by us" label — the node type already says it.

## G. Backend is included
Add system nodes + decision diamonds **between** screen nodes. Full-platform coverage without
turning the board into a data-flow diagram. **Keep the spine the human screen-journey** — the
backend is punctuation between screens, not the plot.

## H. Branches: draw only what changes the path
Draw a branch only if it (a) changes the page path or (b) encodes a **locked decision / edge
case**. **Locked cuts become visible Stop nodes** — documenting the deliberate non-path is high
value (it answers "why didn't you handle X?" on the board). Omit cosmetic/deferred branches.

## I. Coverage without labels (the key discipline)
**Every** initiative/requirement must be **embodied** by some node or branch — but initiatives
are **never labelled** on the board. No MoSCoW, no roadmap metadata, no initiative IDs. Only the
lane + node-type encodings appear. *Why:* the wireflow's job is to show the *shape of the
product*, not to be a requirements tracker; labels turn a map into clutter. Track coverage in
your head / a side note, and prove it with the JTBD × Journey matrix — not on the flow itself.

## J. JTBD anchoring
Per-journey header names the **actor** and the **JTBD served**, with **Start = the struggle**
and **Outcome = the job done**, so each flow literally traces struggle → progress. Add a
board-level **JTBD × Journey coverage matrix** (the engine builds this from each journey's
`jtbds` list). *Why:* it keeps the jobs at the core and makes coverage auditable at a glance.

## K. Deepen INLINE, never split
When a screen needs more detail, fold it into the **same journey band** as continuing nodes so a
reader follows it end-to-end. Do **not** park depth in a separate "L2" diagram — this was
explicitly rejected. NN/g backs this: a node can be the same page in a *new state*. For a heavy
screen, model it as an inline **screen-detail cluster**: a titled container, an optional stepper,
and region cards — still on the spine, still followable left-to-right.

## L. Bundling / multi-product (generalizable pattern)
When one unit spawns N sub-items handled by different owners, **fan-out/fan-in at the unit
level** (not the person). Loops (e.g. cross-sell) re-enter an earlier journey. Model the unit and
branch on the mix inside the flow, rather than drawing a lane per sub-owner.

## Output decision (last)
Default deliverable: **SVG per journey + combined HTML** (viewable, with legend + matrix).
**Offer** the native **FigJam** rebuild for editability as an add-on. Confirm which the user
wants before building the FigJam side — it's more work and only worth it if they'll edit there.
