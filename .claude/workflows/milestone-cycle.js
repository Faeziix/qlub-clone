export const meta = {
  name: "milestone-cycle",
  description:
    "Advance the next milestone: select its issues with per-issue discipline, implement each on one milestone branch behind a cost-aware three-reviewer panel (code ∥ QA ∥ design) — reviews scoped to each issue's own delta, green lenses skipped on fix rounds — keep each issue's labels + GitHub Project status + agent comments live as the work moves, then open ONE PR for sign-off",
  phases: [
    {
      title: "Select",
      detail:
        "claim the next milestone + its branch; gate issues on ready-for-agent + Blocked-by (labels/status are claimed per-issue, not in bulk)",
    },
    {
      title: "Implement & Review",
      detail:
        "per issue: claim → implement (commit + comment + base SHA) → code ∥ QA ∥ design over THIS issue's delta (skip green lenses on re-rounds) → severity gate → integrate (Project:Done) / escalate / redo",
    },
    {
      title: "Ship",
      detail:
        "open ONE ready PR for the finished milestone, or a draft PR enumerating the human decisions + not-ready issues",
    },
  ],
};

const REPO = "Faeziix/qlub-clone";
const MAX_ROUNDS = (args && args.maxRounds) || 5;
const AUTH = `Before any gh write run: \`unset GH_TOKEN GH_HOST && gh auth switch --user Faeziix\` (a GH_TOKEN in the shell otherwise forces the read-only XMA-Faez account).`;

const PROJECT = {
  number: 2,
  owner: "Faeziix",
  id: "PVT_kwHOA-jpnM4BbuK2",
  statusFieldId: "PVTSSF_lAHOA-jpnM4BbuK2zhWcsTU",
  status: { todo: "f75ad846", inProgress: "47fc9ee4", done: "98236657" },
  revisionRoundFieldId: "PVTF_lAHOA-jpnM4BbuK2zhWeSbo",
  reviewersFieldId: "PVTF_lAHOA-jpnM4BbuK2zhWcsTo",
};
const PROJECT_HELP = `GITHUB PROJECT SYNC — the board "Qlub Iran — Delivery" (project #${PROJECT.number}, owner ${PROJECT.owner}, id ${PROJECT.id}) is the live source of truth. To edit issue #N's project item:
- Resolve its item id: \`gh project item-list ${PROJECT.number} --owner ${PROJECT.owner} --format json --jq '.items[] | select(.content.number==N) | .id'\`. If empty, add it first (\`gh project item-add ${PROJECT.number} --owner ${PROJECT.owner} --url https://github.com/${REPO}/issues/N\`) then re-resolve.
- Status (single-select): \`gh project item-edit --project-id ${PROJECT.id} --id <itemId> --field-id ${PROJECT.statusFieldId} --single-select-option-id <opt>\` — opt: Todo=${PROJECT.status.todo}, In Progress=${PROJECT.status.inProgress}, Done=${PROJECT.status.done}.
- Revision round (text): \`gh project item-edit --project-id ${PROJECT.id} --id <itemId> --field-id ${PROJECT.revisionRoundFieldId} --text "<n>"\`.
- Reviewers (text): \`gh project item-edit --project-id ${PROJECT.id} --id <itemId> --field-id ${PROJECT.reviewersFieldId} --text "<summary>"\`.`;
const COMMENT_HELP = `LEAVE A TRAIL — post your work as a GitHub issue comment (\`gh issue comment N -R ${REPO} --body "..."\`) so the human can follow what happened. Keep it tight and factual; do NOT paste the whole diff or file contents.`;

