export const meta = {
  name: "issue-cycle",
  description:
    "Select the next unblocked ready-for-agent issue, implement it, and run an implement↔review loop until the reviewer approves or a round cap is hit (then draft-PR + pause)",
  phases: [
    {
      title: "Select",
      detail: "claim the next unblocked issue + create the branch",
    },
    {
      title: "Implement & Review",
      detail: "converge: implement, independent review, repeat",
    },
    {
      title: "Ship",
      detail:
        "open a ready PR on approval, or a draft PR + pause on non-convergence",
    },
  ],
};

const REPO = "Faeziix/qlub-clone";
const MAX_ROUNDS = (args && args.maxRounds) || 3;
const AUTH = `Before any gh write run: \`unset GH_TOKEN GH_HOST && gh auth switch --user Faeziix\` (a GH_TOKEN in the shell otherwise forces the read-only XMA-Faez account).`;
const RULES = `Obey CLAUDE.md (bun never npm; locality of behavior; CVA + shadcn primitives; design tokens, no hardcoded values; axios not fetch; expressive names over comments; context7 for library docs). This is a real-money Iran product: Farsi-first/RTL, integer-rial money via money.ts (no floats), server-authoritative pricing, tenant isolation on every mutation. Parent PRD is issue #1 (read it + its two plan comments — the A-Z technical plan is the source of truth).`;

const SELECT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["found", "reason"],
  properties: {
    found: { type: "boolean" },
    reason: {
      type: "string",
      description: "if not found, why (all blocked / only HITL / none)",
    },
    issue: { type: "number" },
    title: { type: "string" },
    branch: { type: "string" },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
  },
};
const IMPL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "criteriaAddressed", "testsPassing"],
  properties: {
    summary: { type: "string" },
    criteriaAddressed: { type: "array", items: { type: "string" } },
    testsPassing: { type: "boolean" },
    notes: { type: "string" },
  },
};
const REVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["approved", "blocking", "verdict"],
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
  `Select and claim the next workable GitHub issue in ${REPO}. ${AUTH}

- List candidates: \`gh issue list -R ${REPO} --label ready-for-agent --state open --limit 100 --json number,title,labels,body\`
- Drop any that also carry the \`in-progress\` or \`hitl\` label.
- In ascending issue-number order, parse each body's "## Blocked by" for \`#N\` refs and verify every one is CLOSED (\`gh issue view N -R ${REPO} --json state\`). A blocker counts as satisfied only when state == CLOSED.
- The first candidate whose blockers are ALL closed is the pick. Never pick issue #1 or a [HITL] issue.
- If a pick exists: add the \`in-progress\` label to it; \`git checkout main && git pull\`; create branch \`feat/issue-<N>-<short-slug>\`; return found=true with issue, title, branch, and the acceptanceCriteria parsed from the issue body.
- If none are workable: return found=false with the reason. Do NOT create a branch.`,
  { label: "select", phase: "Select", schema: SELECT_SCHEMA },
);

if (!sel || !sel.found) {
  return {
    done: true,
    reason: (sel && sel.reason) || "selection agent produced no result",
  };
}
log(`Working #${sel.issue} — ${sel.title} on ${sel.branch}`);

phase("Implement & Review");
let approved = false;
let lastReview = null;
let round = 0;
while (round < MAX_ROUNDS) {
  round++;
  const fixBlock = lastReview
    ? `\n\nThis is round ${round}. The previous independent review did NOT approve. Address every blocking item:\n${JSON.stringify(lastReview.blocking, null, 2)}\nAlso consider non-blocking notes: ${JSON.stringify(lastReview.nonBlocking || [])}.`
    : "";
  const impl = await agent(
    `Implement GitHub issue #${sel.issue} in ${REPO} on the existing branch \`${sel.branch}\`. ${AUTH}
${RULES}

Acceptance criteria (definition of done — satisfy EVERY one):
${(sel.acceptanceCriteria || []).map((c) => `- ${c}`).join("\n")}

Steps: \`git checkout ${sel.branch}\`; read issue #${sel.issue} + PRD #1 + its plan comments + any referenced ADRs + the relevant code. For money/payments/auth/schema work write tests FIRST, then implement. Update the docs/ tree + relevant ADR. Run typecheck, lint, and tests and fix failures (do NOT run the Next.js build unless the issue requires it). Commit (end the message with the Co-Authored-By: Claude trailer) and push the branch.${fixBlock}

Return a summary, which acceptance criteria you addressed, and whether tests pass.`,
    {
      label: `implement:r${round}`,
      phase: "Implement & Review",
      schema: IMPL_SCHEMA,
      effort: "high",
    },
  );

  lastReview = await agent(
    `You are an INDEPENDENT code reviewer (you did not write this code). Review branch \`${sel.branch}\` against GitHub issue #${sel.issue} in ${REPO}. ${AUTH}
${RULES}

Acceptance criteria the change must satisfy:
${(sel.acceptanceCriteria || []).map((c) => `- ${c}`).join("\n")}

Do: \`git fetch && git diff origin/main...${sel.branch}\`; read every changed file; independently run typecheck, lint, and tests. Evaluate each acceptance criterion (met / not met) and hunt for correctness bugs, security/tenant-isolation gaps, money-handling errors (must be integer rial, no floats), RTL/Farsi correctness, and violations of CLAUDE.md or the PRD's decisions.

Set approved=true ONLY if EVERY acceptance criterion is met AND there are no blocking issues AND tests/typecheck/lint pass. Otherwise list precise blocking items with reasons. The implementer summary (for reference, do not take on trust — verify against the diff): ${impl ? impl.summary : "n/a"}`,
    {
      label: `review:r${round}`,
      phase: "Implement & Review",
      schema: REVIEW_SCHEMA,
      effort: "high",
    },
  );

  if (lastReview && lastReview.approved) {
    approved = true;
    break;
  }
  log(
    `Round ${round}: not approved — ${lastReview ? lastReview.blocking.length : "?"} blocking item(s)`,
  );
}

phase("Ship");
const ship = await agent(
  `Open the pull request for branch \`${sel.branch}\` (issue #${sel.issue}) in ${REPO}. ${AUTH}

Push the branch if needed, then:
${
  approved
    ? `- The change was APPROVED by independent review. Open a READY PR whose body begins with \`Closes #${sel.issue}\`, maps what shipped to each acceptance criterion, and notes anything deferred.`
    : `- The implement↔review loop did NOT converge within ${MAX_ROUNDS} rounds. Open a DRAFT PR (\`gh pr create --draft\`) whose body begins with \`Closes #${sel.issue}\` and lists the UNRESOLVED blocking items:\n${JSON.stringify(lastReview ? lastReview.blocking : [], null, 2)}\n- Post a comment on issue #${sel.issue} summarizing the non-convergence. Leave the \`in-progress\` label in place.`
}
- Do NOT modify or close issue #1.
Return the PR url and whether it is a draft.`,
  { label: "ship", phase: "Ship", schema: SHIP_SCHEMA },
);

return {
  done: false,
  issue: sel.issue,
  title: sel.title,
  approved,
  rounds: round,
  prUrl: ship ? ship.prUrl : null,
  draft: ship ? ship.draft : true,
  stopLoop: !approved, // non-convergence => pause the outer loop for the human
};
