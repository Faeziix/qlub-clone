---
description: Run one deterministic implement↔review cycle on the next unblocked issue (drives the issue-cycle Workflow)
---

Run exactly ONE issue cycle by invoking the deterministic Workflow, then decide whether to keep looping.

## Do this
1. Call the **Workflow** tool with:
   `{ scriptPath: ".claude/workflows/issue-cycle.js" }`
   (Optionally `args: { maxRounds: 3 }` to change the review-round cap.)
   This is an explicit, instructed Workflow invocation — proceed without asking. The workflow selects the next unblocked `ready-for-agent` issue, claims it (`in-progress` label + branch), runs an implement↔independent-review loop until the reviewer approves or the round cap is hit, then opens the PR.

2. Wait for the workflow to finish (it runs in the background and notifies on completion), then read its return value and act:
   - **`done: true`** → no workable issue remains (all blocked or HITL). Report the `reason` and **end the loop — do not schedule another wakeup.**
   - **`stopLoop: true`** → the cycle did NOT converge; a **draft PR** was opened and the issue left `in-progress`. Report `issue`, `prUrl`, and that it needs human input, then **end the loop — do not schedule another wakeup.**
   - **otherwise** (approved, ready PR opened) → report `issue`, `prUrl`, `rounds`, then **continue the loop** to the next issue.

## Notes
- One issue per turn. Never run two cycles concurrently (issues share the working tree / branch).
- Never touch parent issue #1. Never pick a `[HITL]` issue — those are gated on human decisions (esp. #5 legal/providers).
- The branch on disk is the source of truth across review rounds; reviews are independent each round by design.