const RULES = `Obey CLAUDE.md (bun never npm; locality of behavior; CVA + shadcn primitives; design tokens, no hardcoded values; axios not fetch; expressive names over comments; context7 for library docs). This is a real-money Iran product: Farsi-first/RTL, integer-rial money via money.ts (no floats), server-authoritative pricing, tenant isolation on every mutation. Parent PRD is issue #1.`;
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
        "if not found, why (no milestones left / current milestone fully blocked-on-human or not-ready)",
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
    notReady: {
      type: "array",
      description:
        "open milestone issues excluded for a NON-terminal reason (missing ready-for-agent, or gated by an open out-of-run blocker) — they keep the milestone incomplete",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["number", "title", "reason"],
        properties: {
          number: { type: "number" },
          title: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
};
const IMPL_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "criteriaAddressed", "testsPassing", "needsHuman", "headSha"],
  properties: {
    summary: { type: "string" },
    criteriaAddressed: { type: "array", items: { type: "string" } },
    testsPassing: { type: "boolean" },
    needsHuman: { type: "boolean" },
    issueBaseSha: {
      type: "string",
      description:
        "round 1 only: the branch HEAD captured BEFORE this issue's first commit (git rev-parse HEAD right after checkout) — the review base for the whole issue",
    },
    headSha: {
      type: "string",
      description: "the branch HEAD after this round's commit(s) were pushed",
    },
    humanAsk: {
      type: "string",
      description: "category + exact decision/value needed + what is blocked",
    },
    touchesUi: {
      type: "boolean",
      description: "true if this change adds/alters a user-facing screen or route",
    },
    touchesI18n: {
      type: "boolean",
      description: "true if this change touches translations, locale, dir, or number/digit formatting",
    },
    runnableSurface: {
      type: "boolean",
      description: "true if the change affects a route/endpoint a QA agent can hit over HTTP",
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
const BOARD_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ran", "findings", "needsHuman", "verdict"],
  properties: {
    ran: {
      type: "boolean",
      description:
        "false if this reviewer self-skipped (issue out of its scope) or could not run (no browser, app would not boot)",
    },
    skipReason: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["board", "severity", "title", "detail"],
        properties: {
          board: {
            type: "string",
            description: "errors | styling | business-logic | rtl-i18n",
          },
          severity: {
            type: "string",
            enum: ["critical", "high", "medium", "low"],
          },
          title: { type: "string" },
          detail: { type: "string" },
        },
      },
    },
    needsHuman: { type: "boolean" },
    humanAsk: { type: "string" },
    verdict: { type: "string" },
  },
};
const ORG_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["done"],
  properties: { done: { type: "boolean" }, notes: { type: "string" } },
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

const critHigh = (board) =>
  board && board.ran
    ? (board.findings || []).filter(
        (f) => f.severity === "critical" || f.severity === "high",
      )
    : [];
// A lens counts as a clean pass when it self-skipped (ran=false) or produced no
// critical/high finding. null (never assessed) is NOT clean — it must be run.
const boardClean = (board) =>
  !!(board && (board.ran === false || critHigh(board).length === 0));

phase("Select");
const sel = await agent(
  `Select and claim the next workable MILESTONE in ${REPO}. ${AUTH}

- Milestones run in order M1, M2, … (\`gh api repos/${REPO}/milestones --jq 'sort_by(.title)'\`). The pick is the LOWEST-titled milestone that still has open issues. You may not skip ahead: if an earlier milestone has any open issue, that earlier milestone is the pick.
- For the picked milestone, list its open issues: \`gh issue list -R ${REPO} --milestone "<title>" --state open --limit 100 --json number,title,labels,body\`.
- Ensure the labels \`agent-integrated\`, \`blocked-on-human\`, and \`in-progress\` exist (\`gh label create ... || true\`).
- Build the WORKABLE set in ASCENDING issue-number order. An open issue is workable only if ALL of these hold:
  • it is NOT labeled \`agent-integrated\` (already on the branch) and NOT \`blocked-on-human\` (awaiting a human decision);
  • it is labeled \`ready-for-agent\` (the agent-readiness gate) OR labeled \`hitl\` (HITL issues are carried in so they can be escalated — set hitl=true for them, they need no ready-for-agent label);
  • every \`#N\` parsed from its body's "## Blocked by" section is satisfied. A blocker is satisfied when it is CLOSED (\`gh issue view N -R ${REPO} --json state,milestone\`), OR it is an EARLIER issue (lower number) in THIS milestone that is itself in this run's workable set (ascending order guarantees it lands on the branch first). A blocker in an EARLIER milestone MUST be CLOSED.
- Any OPEN issue in the milestone excluded for a NON-terminal reason — missing the \`ready-for-agent\` label (and not hitl), or gated by a still-open out-of-run blocker — goes into \`notReady\` as {number, title, reason}. Do NOT put \`agent-integrated\`/\`blocked-on-human\` issues in notReady.
- Do NOT bulk-claim issues here: labels and Project status are claimed per-issue when each one actually starts. Just prepare the branch: \`git checkout main && git pull\`; if branch \`feat/m<milestoneNumber>-<short-slug>\` exists check it out and \`git rebase main\`, else create it from main.
- If a workable set exists, return found=true with milestone, milestoneNumber, branch, the issues array (each with parsed acceptanceCriteria), and notReady.
- If the picked milestone has NO workable issues (all remaining are blocked-on-human and/or not-ready): return found=false, reason naming the milestone and the blocked / not-ready issue numbers. Do NOT create a branch.
- If NO milestone has open issues: return found=false, reason "all milestones complete".`,
  { label: "select", phase: "Select", schema: SELECT_SCHEMA, model: "haiku" },
);

