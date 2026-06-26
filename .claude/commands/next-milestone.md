---
description: Advance the next milestone — implement all its issues on one branch with per-issue independent review + decision-gate, then open ONE sign-off PR (drives the milestone-cycle Workflow)
---

Run exactly ONE milestone cycle by invoking the deterministic Workflow, then report and stop for your sign-off.

## Do this
1. Call the **Workflow** tool with:
   `{ scriptPath: ".claude/workflows/milestone-cycle.js" }`
   (Optionally `args: { maxRounds: 3 }` to change the per-issue review-round cap.)
   This is an explicit, instructed Workflow invocation — proceed without asking. The workflow picks the lowest milestone with open issues and builds its workable set with **per-issue selection discipline**: an issue is worked only if it is labeled `ready-for-agent` (or `hitl`), is not `agent-integrated`/`blocked-on-human`, and has every `## Blocked by` ref satisfied (closed, or an earlier in-run issue of the same milestone). It claims each worked issue with `in-progress`, creates/rebases the `feat/m<N>-<slug>` branch, and for each workable issue runs implement → independent review → a decision-gate that **auto-integrates** obvious, reversible, approved work and **escalates only** when a human decision is required (secret/env/account, product·legal·pricing call, irreversible/outward action, or a tradeoff the reviewer can't settle / non-convergence). Open issues that are not yet ready or still blocked are reported as `notReady` and keep the milestone incomplete. It then opens ONE PR for the milestone.

2. Wait for the workflow to finish (it runs in the background and notifies on completion), then read its return value and act:
   - **`done: true`** → no milestone has open workable issues (all complete, or the current milestone is fully `blocked-on-human`). Report the `reason` and **end the loop — do not schedule another wakeup.**
   - **`needsHuman: true`** (draft PR) → some issues were escalated. Report `milestone`, `prUrl`, the `escalated` list (each issue + its exact ask), which issues `integrated`, and any `notReady` issues (not yet groomed / still blocked). Tell the user the PR is a **draft gated on their decisions**, and **end the loop — do not schedule another wakeup.**
   - **otherwise** (`needsHuman: false`) → every workable issue converged. If `notReady` is non-empty the PR is still a **draft** (those open issues keep the milestone incomplete) — report them so the user can groom/unblock; if `notReady` is empty it's a **ready PR awaiting their merge**. Either way report `milestone`, `prUrl`, and the `integrated` issues, and **end the loop — do not schedule another wakeup.**

   The outer loop always pauses after one milestone: the next milestone branches from `main`, so the human must merge this milestone's PR (and resolve any escalations) before the next can start.

## Notes
- One milestone per turn. Never run two cycles concurrently (they share the working tree / branch).
- Never do manual git surgery (checkout, branch -f, fetch+reset) while a cycle is running — it shares the working tree and will corrupt the in-flight branch.
- Never touch parent issue #1.
- A PR is an exception signal, not a routine checkpoint: routine, reversible, unambiguous work is integrated without asking; you only get pulled in for genuine decisions or a milestone sign-off.
- Resumable: integrated issues carry `agent-integrated`; escalated ones carry `blocked-on-human`; in-flight ones carry `in-progress` (swapped to a terminal label at ship). After you resolve an escalation, remove `blocked-on-human` (and `hitl` if applicable) and add `ready-for-agent`, then re-run — the existing milestone branch is picked back up. A `notReady` issue just needs `ready-for-agent` (or its blocker closed) before a re-run will pick it up.
