-- Add 'verifying' to PaymentStatus enum
-- Represents the in-flight verification state: callback has arrived and
-- server-side verify() has been initiated but not yet completed.
-- This is the first-writer-wins claim step in the idempotent state machine
-- (issue #21 — payment state machine + idempotency + reconciliation sweep).

ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'verifying' AFTER 'pending';
