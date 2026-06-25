---
description: Advance the next milestone — implement all its issues on one branch with per-issue independent review + decision-gate, then open ONE sign-off PR (drives the milestone-cycle Workflow)
---

Run exactly ONE milestone cycle by invoking the deterministic Workflow, then report and stop for your sign-off.

## Do this
1. Call the **Workflow** tool with:
   `{ scriptPath: ".claude/workflows/milestone-cycle.js" }`
   (Optionally `args: { maxRounds: 3 }` to change the per-issue review-round cap.)
   This is an explicit, instructed Workflow invocation — proceed without asking. The workflow picks the lowest milestone with open issues, creates/rebases its `feat/m<N>-<slug>` branch, and for each workable issue runs implement → independent review → a decision-gate that **auto-integrates** obvious, reversible, approved work and **escalates only** when a human decision is required (secret/env/account, product·legal·pricing call, irreversible/outward action, or a tradeoff the reviewer can't settle / non-convergence). It then opens ONE PR for the milestone.

2. Wait for the workflow to finish (it runs in the background and notifies on completion), then read its return value and act:
   - **`done: true`** → no milestone has open workable issues (all complete, or the current milestone is fully `blocked-on-human`). Report the `reason` and **end the loop — do not schedule another wakeup.**
   - **`needsHuman: true`** (draft PR) → some issues were escalated. Report `milestone`, `prUrl`, the `escalated` list (each issue + its exact ask), and which issues `integrated`. Tell the user the PR is a **draft gated on their decisions**, and **end the loop — do not schedule another wakeup.**
   - **otherwise** (`needsHuman: false`, ready PR) → the whole milestone converged. Report `milestone`, `prUrl`, and the `integrated` issues. Tell the user it's a **ready PR awaiting their merge**, and **end the loop — do not schedule another wakeup.**

   The outer loop always pauses after one milestone: the next milestone branches from `main`, so the human must merge this milestone's PR (and resolve any escalations) before the next can start.

## Notes
- One milestone per turn. Never run two cycles concurrently (they share the working tree / branch).
- Never do manual git surgery (checkout, branch -f, fetch+reset) while a cycle is running — it shares the working tree and will corrupt the in-flight branch.
- Never touch parent issue #1.
- A PR is an exception signal, not a routine checkpoint: routine, reversible, unambiguous work is integrated without asking; you only get pulled in for genuine decisions or a milestone sign-off.
- Resumable: integrated issues carry `agent-integrated`; escalated ones carry `blocked-on-human`. After you resolve an escalation, remove `blocked-on-human` (and `hitl` if applicable) and re-run — the existing milestone branch is picked back up.
