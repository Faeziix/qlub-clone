export const meta = {
  name: "milestone-cycle",
  description:
    "Advance the next milestone: implement each of its issues on one milestone branch with an independent review + decision-gate per issue (auto-integrate obvious work, escalate only when a human decision is required), then open ONE PR for sign-off",
  phases: [
    {
      title: "Select",
      detail: "claim the next milestone + its branch, list workable issues",
    },
    {
      title: "Implement & Review",
      detail:
        "per issue: implement → independent review → decision-gate (integrate / escalate / redo)",
    },
    {
      title: "Ship",
      detail:
        "open ONE ready PR for the finished milestone, or a draft PR enumerating the human decisions needed",
    },
  ],
};

const REPO = "Faeziix/qlub-clone";
const MAX_ROUNDS = (args && args.maxRounds) || 3;
const AUTH = `Before any gh write run: \`unset GH_TOKEN GH_HOST && gh auth switch --user Faeziix\` (a GH_TOKEN in the shell otherwise forces the read-only XMA-Faez account).`;
const RULES = `Obey CLAUDE.md (bun never npm; locality of behavior; CVA + shadcn primitives; design tokens, no hardcoded values; axios not fetch; expressive names over comments; context7 for library docs). This is a real-money Iran product: Farsi-first/RTL, integer-rial money via money.ts (no floats), server-authoritative pricing, tenant isolation on every mutation. Parent PRD is issue #1 (read it + its two plan comments — the A-Z technical plan is the source of truth).`;
const ESCALATE = `ESCALATION CONTRACT — do NOT guess and do NOT perform the action; stop and ask the human when the work requires any of:
1. A secret, environment variable, credential, or an external account/service you cannot provision yourself.
2. A product, UX, pricing, or legal/compliance judgment — or an acceptance criterion too ambiguous to resolve safely.
3. An irreversible or outward-facing action (production data, going live with payments, destructive migration, deletion).
4. (reviewer) A security or architecture trade-off you cannot responsibly settle on your own.
When you hit one, leave the code in a safe, non-executed state, set needsHuman=true, and put a precise request in humanAsk: the category, the exact decision/value you need, and what is blocked without it. Routine, reversible, unambiguous work is NOT an escalation — just do it.`;

const SELECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "reason"],
  properties: {
    found: { type: "boolean" },
    reason: {
      type: "string",
      description:
        "if not found, why (no milestones left / current milestone fully blocked on human)",
    },
    milestone: { type: "string" },
    milestoneNumber: { type: "number" },
    branch: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "title", "hitl", "acceptanceCriteria"],
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          hitl: { type: "boolean" },
          acceptanceCriteria: { type: "array", items: { type: "string" } },
        },
      },
    },
  },
};
const IMPL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "criteriaAddressed", "testsPassing", "needsHuman"],
  properties: {
    summary: { type: "string" },
    criteriaAddressed: { type: "array", items: { type: "string" } },
    testsPassing: { type: "boolean" },
    needsHuman: { type: "boolean" },
    humanAsk: {
      type: "string",
      description: "category + exact decision/value needed + what is blocked",
    },
    notes: { type: "string" },
  },
};
const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "blocking", "verdict", "needsHuman"],
  properties: {
    approved: {
      type: "boolean",
      description:
        "true ONLY if every acceptance criterion is met, no blocking issues, and tests/typecheck/lint pass",
    },
    blocking: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["item", "why"],
        properties: { item: { type: "string" }, why: { type: "string" } },
      },
    },
    nonBlocking: { type: "array", items: { type: "string" } },
    needsHuman: { type: "boolean" },
    humanAsk: { type: "string" },
    verdict: { type: "string" },
  },
};
const SHIP_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["prUrl", "draft"],
  properties: {
    prUrl: { type: "string" },
    draft: { type: "boolean" },
    notes: { type: "string" },
  },
};

