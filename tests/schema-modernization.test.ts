/**
 * Tests for issue #8 — Schema modernization: enums, JSON, Iran defaults,
 * translations, orderNumber sequence, audit log.
 *
 * All tests assert against static artefacts (schema.prisma, migration SQL, seed.ts)
 * or pure functions — no live DB connection required.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const SCHEMA_PATH = path.resolve("prisma/schema.prisma");
const MIGRATION_DIR = path.resolve("prisma/migrations");
const SEED_PATH = path.resolve("prisma/seed.ts");

function readSchema(): string {
  return readFileSync(SCHEMA_PATH, "utf-8");
}

function readMigrationSql(name: string): string {
  return readFileSync(path.join(MIGRATION_DIR, name, "migration.sql"), "utf-8");
}

function migrationExists(name: string): boolean {
  return existsSync(path.join(MIGRATION_DIR, name, "migration.sql"));
}

function readSeed(): string {
  return readFileSync(SEED_PATH, "utf-8");
}

// ---------------------------------------------------------------------------
// Native enums
// ---------------------------------------------------------------------------
describe("Native Prisma enums", () => {
  it("schema declares EnamadStatus as a native enum", () => {
    expect(readSchema()).toMatch(/^enum EnamadStatus\s*\{/m);
  });

  it("schema declares OrderStatus as a native enum", () => {
    expect(readSchema()).toMatch(/^enum OrderStatus\s*\{/m);
  });

  it("schema declares PaymentStatus as a native enum", () => {
    expect(readSchema()).toMatch(/^enum PaymentStatus\s*\{/m);
  });

  it("schema declares PaymentMethod as a native enum", () => {
    expect(readSchema()).toMatch(/^enum PaymentMethod\s*\{/m);
  });

  it("schema declares SplitType as a native enum", () => {
    expect(readSchema()).toMatch(/^enum SplitType\s*\{/m);
  });

  it("schema declares StaffRole as a native enum", () => {
    expect(readSchema()).toMatch(/^enum StaffRole\s*\{/m);
  });

  it("schema declares TableStatus as a native enum", () => {
    expect(readSchema()).toMatch(/^enum TableStatus\s*\{/m);
  });

  it("schema declares OrderType as a native enum", () => {
    expect(readSchema()).toMatch(/^enum OrderType\s*\{/m);
  });

  it("schema declares OrderSource as a native enum", () => {
    expect(readSchema()).toMatch(/^enum OrderSource\s*\{/m);
  });

  it("baseline migration SQL creates enum types via CREATE TYPE", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('CREATE TYPE "EnamadStatus"');
    expect(sql).toContain('CREATE TYPE "OrderStatus"');
    expect(sql).toContain('CREATE TYPE "PaymentStatus"');
    expect(sql).toContain('CREATE TYPE "StaffRole"');
    expect(sql).toContain('CREATE TYPE "TableStatus"');
  });
});

// ---------------------------------------------------------------------------
// Native Json (JSONB) columns
// ---------------------------------------------------------------------------
describe("Native Json columns (JSONB in Postgres)", () => {
  it("Vendor.supportedLangs is a Json field (not String)", () => {
    const schema = readSchema();
    expect(schema).toMatch(/supportedLangs\s+Json/);
    const supportedLangsLine = schema.split("\n").find((l) => l.includes("supportedLangs"));
    expect(supportedLangsLine).toBeDefined();
    expect(supportedLangsLine).not.toContain("String");
  });

  it("Vendor.tipPresets is a Json field", () => {
    expect(readSchema()).toMatch(/tipPresets\s+Json/);
  });

  it("MenuItem.tags is a Json field", () => {
    expect(readSchema()).toMatch(/tags\s+Json/);
  });

  it("OrderItem.modifiers is a Json field", () => {
    expect(readSchema()).toMatch(/modifiers\s+Json/);
  });

  it("Menu.availability is a Json field", () => {
    expect(readSchema()).toMatch(/availability\s+Json/);
  });

  it("baseline migration uses JSONB for supportedLangs (not TEXT)", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"supportedLangs" JSONB');
  });

  it("baseline migration uses JSONB for tags (not TEXT)", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"tags" JSONB');
  });

  it("baseline migration uses JSONB for modifiers (not TEXT)", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"modifiers" JSONB');
  });
});

// ---------------------------------------------------------------------------
// Iran defaults
// ---------------------------------------------------------------------------
describe("Iran defaults in Vendor model", () => {
  it("currency defaults to IRR", () => {
    expect(readSchema()).toMatch(/currency\s+String\s+@default\("IRR"\)/);
  });

  it("locale defaults to fa", () => {
    expect(readSchema()).toMatch(/locale\s+String\s+@default\("fa"\)/);
  });

  it("timezone defaults to Asia/Tehran", () => {
    expect(readSchema()).toMatch(/timezone\s+String\s+@default\("Asia\/Tehran"\)/);
  });

  it("supportedLangs defaults to [fa, en]", () => {
    expect(readSchema()).toMatch(/supportedLangs\s+Json\s+@default\("\[\\?"fa\\?", ?\\?"en\\?"]/);
  });

  it("country defaults to ir", () => {
    expect(readSchema()).toMatch(/country\s+String\s+@default\("ir"\)/);
  });
});

// ---------------------------------------------------------------------------
// Per-vendor VAT config (default off)
// ---------------------------------------------------------------------------
describe("Per-vendor VAT configuration", () => {
  it("Vendor has vatEnabled field defaulting to false", () => {
    expect(readSchema()).toMatch(/vatEnabled\s+Boolean\s+@default\(false\)/);
  });

  it("Vendor has vatPct field", () => {
    expect(readSchema()).toMatch(/vatPct\s+Float/);
  });
});

// ---------------------------------------------------------------------------
// Translation tables
// ---------------------------------------------------------------------------
describe("Bilingual translation tables", () => {
  it("MenuItemTranslation model exists", () => {
    expect(readSchema()).toMatch(/^model MenuItemTranslation\s*\{/m);
  });

  it("MenuItemTranslation has locale + name fields", () => {
    const schema = readSchema();
    const block = schema.match(/model MenuItemTranslation\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toContain("locale");
    expect(block).toContain("name");
    expect(block).toContain("description");
  });

  it("MenuItemTranslation has @@unique([menuItemId, locale])", () => {
    const schema = readSchema();
    const block = schema.match(/model MenuItemTranslation\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/@@unique\(\[menuItemId, locale\]\)/);
  });

  it("CategoryTranslation model exists", () => {
    expect(readSchema()).toMatch(/^model CategoryTranslation\s*\{/m);
  });

  it("CategoryTranslation has @@unique([categoryId, locale])", () => {
    const schema = readSchema();
    const block = schema.match(/model CategoryTranslation\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/@@unique\(\[categoryId, locale\]\)/);
  });

  it("ModifierGroupTranslation model exists", () => {
    expect(readSchema()).toMatch(/^model ModifierGroupTranslation\s*\{/m);
  });

  it("ModifierGroupTranslation has @@unique([modifierGroupId, locale])", () => {
    const schema = readSchema();
    const block = schema.match(/model ModifierGroupTranslation\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/@@unique\(\[modifierGroupId, locale\]\)/);
  });

  it("baseline migration creates CategoryTranslation table", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('CREATE TABLE "CategoryTranslation"');
  });

  it("baseline migration creates MenuItemTranslation table", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('CREATE TABLE "MenuItemTranslation"');
  });

  it("baseline migration creates ModifierGroupTranslation table", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('CREATE TABLE "ModifierGroupTranslation"');
  });
});

// ---------------------------------------------------------------------------
// Review is per-Payment
// ---------------------------------------------------------------------------
describe("Review is per-Payment (ADR-0007)", () => {
  it("Review model has paymentId field", () => {
    const schema = readSchema();
    const block = schema.match(/model Review\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toContain("paymentId");
  });

  it("Review.paymentId has @unique constraint", () => {
    const schema = readSchema();
    const block = schema.match(/model Review\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/paymentId\s+String\s+@unique/);
  });

  it("Review model does NOT have a direct orderId field", () => {
    const schema = readSchema();
    const block = schema.match(/model Review\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).not.toMatch(/orderId\s+String/);
  });

  it("baseline migration creates Review_paymentId_key unique index", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"Review_paymentId_key"');
  });
});

// ---------------------------------------------------------------------------
// Per-vendor orderNumber sequence
// ---------------------------------------------------------------------------
describe("Per-vendor orderNumber sequence", () => {
  it("Vendor has vendorOrderSeq field", () => {
    expect(readSchema()).toMatch(/vendorOrderSeq\s+Int\s+@default\(0\)/);
  });

  it("Order has @@unique([vendorId, orderNumber])", () => {
    const schema = readSchema();
    const block = schema.match(/model Order\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/@@unique\(\[vendorId, orderNumber\]\)/);
  });

  it("baseline migration creates Order_vendorId_orderNumber_key unique index", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"Order_vendorId_orderNumber_key"');
  });

  it("backfill migration exists for deterministic orderNumber", () => {
    expect(migrationExists("0002_order_number_backfill")).toBe(true);
  });

  it("backfill migration SQL backfills vendorOrderSeq from existing order numbers", () => {
    const sql = readMigrationSql("0002_order_number_backfill");
    expect(sql.toLowerCase()).toMatch(/update\s+"vendor"/i);
    expect(sql.toLowerCase()).toContain("vendororderseq");
  });
});

// ---------------------------------------------------------------------------
// AuditLog model
// ---------------------------------------------------------------------------
describe("AuditLog model", () => {
  it("AuditLog model exists in schema", () => {
    expect(readSchema()).toMatch(/^model AuditLog\s*\{/m);
  });

  it("AuditLog has actorId, vendorId, action, entity, entityId fields", () => {
    const schema = readSchema();
    const block = schema.match(/model AuditLog\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toContain("actorId");
    expect(block).toContain("vendorId");
    expect(block).toContain("action");
    expect(block).toContain("entity");
    expect(block).toContain("entityId");
  });

  it("AuditLog has before and after Json fields for diff capture", () => {
    const schema = readSchema();
    const block = schema.match(/model AuditLog\s*\{[^}]+\}/)?.[0] ?? "";
    expect(block).toMatch(/before\s+Json\?/);
    expect(block).toMatch(/after\s+Json\?/);
  });

  it("baseline migration creates AuditLog table", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('CREATE TABLE "AuditLog"');
  });
});

// ---------------------------------------------------------------------------
// Sub-merchant fields on Vendor
// ---------------------------------------------------------------------------
describe("Sub-merchant fields on Vendor", () => {
  it("Vendor has gatewaySubMerchantId field", () => {
    expect(readSchema()).toMatch(/gatewaySubMerchantId\s+String\?/);
  });

  it("Vendor has payoutIban field", () => {
    expect(readSchema()).toMatch(/payoutIban\s+String\?/);
  });

  it("Vendor has ibanVerifiedAt field", () => {
    expect(readSchema()).toMatch(/ibanVerifiedAt\s+DateTime\?/);
  });

  it("Vendor has nationalId field", () => {
    expect(readSchema()).toMatch(/nationalId\s+String\?/);
  });

  it("Vendor has eNamadStatus field using EnamadStatus enum", () => {
    expect(readSchema()).toMatch(/eNamadStatus\s+EnamadStatus\s+@default\(none\)/);
  });

  it("baseline migration includes gatewaySubMerchantId on Vendor table", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"gatewaySubMerchantId"');
  });

  it("baseline migration includes eNamadStatus with EnamadStatus enum type", () => {
    const sql = readMigrationSql("0001_baseline_postgres");
    expect(sql).toContain('"eNamadStatus" "EnamadStatus"');
  });
});

// ---------------------------------------------------------------------------
// Seed uses Iran defaults
// ---------------------------------------------------------------------------
describe("Seed file uses Iran defaults", () => {
  it("seed creates vendors with IRR currency", () => {
    expect(readSeed()).toContain('"IRR"');
  });

  it("seed creates vendors with country ir", () => {
    expect(readSeed()).toContain('"ir"');
  });

  it("seed creates vendors with fa locale", () => {
    expect(readSeed()).toContain('"fa"');
  });

  it("seed creates vendors with Asia/Tehran timezone", () => {
    expect(readSeed()).toContain('"Asia/Tehran"');
  });
});
