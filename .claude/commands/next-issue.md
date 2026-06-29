---
description: "[Superseded by /next-milestone] Advance the next milestone via the milestone-cycle Workflow"
---

> **Superseded.** Per-issue cycles created a PR for every issue — including obvious, reversible changes that needed no human sign-off. The loop now works a whole **milestone** on one branch, auto-integrates routine approved work, and only opens a PR for a milestone sign-off or a genuine human decision. Use **/next-milestone**.

Drive the new cycle: call the **Workflow** tool with `{ scriptPath: ".claude/workflows/milestone-cycle.js" }` and follow the reporting rules in `.claude/commands/next-milestone.md`.

The standalone per-issue engine has been merged into `.claude/workflows/milestone-cycle.js`: the milestone engine now applies issue-cycle's per-issue selection discipline (`ready-for-agent` gate, `in-progress` claim, per-issue `## Blocked by` verification) while still shipping ONE milestone PR.
