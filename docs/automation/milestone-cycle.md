# Milestone cycle — autonomous issue automation

The automation works the backlog **one milestone at a time**. A milestone is a
coherent feature group (see GitHub Milestones M1–M7). The goal: keep the loop
running without pulling you in for routine work, and surface a PR only when it
genuinely needs **you** — a decision, or a milestone sign-off.

## Why milestones instead of per-issue PRs

The earlier `issue-cycle` opened a PR for every issue. Most were obvious,
reversible changes you couldn't meaningfully reject — noise that trains
rubber-stamping. Two structural fixes:

- **One branch per milestone.** Issues are implemented sequentially on
  `feat/m<N>-<slug>`, so each builds on the previous one's work. (Per-issue
  branches were cut fresh from `main` and never saw each other's changes until
  merge.)
- **The PR is an exception signal, not a routine checkpoint.** Approved,
  reversible, unambiguous work is integrated onto the branch with no PR. You see
  a PR only at a milestone sign-off, or when a real decision is needed.

## Where to watch it happen

Everything is mirrored to GitHub as it runs, so you can follow along without
reading the workflow log:

- **Issue labels** flip per-issue, live: `in-progress` on start →
  `agent-integrated` (or `blocked-on-human`) on finish.
- **Issue comments** — the implementer and all three reviewers each post a
  comment on the issue (`🤖 Implementer`, `🔎 Code review`, `🧪 QA`,
  `🎨 Design review`, `⛔ Escalated`), so the issue thread is a full audit trail.
- **GitHub Project "Qlub Iran — Delivery" (#2)** — each issue's **Status**
  moves Todo → In Progress → Done; the **Revision round** field tracks the
  current implement↔review round; the **Reviewers** field holds the panel
  verdict summary. Field/option IDs are baked into the workflow constants.

## The cycle (one milestone per run)

1. **Select** — pick the lowest milestone with open issues (no skipping ahead).
   Create or rebase its branch from `main`. List workable issues in ascending
   order, excluding `agent-integrated` (done) and `blocked-on-human` (awaiting
   you).
2. **Implement & Review** — issues run **one at a time**, and each one's GitHub
   state moves with the work (no bulk stamping):
   - **Claim** — when an issue *starts*, the implementer adds the `in-progress`
     label and sets its **Project Status → In Progress** (so the board shows
     it's being worked on), and writes the round into the Project **Revision
     round** field.
   - **Implement** — a Sonnet implementer commits to the milestone branch and
     **comments on the issue** what it changed (commits, criteria addressed,
     test status).
   - **Three-reviewer panel** (parallel barrier) — each reviewer **comments its
     verdict on the issue**:
     - 🟣 **code reviewer** (Opus) — diff vs main, runs tests/lint/types, every
       acceptance criterion.
     - 🟠 **QA agent** (Sonnet) — browser-free runtime check (HTTP + dev-server
       log): 5xx, hydration, console errors, blank renders. Self-skips issues
       with no runnable surface.
     - 🟢 **design reviewer** (Opus) — drives local Chrome + `impeccable`
       (critique/detect/audit) on styling, business-logic flow, and RTL/i18n
       (the RTL board only when i18n is touched). Self-skips non-UI issues, and
       skips gracefully (non-blocking) if a browser can't reach the dev server.
   - **Decision-gate** — passes only when **code approved AND zero critical/high
     QA AND zero critical/high design**. Medium/low findings are advisory.
   - **Integrate** — gate passes → swap labels to `agent-integrated`, set
     **Project Status → Done**, write the panel summary (`code:✓ qa:✓
     design:skip`) into the Project **Reviewers** field, then advance to the
     next issue.
   - **Escalate** — a human decision is required (or non-convergence) → label
     `blocked-on-human`, comment the exact ask, move on.
   - **Redo** — fixable failures → the next round threads ALL reviewers'
     critical/high items to the implementer, up to `maxRounds` (default 5);
     still failing → escalate as non-convergence.
3. **Ship** — open ONE PR for the milestone:
   - **Ready PR** if every issue integrated (`Closes #…` each) — awaits your merge.
   - **Draft PR** if anything escalated — body has a "Needs your decision"
     section; merging waits until you resolve them.

The loop **pauses after each milestone**: the next milestone branches from
`main`, so you merge this milestone's PR (and resolve escalations) before the
next starts.

## Keeping review cheap

The panel is the expensive part, so it's cost-aware by design:

- **Per-issue diff scope, not the whole branch.** Each issue records a base SHA
  when it starts; reviewers diff `base..head` — only *that* issue's changes.
  Without this, reviewing issue #8 of a milestone would re-read issues #1–8
  (O(n²) as the branch accumulates). This is the single biggest saver.
- **Skip green lenses on fix rounds.** The code reviewer runs every round (over
  just the new fix delta `prevHead..head`); QA and design re-run **only** if
  they previously had a critical/high finding. A lens that's already green is
  carried forward, not re-paid.
- **Relevance-gating.** QA isn't spawned for issues with no runnable surface;
  design isn't spawned for non-UI issues. A docs-only change runs the code lens
  alone.
- **One test run.** Only the code reviewer runs typecheck/lint/tests; QA checks
  runtime, design checks visuals — neither re-runs the suite.
- **Model/effort.** Opus reviewers (code, design) run at *medium* effort; QA on
  Sonnet. Cheap deterministic steps (select, per-issue bookkeeping) run on Haiku.

## What counts as "escalate to a human"

1. A secret, env var, credential, or external account/service the agent can't provision.
2. A product, UX, pricing, or legal/compliance judgment — or an acceptance criterion too ambiguous to resolve safely.
3. An irreversible or outward-facing action (production data, going live with payments, destructive migration, deletion).
4. A security/architecture trade-off the reviewer can't responsibly settle, or implement↔review non-convergence.

`hitl`-labelled issues auto-escalate without implementation (they are gated on a
human decision by definition).

## Resuming after you act

- Merge a ready PR → its issues close → next run picks the next milestone.
- Resolve an escalation → remove `blocked-on-human` (and `hitl` if applicable)
  from the issue → re-run; the existing milestone branch is picked back up and
  the PR is updated (and flipped to ready once the milestone is complete).

## Running it

- Command: **/next-milestone** (drives `.claude/workflows/milestone-cycle.js`).
- `/next-issue` is superseded and now redirects to the same workflow.
- Optional cap: `args: { maxRounds: N }` (default 5 — raised from 3 to absorb
  the three-reviewer panel's extra fix-rounds).

## Operational rules

- One milestone per turn — never two cycles concurrently (shared working tree/branch).
- Never do manual git surgery while a cycle runs — it shares the working tree.
- Issue #1 (the PRD) is never modified or closed.
