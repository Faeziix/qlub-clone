# ADR-0006 — Disaster Recovery Baseline: Neon-Managed PITR + Restore Runbook

**Status:** Accepted
**Date:** 2026-06-26
**Issue:** #6 — Postgres migration + real migrations + DR baseline
**Track:** A (Vercel + Neon, staging/build). Track B (domestic production) DR is a separate concern; see §7 below.

---

## Context

The Qlub Iran platform moves from SQLite with no migrations to a managed Postgres instance (Neon) on the `feat/m2-data-money-core` milestone branch. As a money ledger, the database must have a documented and tested recovery posture. This ADR records:

1. What Neon provides out-of-the-box for point-in-time recovery (PITR)
2. How to perform a PITR or branch-based restore
3. Target RTO and RPO for the Track A staging environment
4. The escalation path to the production (Track B) DR spec

---

## Decision

### 1. DR Provider: Neon-Managed (Track A)

Disaster recovery for Track A (staging/build) is **fully managed by Neon**. We rely on Neon's built-in capabilities rather than standing up a self-managed physical standby or rolling our own WAL archiving:

| Capability | Neon provision |
|---|---|
| **Continuous WAL archiving** | Enabled on all Neon projects by default; every write is durably persisted to object storage |
| **Point-in-time restore (PITR)** | Available via the Neon console and API; restore to any timestamp within the retention window |
| **Storage-level redundancy** | Neon stores data across multiple availability zones in the selected region (eu-central-1 for this project) |
| **History retention** | Project-tier dependent; Free tier: 1-day; Launch/Scale tiers: 7-30 days. **For staging this is acceptable; production (Track B) requires ≥ 30 days with quarterly tested restores** |
| **Branching** | Neon's copy-on-write branch mechanism lets us create a restore point or test environment without provisioning new hardware |

### 2. Backup Retention — Confirmed

- **Current project tier:** Free (staging/build only — zero real PII or payment data)
- **Retention window:** 1 day (free tier); upgrading to Launch tier yields 7 days; Scale yields 30 days
- **Recommendation for any environment holding real schema/seed data:** upgrade to Launch tier (7-day retention); for production substitute see §7

### 3. Restore Methods

#### Method A — Neon Console (Point-in-Time Restore)

1. Open the [Neon Console](https://console.neon.tech) → select the project → **Restore** tab
2. Select the branch to restore (e.g. `main`)
3. Choose **"Restore to a specific timestamp"** and enter the target UTC time
4. Neon creates a new branch at that point in time; the original branch is unchanged
5. Inspect the restored branch, verify data integrity (run `prisma migrate status` + spot-check tables)
6. If the restore is correct, **swap the branch**: update `DATABASE_URL` and `DIRECT_URL` to point to the restored branch's connection strings
7. Notify the team; re-run `prisma migrate deploy` to confirm migration state is consistent

#### Method B — Neon Branching (Clone for DR Test)

1. In the Neon Console → **Branches** → **Create branch**
2. Set the parent branch (`main`) and the "From timestamp" to the desired point
3. Connect to the new branch using its connection strings to verify data
4. Swap `DATABASE_URL` / `DIRECT_URL` to the branch if the restore passes inspection

#### Method C — Neon API (Automated Restore)

```bash
# Restore branch to a specific timestamp via Neon API
curl -X POST https://console.neon.tech/api/v2/projects/{project_id}/branches \
  -H "Authorization: Bearer $NEON_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "branch": {
      "parent_id": "br-main-branch-id",
      "parent_timestamp": "2026-06-25T10:00:00Z",
      "name": "restore-2026-06-25"
    }
  }'
```

After creating the branch, update `DATABASE_URL` and `DIRECT_URL` in the deployment environment to point to the restored branch.

### 4. Prisma Migrate State After Restore

After any restore:
1. Connect to the restored branch
2. Run `prisma migrate status` to verify migration history is intact
3. If the `_prisma_migrations` table shows the baseline as applied, the migration state is consistent
4. If there is a mismatch, run `prisma migrate deploy` to reapply any pending migrations

### 5. Target RTO / RPO — Track A (Staging)

| Metric | Target | Rationale |
|---|---|---|
| **RPO (Recovery Point Objective)** | ≤ 1 day (free tier) / ≤ 1 hour (Launch+ tier) | Staging contains only synthetic data; a 1-day RPO is acceptable for the build environment |
| **RTO (Recovery Time Objective)** | ≤ 30 minutes | Neon branch creation is near-instant; the 30-minute budget covers incident detection + branch creation + connection string rotation + `migrate deploy` verification |

For **Track B (domestic production)**, the targets are stricter:
- **RPO:** ≤ 5 minutes (continuous WAL archiving to a second domestic region, verified by quarterly restore drills)
- **RTO:** ≤ 2 hours (automated failover to standby + manual validation of money ledger integrity)

### 6. Quarterly Restore Drill (Required)

Regardless of track, a restore drill must be performed **at least quarterly**:

1. Pick a timestamp 24–48 hours ago
2. Create a Neon branch at that timestamp
3. Run the application seeder and migration status check against the branch
4. Verify that a known record (e.g. a seeded vendor) exists and that the money columns have the correct BigInt values
5. Destroy the test branch
6. Record the drill result in the project incident log (date, duration, outcome)

This drill is the only way to guarantee that the restore path actually works before a real incident.

### 7. Track B (Domestic Production) — Out of Scope for This ADR

Track B is the Iran-facing production environment and runs on domestic infrastructure (not Neon). Its DR requirements are **stricter**:

- Postgres primary + synchronous standby with streaming replication
- Continuous WAL archiving to a second domestic data centre
- Off-box encrypted backups (retained ≥ 30 days, stored in a distinct blast radius)
- Automated failover + quarterly tested restore drill with a documented restore playbook
- An **append-mostly ledger** (no hard deletes on payment rows; soft-delete + audit trail)
- A **money integrity check** post-restore: verify `sum(Payment.amount WHERE status='succeeded')` matches the last reconciliation snapshot before the failure event

A separate ADR will be written for Track B when domestic infrastructure is selected (Phase 5).

### 8. What This ADR Does NOT Cover

- Neon point-in-time restore of the `_prisma_migrations` shadow database used during `migrate dev` — shadow databases are ephemeral and do not need DR
- Application-layer backup of media assets (menu images, logos) — these live in object storage with its own replication; covered separately
- PII retention / GDPR right-to-erasure — out of scope until domestic production (Track B) is operational

---

## Consequences

- **Positive:** Zero operational overhead for DR on Track A; Neon handles WAL archiving, storage redundancy, and branch-based restore.
- **Positive:** PITR is available within minutes of a data loss event; no snapshot scheduling to manage.
- **Positive:** Branching enables safe restore testing without touching the production branch.
- **Risk:** Free-tier 1-day retention window means data loss older than 24 hours is unrecoverable on the free tier. Mitigated by: (a) Track A holds only synthetic data; (b) upgrading to Launch tier for any environment with real schema history.
- **Deferred:** Track B DR (domestic production) is deferred to Phase 5 and requires a separate ADR. The Track B money ledger must not go live without a tested restore drill and a documented `money-integrity-check` post-restore procedure.
