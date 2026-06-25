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

## The cycle (one milestone per run)

1. **Select** — pick the lowest milestone with open issues (no skipping ahead).
   Create or rebase its branch from `main`. List workable issues in ascending
   order, excluding `agent-integrated` (done) and `blocked-on-human` (awaiting
   you).
2. **Implement & Review** — for each issue: a Sonnet implementer commits to the
   milestone branch, an independent Opus reviewer checks it against every
   acceptance criterion and the project rules. A deterministic **decision-gate**
   then routes the outcome:
   - **Integrate** — approved + reversible + no human input needed → commit
     stays on the branch, no PR.
   - **Escalate** — a human decision is required → label `blocked-on-human`,
     comment the exact ask, move on to the next issue.
   - **Redo** — fixable review failures → iterate up to `maxRounds` (default 3);
     still failing → escalate as non-convergence.
3. **Ship** — open ONE PR for the milestone:
   - **Ready PR** if every issue integrated (`Closes #…` each) — awaits your merge.
   - **Draft PR** if anything escalated — body has a "Needs your decision"
     section; merging waits until you resolve them.

The loop **pauses after each milestone**: the next milestone branches from
`main`, so you merge this milestone's PR (and resolve escalations) before the
next starts.

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
- Optional cap: `args: { maxRounds: N }`.

## Operational rules

- One milestone per turn — never two cycles concurrently (shared working tree/branch).
- Never do manual git surgery while a cycle runs — it shares the working tree.
- Issue #1 (the PRD) is never modified or closed.