phase("Select");
const sel = await agent(
  `Select and claim the next workable MILESTONE in ${REPO}. ${AUTH}

- Milestones run in order M1, M2, … (\`gh api repos/${REPO}/milestones --jq 'sort_by(.title)'\`). The pick is the LOWEST-titled milestone that still has open issues. You may not skip ahead: if an earlier milestone has any open issue, that earlier milestone is the pick.
- For the picked milestone, list its open issues: \`gh issue list -R ${REPO} --milestone "<title>" --state open --limit 100 --json number,title,labels,body\`.
- Build the workable set in ASCENDING issue-number order, EXCLUDING any issue labeled \`agent-integrated\` (already on the branch) or \`blocked-on-human\` (awaiting a human decision). Include \`hitl\` issues that are not yet \`blocked-on-human\`, and set hitl=true for them.
- Cross-milestone blockers: parse each body's "## Blocked by" \`#N\`; any blocker that belongs to an EARLIER milestone must be CLOSED. Intra-milestone blockers are satisfied by ascending order — do NOT exclude on those.
- If a workable set exists: ensure the labels \`agent-integrated\` and \`blocked-on-human\` exist (\`gh label create ... || true\`); compute branch \`feat/m<milestoneNumber>-<short-slug>\`; \`git checkout main && git pull\`; if the branch exists check it out and \`git rebase main\`, else create it from main. Return found=true with milestone, milestoneNumber, branch, and the issues array (each with parsed acceptanceCriteria).
- If the picked milestone has NO workable issues (all remaining are blocked-on-human): return found=false, reason naming the milestone and the blocked issue numbers. Do NOT create a branch.
- If NO milestone has open issues: return found=false, reason "all milestones complete".`,
  { label: "select", phase: "Select", schema: SELECT_SCHEMA, model: "haiku" },
);

if (!sel || !sel.found) {
  return {
    done: true,
    reason: (sel && sel.reason) || "selection agent produced no result",
  };
}
log(
  `Milestone ${sel.milestone} on ${sel.branch} — ${sel.issues.length} workable issue(s)`,
);

phase("Implement & Review");
const integrated = [];
const escalated = [];

for (const iss of sel.issues) {
  if (iss.hitl) {
    escalated.push({
      number: iss.number,
      title: iss.title,
      ask: `[HITL] This issue is gated on a human decision (see issue #${iss.number} body and the PRD #1 plan). Make the decision(s), then remove the \`hitl\` and \`blocked-on-human\` labels to let the agent implement it.`,
    });
    log(`#${iss.number}: HITL — escalating without implementing`);
    continue;
  }

  let approved = false;
  let lastReview = null;
  let escalation = null;
  let round = 0;
  while (round < MAX_ROUNDS) {
    round++;
    const fixBlock = lastReview
      ? `\n\nThis is round ${round}. The previous independent review did NOT approve. Address every blocking item:\n${JSON.stringify(lastReview.blocking, null, 2)}\nAlso consider non-blocking notes: ${JSON.stringify(lastReview.nonBlocking || [])}.`
      : "";
    const impl = await agent(
      `Implement GitHub issue #${iss.number} ("${iss.title}") in ${REPO} on the SHARED milestone branch \`${sel.branch}\` (other issues from this milestone are committed here too — build on them, do not revert them). ${AUTH}
${RULES}
${ESCALATE}

Acceptance criteria (definition of done — satisfy EVERY one):
${(iss.acceptanceCriteria || []).map((c) => `- ${c}`).join("\n")}

Steps: \`git checkout ${sel.branch}\`; read issue #${iss.number} + PRD #1 + its plan comments + any referenced ADRs + the relevant code. For money/payments/auth/schema work write tests FIRST, then implement. Update the docs/ tree + relevant ADR. Run typecheck, lint, and tests and fix failures (do NOT run the Next.js build unless the issue requires it). Commit only this issue's work (end the message with the Co-Authored-By: Claude trailer) and push the branch. If you hit an escalation condition, stop per the contract and return needsHuman=true with humanAsk.${fixBlock}

Return a summary, which acceptance criteria you addressed, whether tests pass, and needsHuman.`,
      {
        label: `impl #${iss.number} r${round}`,
        phase: "Implement & Review",
        schema: IMPL_SCHEMA,
        model: "sonnet",
        effort: "high",
      },
    );

    if (impl && impl.needsHuman) {
      escalation = {
        number: iss.number,
        title: iss.title,
        ask: impl.humanAsk || "Implementer flagged a human decision is required.",
      };
      break;
    }

    lastReview = await agent(
      `You are an INDEPENDENT code reviewer (you did not write this code). Review the work for issue #${iss.number} ("${iss.title}") on branch \`${sel.branch}\` in ${REPO}. ${AUTH}
${RULES}
${ESCALATE}

Acceptance criteria the change must satisfy:
${(iss.acceptanceCriteria || []).map((c) => `- ${c}`).join("\n")}

Do: \`git fetch && git diff origin/main...${sel.branch}\` and focus on the commits for issue #${iss.number}; read every changed file; independently run typecheck, lint, and tests. Evaluate each acceptance criterion (met / not met) and hunt for correctness bugs, security/tenant-isolation gaps, money-handling errors (must be integer rial, no floats), RTL/Farsi correctness, and violations of CLAUDE.md or the PRD's decisions.

Set approved=true ONLY if EVERY acceptance criterion is met AND there are no blocking issues AND tests/typecheck/lint pass. If the change cannot ship without a human decision per the escalation contract (e.g. an unresolved security/architecture trade-off, a missing secret/env var, or an ambiguous product/legal call), set needsHuman=true with a precise humanAsk instead of inventing an answer. Otherwise list precise blocking items. The implementer summary (verify against the diff, do not trust): ${impl ? impl.summary : "n/a"}`,
      {
        label: `review #${iss.number} r${round}`,
        phase: "Implement & Review",
        schema: REVIEW_SCHEMA,
        model: "opus",
        effort: "high",
      },
    );

    if (lastReview && lastReview.needsHuman) {
      escalation = {
        number: iss.number,
        title: iss.title,
        ask: lastReview.humanAsk || "Reviewer flagged a human decision is required.",
      };
      break;
    }
    if (lastReview && lastReview.approved) {
      approved = true;
      break;
    }
    log(
      `#${iss.number} round ${round}: not approved — ${lastReview ? lastReview.blocking.length : "?"} blocking`,
    );
  }

  if (escalation) {
    escalated.push(escalation);
    log(`#${iss.number}: escalated — ${escalation.ask.slice(0, 80)}`);
  } else if (approved) {
    integrated.push({ number: iss.number, title: iss.title });
    log(`#${iss.number}: integrated onto ${sel.branch}`);
  } else {
    escalated.push({
      number: iss.number,
      title: iss.title,
      ask: `Implement↔review did not converge in ${MAX_ROUNDS} rounds. Last blocking items: ${JSON.stringify(lastReview ? lastReview.blocking : [])}`,
    });
    log(`#${iss.number}: escalated — non-convergence`);
  }
}