if (!sel || !sel.found) {
  return {
    done: true,
    reason: (sel && sel.reason) || "selection agent produced no result",
  };
}
const notReady = sel.notReady || [];
log(
  `Milestone ${sel.milestone} on ${sel.branch} — ${sel.issues.length} workable issue(s)${notReady.length ? `, ${notReady.length} not-ready` : ""}`,
);

phase("Implement & Review");
const integrated = [];
const escalated = [];

for (const iss of sel.issues) {
  const issueRef = `#${iss.number} ("${iss.title}")`;
  const criteriaList = (iss.acceptanceCriteria || []).map((c) => `- ${c}`).join("\n");

  if (iss.hitl) {
    escalated.push({
      number: iss.number,
      title: iss.title,
      ask: `[HITL] This issue is gated on a human decision (see issue #${iss.number} body and the PRD #1 plan). Make the decision(s), then remove the \`hitl\` and \`blocked-on-human\` labels and add \`ready-for-agent\` to let the agent implement it.`,
    });
    log(`#${iss.number}: HITL — escalating without implementing`);
    continue;
  }

  let approved = false;
  let escalation = null;
  let round = 0;
  let lastBlocking = null;
  let lastSummary = "code:? qa:? design:?";
  let issueBaseSha = null;
  let prevHeadSha = null;
  let code = null;
  let qa = null;
  let design = null;

  while (round < MAX_ROUNDS) {
    round++;
    const fixBlock = lastBlocking
      ? `\n\nThis is round ${round}. The previous review panel did NOT pass the gate. Address EVERY critical/high item below (medium/low are advisory polish — apply if cheap):\n${JSON.stringify(lastBlocking, null, 2)}`
      : "";

    const impl = await agent(
      `Implement GitHub issue ${issueRef} in ${REPO} on the SHARED milestone branch \`${sel.branch}\` (other issues from this milestone are committed here too — build on them, do not revert them). ${AUTH}
${RULES}
${ESCALATE}
${PROJECT_HELP}
${COMMENT_HELP}

Acceptance criteria (definition of done — satisfy EVERY one):
${criteriaList}

Steps:
1. \`git checkout ${sel.branch}\`. ${round === 1 ? `IMMEDIATELY capture the current HEAD as the review base and return it as issueBaseSha (\`git rev-parse HEAD\`) — reviewers diff from this point so they read ONLY this issue's changes, not the whole milestone branch. Then CLAIM the issue so the board shows it is being worked on: add the \`in-progress\` label (\`gh issue edit ${iss.number} -R ${REPO} --add-label in-progress\`) and set its Project Status to "In Progress".` : `(already claimed + base captured in round 1)`}
2. Set the Project "Revision round" field for this issue to "${round}".
3. Read issue #${iss.number} + PRD #1 + its plan comments + any referenced ADRs + the relevant code. For money/payments/auth/schema work write tests FIRST, then implement. Update the docs/ tree + relevant ADR. Run typecheck, lint, and tests and fix failures (do NOT run the Next.js build unless the issue requires it).
4. Commit only this issue's work (end the message with the Co-Authored-By: Claude trailer) and push the branch. Return the new branch HEAD as headSha (\`git rev-parse HEAD\`).
5. Post an issue comment titled "🤖 Implementer · round ${round}" summarising what you changed, the commit(s), which acceptance criteria you addressed, and test status. If you hit an escalation condition, stop per the contract, set needsHuman=true with humanAsk, and say so in the comment.

Also report, for relevance-gating the reviewers: touchesUi (user-facing screen/route added or changed), touchesI18n (translations/locale/dir/number formatting), runnableSurface (a route/endpoint reachable over HTTP).${fixBlock}`,
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

    const touchesUi = !impl || impl.touchesUi !== false;
    const touchesI18n = !!(impl && impl.touchesI18n);
    const runnable = !impl || impl.runnableSurface !== false;

    if (round === 1 && impl && impl.issueBaseSha) issueBaseSha = impl.issueBaseSha;
    const headSha = (impl && impl.headSha) || sel.branch;
    const fullRange = issueBaseSha
      ? `${issueBaseSha}..${headSha}`
      : `origin/main...${sel.branch}`;
    const roundDelta = prevHeadSha ? `${prevHeadSha}..${headSha}` : fullRange;
    const scopeNote = `COST RULE — review ONLY this issue's changes, never the whole milestone branch. This issue's full delta is \`git diff ${fullRange}\`. ${prevHeadSha ? `Since the previous round only \`${roundDelta}\` changed — concentrate your re-review there; everything before it you already reviewed.` : ``} Read only files inside that diff; do NOT re-read unrelated files or paste file contents. If a SHA is unavailable, fall back to the commits authored for issue #${iss.number}.`;

    // Skip-green-lenses: the code lens runs every round (it always has a new
    // commit to verify); QA/design re-run only when relevant AND not already a
    // clean pass — a green lens is carried forward unchanged (Promise.resolve).
    const runQa = runnable && !boardClean(qa);
    const runDesign = touchesUi && !boardClean(design);

    [code, qa, design] = await parallel([
      () =>
        agent(
          `You are an INDEPENDENT CODE reviewer (you did not write this code). Review the work for issue ${issueRef} on branch \`${sel.branch}\` in ${REPO}. ${AUTH}
${RULES}
${ESCALATE}
${COMMENT_HELP}

Acceptance criteria the change must satisfy:
${criteriaList}

${scopeNote}

Do: \`git fetch\`, read the changed files in scope, and run typecheck, lint, and tests ONCE (you own test execution — QA and design will NOT re-run them). Evaluate each acceptance criterion (met / not met) and hunt for correctness bugs, security/tenant-isolation gaps, money-handling errors (must be integer rial, no floats), RTL/Farsi correctness, and violations of CLAUDE.md or the PRD's decisions.

Set approved=true ONLY if EVERY acceptance criterion is met AND there are no blocking issues AND tests/typecheck/lint pass. If the change cannot ship without a human decision per the escalation contract, set needsHuman=true with a precise humanAsk instead of inventing an answer. Otherwise list precise blocking items.

Finally, post an issue comment titled "🔎 Code review · round ${round}" with your verdict (approved or the blocking list). The implementer summary (verify against the diff, do not trust): ${impl ? impl.summary : "n/a"}`,
          {
            label: `code #${iss.number} r${round}`,
            phase: "Implement & Review",
            schema: REVIEW_SCHEMA,
            model: "opus",
            effort: "medium",
          },
        ),
      () =>
        runQa
          ? agent(
              `You are an INDEPENDENT QA agent for issue ${issueRef} on branch \`${sel.branch}\` in ${REPO}. You verify the RUNNING app, BROWSER-FREE (HTTP + dev-server log only — never drive a browser, so you never contend with the design reviewer). Do NOT run the unit test suite (the code reviewer owns it); you check runtime behaviour only. ${AUTH}
${COMMENT_HELP}

${scopeNote}

Only the routes touched by this issue's delta are in scope — do not sweep the whole app. \`git checkout ${sel.branch} && bun install\`; start the dev server on an isolated port (\`PORT=3011 bun run dev\`) in the background; hit the affected routes over HTTP (curl) and read the dev-server log. Populate the "errors" board with: 5xx responses, hydration warnings, console errors, blank/empty renders, failed requests — each with a severity (critical | high | medium | low). If the app will not boot, set ran=false with the reason (non-blocking). Tear the server down when done.

Post an issue comment titled "🧪 QA · round ${round}" with the errors board (or the skip reason). Return ran, findings[], and verdict.`,
              {
                label: `qa #${iss.number} r${round}`,
                phase: "Implement & Review",
                schema: BOARD_SCHEMA,
                model: "sonnet",
                effort: "medium",
              },
            )
          : Promise.resolve(qa),
      () =>
        runDesign
          ? agent(
              `You are an INDEPENDENT DESIGN reviewer for issue ${issueRef} on branch \`${sel.branch}\` in ${REPO}. You drive a LOCAL Chrome and use the app as a Farsi (RTL) user, applying the \`impeccable\` skill (critique / detect / audit) against PRODUCT.md + DESIGN.md. Do NOT run the unit test suite. ${AUTH}
${COMMENT_HELP}

${scopeNote}

touchesI18n=${touchesI18n}. Only the screens touched by this issue's delta are in scope — do not audit unrelated screens. \`git checkout ${sel.branch} && bun install\`; start the dev server (\`PORT=3012 bun run dev\`); open it in Chrome and exercise the affected screens. Populate boards, each finding with a severity:
- "styling": layout, spacing, responsive framing, design-system/token consistency, anti-"AI-slop".
- "business-logic": dead-end / orphan routes, missing actions (e.g. no pay entry), can't re-order, cart not clearing, wrong totals.
- "rtl-i18n": ONLY if touchesI18n — untranslated strings, wrong \`dir\`, digit/number formatting, LTR flash, wrong default locale.
If you cannot drive a browser in this environment (it can't reach the local dev server), set ran=false with that reason — do NOT block on it; the other reviewers remain the gate. Tear the server down when done.

Post an issue comment titled "🎨 Design review · round ${round}" with your boards (or the skip reason). Return ran, findings[], and verdict.`,
              {
                label: `design #${iss.number} r${round}`,
                phase: "Implement & Review",
                schema: BOARD_SCHEMA,
                model: "opus",
                effort: "medium",
              },
            )
          : Promise.resolve(design),
    ]);

    const humanFlag = [code, qa, design].find((r) => r && r.needsHuman);
    if (humanFlag) {
      escalation = {
        number: iss.number,
        title: iss.title,
        ask: humanFlag.humanAsk || "A reviewer flagged a human decision is required.",
      };
      break;
    }

    const qaBlock = critHigh(qa);
    const designBlock = critHigh(design);
    const codeOk = !!(code && code.approved);

    const codeMark = code
      ? code.approved
        ? "code:✓"
        : `code:✗(${(code.blocking || []).length})`
      : "code:?";
    const qaMark = !qa
      ? "qa:n/a"
      : !qa.ran
        ? "qa:skip"
        : qaBlock.length
          ? `qa:✗(${qaBlock.length})`
          : "qa:✓";
    const designMark = !design
      ? "design:n/a"
      : !design.ran
        ? "design:skip"
        : designBlock.length
          ? `design:✗(${designBlock.length})`
          : "design:✓";
    lastSummary = `r${round} ${codeMark} ${qaMark} ${designMark}`;

    if (codeOk && qaBlock.length === 0 && designBlock.length === 0) {
      approved = true;
      break;
    }

    lastBlocking = {
      code: code ? code.blocking || [] : [],
      qa: qaBlock,
      design: designBlock,
    };
    log(
      `#${iss.number} ${lastSummary}: gate failed — ${(code ? (code.blocking || []).length : 0) + qaBlock.length + designBlock.length} crit/high item(s)`,
    );
    prevHeadSha = headSha;
  }

  const outcome = escalation ? "escalated" : approved ? "integrated" : "nonconvergence";
  await agent(
    `GitHub bookkeeping for issue ${issueRef} in ${REPO} — outcome: ${outcome.toUpperCase()}. ${AUTH}
${PROJECT_HELP}

The review panel summary this run: ${lastSummary}. Set the Project "Reviewers" field for this issue to "${lastSummary}".

Then apply the outcome:
${
  outcome === "integrated"
    ? `- INTEGRATED (panel passed): swap labels \`gh issue edit ${iss.number} -R ${REPO} --remove-label in-progress --add-label agent-integrated\` and set Project Status to "Done". Do NOT close the issue (the milestone PR closes it on merge).`
    : outcome === "escalated"
      ? `- ESCALATED (needs a human decision): \`gh issue edit ${iss.number} -R ${REPO} --remove-label in-progress --add-label blocked-on-human\`, post ONE issue comment titled "⛔ Escalated to human" containing this exact ask: ${JSON.stringify(escalation.ask)} (skip if an identical comment already exists). Leave Project Status as "In Progress".`
      : `- NON-CONVERGENCE (panel never passed in ${MAX_ROUNDS} rounds): \`gh issue edit ${iss.number} -R ${REPO} --remove-label in-progress --add-label blocked-on-human\`, post ONE issue comment titled "⛔ Escalated — review did not converge" listing the last blocking items: ${JSON.stringify(lastBlocking ? lastBlocking : {})}. Leave Project Status as "In Progress".`
}
Return done=true.`,
    {
      label: `organize #${iss.number}`,
      phase: "Implement & Review",
      schema: ORG_SCHEMA,
      model: "haiku",
    },
  );

  if (outcome === "integrated") {
    integrated.push({ number: iss.number, title: iss.title });
    log(`#${iss.number}: integrated onto ${sel.branch} → Project:Done`);
  } else if (outcome === "escalated") {
    escalated.push(escalation);
    log(`#${iss.number}: escalated — ${escalation.ask.slice(0, 80)}`);
  } else {
    escalated.push({
      number: iss.number,
      title: iss.title,
      ask: `Implement↔review panel did not converge in ${MAX_ROUNDS} rounds. Last blocking items: ${JSON.stringify(lastBlocking ? lastBlocking : {})}`,
    });
    log(`#${iss.number}: escalated — non-convergence`);
  }
}

