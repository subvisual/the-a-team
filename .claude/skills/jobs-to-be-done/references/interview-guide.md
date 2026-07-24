# Interview guide — the grill

Read this before running a CREATE grill. The method is Klement's own elicitation, run as a relentless
one-question-at-a-time interview. The rules of engagement:

- **One question at a time.** Never dump a list. Wait for the answer before the next.
- **Lead with your recommended answer.** Don't just extract — propose, grounded in the evidence and the
  theory, and let the user correct you. A grill is a thinking partner, not a form.
- **Mine evidence before asking.** If the user pasted research/notes/a product description, answer the
  question from it yourself and confirm — only ask when the evidence is silent. (Klement: "Ask customers
  about what they've done, not just what they want. Confirm it if you can." L7736)
- **Sequence matters.** Push and pull first (felt outside any product), then anxiety and inertia (felt
  when demand meets a product). L7778
- **Coach on contact.** The moment an answer is a task, feature, persona, or job-type, name it, point at
  the failed test in `rubric.md`, and re-ask — one or two sentences. Don't silently fix it.

## Step 0 — Triage (only if multiple struggles present)

If the input holds more than one distinct struggle, list them plainly and ask the user to pick ONE for
this session. Park the rest as named candidates. Recommended framing: "I see N different struggles in
here — [list]. We grill one deeply per session. I'd start with [X] because [most evidence / most
decision-relevant]. Which one?"

## Step 1 — Push (the struggling moment)

Goal: find what made the old way stop working. Klement's questions (L3291):

- "Find pushes by first asking about the solutions customers have used. At what point did they realize
  their particular solution wasn't working anymore? What was going on in their lives?"
- Distinguish **external** push (circumstances changed) from **internal** push (a felt "I want
  something different"). L2964
- Separate a **struggling** customer from a merely **inconvenienced** one (L7833) — only real struggle
  generates demand. If you can't find a struggle, say so; the job may not exist.

## Step 2 — Pull (the better life + the draw of a solution)

Goal: the "new me." Klement's questions (L3295):

- "Ask about their opinions about other products they investigated. Why did they choose product X or
  product Y? What was wrong with Y? What did X have that Y didn't?"
- The progress question (Ritzenthaler, L6824): "Without describing the feature, how will the customer's
  life be better once it exists?" Hold the line on *without describing the feature* — if the answer is a
  feature, that's the task trap; climb to the progress.

## Step 3 — Anxiety (what makes them hesitate)

- **Anxiety-in-choice** (first-timers): "What would make them unsure whether this can even get the job
  done?" L3174
- **Anxiety-in-use** (repeat users): "Once they're using it, what makes them nervous?" L3203
- These reduce demand. They're competitors, not afterthoughts.

## Step 4 — Inertia (the habits holding them in place)

- **Habits-in-choice:** what locks them into the current solution at the moment of choice (e.g. data,
  switching cost, defaults). L3217
- **Habits-in-use:** what old habits would pull them back to the old way after switching. L3249
- Ritzenthaler's fourth question (L6824): "What is preventing customers from adopting a new solution?"

## Step 5 — Competition & the switch

A job must name what it replaces (the killer wording test, L6630). Ask:

- "When customers start using this, what do they STOP using or doing?" (L4040) Remember the replaced
  thing can be a compensatory behavior, paying someone, DIY, combining tools, or doing nothing. L3592
- Validation hook: "Could we find a customer who switched FROM that TO this?" If not, the job is a
  hypothesis. L3779

## Step 6 — The altitude ladder

Express the *same* struggle at 2–3 heights and show them:

- **Low rung** — near-task, probably too narrow (smells like a feature).
- **Middle rung** — workable; actionable for the decision at hand.
- **High rung** — near-cosmic; true but too abstract to build against.

Recommend a rung (usually the middle) and say why, then let the user commit. Klement: how high/low is a
design choice (L6665). The ladder makes that choice visible and is the strongest teaching moment.

## Step 7 — Draft, gate, converge

Draft at the chosen rung in Klement's progress form ("Free me from…, so I can…") to force progress and
expose any task, then render the final in the `When…, I want to…, so I can…` house format for delivery.
Run the rendered version against the live gate checklist in
`rubric.md` in front of the user. Stop when gate-green, or when the user says "good enough" — then stamp
confidence honestly (record any open gates). Assemble the full bundle (see SKILL.md → Outputs).

## Quick reference — Klement's elicitation questions

- Push: "At what point did they realize their solution wasn't working anymore? What was going on in
  their lives?" (L3291)
- Pull: "Why did they choose X or Y? What was wrong with Y? What did X have that Y didn't?" (L3295)
- Progress: "Without describing the feature, how will the customer's life be better once it exists?" (L6824)
- Inertia: "What is preventing customers from adopting a new solution?" (L6824)
- Competition: "What will customers stop buying/doing when they start using our solution?" (L4040)
- "Begin by identifying a struggle or aspiration. Start wide and get progressively narrow." (L7824)