phase("Ship");
const ship = await agent(
  `Finalize the milestone "${sel.milestone}" PR for branch \`${sel.branch}\` in ${REPO}. ${AUTH}

This run integrated these issues onto the branch: ${JSON.stringify(integrated.map((i) => i.number))}.
This run escalated these issues (need a human decision): ${JSON.stringify(escalated, null, 2)}.

Do, in order:
1. Push \`${sel.branch}\`.
2. For each INTEGRATED issue: add the \`agent-integrated\` label (\`gh issue edit <n> --add-label agent-integrated\`).
3. For each ESCALATED issue: add the \`blocked-on-human\` label and post ONE comment containing its exact \`ask\` (so the human sees the precise decision needed). Do not duplicate a comment that already says the same thing.
4. Determine completeness: list the milestone's still-open issues NOT labeled \`agent-integrated\` (\`gh issue list --milestone "${sel.milestone}" --state open\`). The milestone is COMPLETE only if that list is empty.
5. Find any existing open PR for \`${sel.branch}\` (\`gh pr list --head ${sel.branch}\`). If one exists, UPDATE it (title/body, and toggle draft↔ready with \`gh pr ready\` / \`gh pr ready --undo\`) rather than opening a new one. Otherwise create it.
   - The PR body must begin with a \`Closes #<n>\` line for EVERY \`agent-integrated\` issue in the milestone (so merging closes them), map what shipped to the milestone's issues, and have a clear "## Needs your decision" section listing every escalated issue and its ask (or "none" if complete).
   - If the milestone is COMPLETE: make it a READY PR titled \`${sel.milestone}\`.
   - If NOT complete: make it a DRAFT PR — the "Needs your decision" section is the gate; merging waits until those are resolved and their issues implemented.
6. Never modify or close issue #1.

Return the PR url and whether it is a draft.`,
  { label: "ship", phase: "Ship", schema: SHIP_SCHEMA, model: "sonnet" },
);

return {
  done: false,
  milestone: sel.milestone,
  branch: sel.branch,
  integrated: integrated.map((i) => i.number),
  escalated: escalated.map((e) => ({ issue: e.number, ask: e.ask })),
  prUrl: ship ? ship.prUrl : null,
  draft: ship ? ship.draft : true,
  needsHuman: escalated.length > 0,
  // Each milestone ends in ONE PR that you sign off + merge before the next
  // milestone can branch from main, so always pause the outer loop here.
  stopLoop: true,
};