phase("Ship");
const ship = await agent(
  `Finalize the milestone "${sel.milestone}" PR for branch \`${sel.branch}\` in ${REPO}. ${AUTH}

Per-issue labels and Project status are ALREADY live (each issue was claimed when it started, and set to agent-integrated/Project:Done on integration or blocked-on-human on escalation as it finished). Do NOT re-stamp them — only reconcile if you spot a drift.

This run integrated these issues onto the branch: ${JSON.stringify(integrated.map((i) => i.number))}.
This run escalated these issues (need a human decision): ${JSON.stringify(escalated, null, 2)}.
Open milestone issues that were NOT workable this run (not yet ready / still blocked): ${JSON.stringify(notReady, null, 2)}.

Do, in order:
1. Push \`${sel.branch}\`.
2. Sanity-check labels match the lists above (integrated → \`agent-integrated\`, escalated → \`blocked-on-human\`); fix only genuine drift. Not-ready issues keep their labels untouched.
3. Determine completeness: list the milestone's still-open issues NOT labeled \`agent-integrated\` (\`gh issue list --milestone "${sel.milestone}" --state open\`). The milestone is COMPLETE only if that list is empty.
4. Find any existing open PR for \`${sel.branch}\` (\`gh pr list --head ${sel.branch}\`). If one exists, UPDATE it (title/body, and toggle draft↔ready with \`gh pr ready\` / \`gh pr ready --undo\`) rather than opening a new one. Otherwise create it.
   - The PR body must begin with a \`Closes #<n>\` line for EVERY \`agent-integrated\` issue in the milestone (so merging closes them), map what shipped to the milestone's issues, and contain two clear sections: "## Needs your decision" listing every escalated issue and its ask, and "## Not yet ready" listing every notReady issue and its reason. Write "none" under a section that is empty.
   - If the milestone is COMPLETE: make it a READY PR titled \`${sel.milestone}\`.
   - If NOT complete: make it a DRAFT PR — the "Needs your decision" / "Not yet ready" sections are the gate; merging waits until those are resolved and their issues integrated.
5. Never modify or close issue #1.

Return the PR url and whether it is a draft.`,
  { label: "ship", phase: "Ship", schema: SHIP_SCHEMA, model: "sonnet" },
);

return {
  done: false,
  milestone: sel.milestone,
  branch: sel.branch,
  integrated: integrated.map((i) => i.number),
  escalated: escalated.map((e) => ({ issue: e.number, ask: e.ask })),
  notReady: notReady.map((n) => ({ issue: n.number, reason: n.reason })),
  prUrl: ship ? ship.prUrl : null,
  draft: ship ? ship.draft : true,
  needsHuman: escalated.length > 0,
  // Each milestone ends in ONE PR that you sign off + merge before the next
  // milestone can branch from main, so always pause the outer loop here.
  stopLoop: true,
};
