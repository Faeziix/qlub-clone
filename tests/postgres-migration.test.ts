import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const SCHEMA_PATH = path.resolve("prisma/schema.prisma");
const MIGRATION_DIR = path.resolve("prisma/migrations");
const ENV_EXAMPLE_PATH = path.resolve(".env.example");
const PACKAGE_JSON_PATH = path.resolve("package.json");

function readSchemaFile(): string {
  return readFileSync(SCHEMA_PATH, "utf-8");
}

function readPackageJson(): Record<string, unknown> {
  return JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf-8"));
}

describe("Prisma datasource — PostgreSQL configuration", () => {
  it("uses postgresql as the datasource provider", () => {
    const schema = readSchemaFile();
    expect(schema).toMatch(/provider\s*=\s*"postgresql"/);
  });

  it("reads the pooled connection from DATABASE_URL env var", () => {
    const schema = readSchemaFile();
    expect(schema).toMatch(/url\s*=\s*env\("DATABASE_URL"\)/);
  });

  it("reads the direct (unpooled) connection from DIRECT_URL env var for migrations", () => {
    const schema = readSchemaFile();
    expect(schema).toMatch(/directUrl\s*=\s*env\("DIRECT_URL"\)/);
  });

  it("does not reference sqlite anywhere in the datasource block", () => {
    const schema = readSchemaFile();
    const datasourceBlock = schema.match(/datasource\s+\w+\s*\{[^}]*\}/)?.[0] ?? "";
    expect(datasourceBlock).not.toContain("sqlite");
    expect(datasourceBlock).not.toContain("file:");
  });
});

describe("Baseline migration — prisma/migrations/", () => {
  it("baseline migration directory exists", () => {
    expect(existsSync(MIGRATION_DIR)).toBe(true);
  });

  it("contains at least one migration folder", () => {
    const entries = readdirSync(MIGRATION_DIR, { withFileTypes: true });
    const migrationFolders = entries.filter(
      (e: { isDirectory(): boolean }) => e.isDirectory()
    );
    expect(migrationFolders.length).toBeGreaterThanOrEqual(1);
  });

  it("baseline migration SQL file exists and is non-empty", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    expect(existsSync(baselinePath)).toBe(true);
    const sql = readFileSync(baselinePath, "utf-8");
    expect(sql.length).toBeGreaterThan(100);
  });

  it("baseline migration SQL creates all required tables", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    const sql = readFileSync(baselinePath, "utf-8");
    const requiredTables = [
      "Vendor",
      "Menu",
      "Category",
      "MenuItem",
      "ModifierGroup",
      "ModifierOption",
      "DiningTable",
      "Order",
      "OrderItem",
      "Payment",
      "Review",
      "StaffUser",
      "AuditLog",
    ];
    for (const table of requiredTables) {
      expect(sql).toContain(`CREATE TABLE "${table}"`);
    }
  });

  it("baseline migration SQL uses BIGINT for all money columns", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    const sql = readFileSync(baselinePath, "utf-8");
    const moneyColumns = [
      '"price" BIGINT',
      '"priceDelta" BIGINT',
      '"subtotal" BIGINT',
      '"serviceCharge" BIGINT',
      '"tax" BIGINT',
      '"discount" BIGINT',
      '"tipAmount" BIGINT',
      '"total" BIGINT',
      '"amountPaid" BIGINT',
      '"amount" BIGINT',
      '"unitPrice" BIGINT',
      '"lineTotal" BIGINT',
    ];
    for (const col of moneyColumns) {
      expect(sql).toContain(col);
    }
  });

  it("baseline migration SQL does not use FLOAT or REAL for money columns", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    const sql = readFileSync(baselinePath, "utf-8");
    const lines = sql.split("\n");
    const moneyColumnNames = [
      "price",
      "priceDelta",
      "subtotal",
      "serviceCharge",
      "tax",
      "discount",
      "tipAmount",
      "total",
      "amountPaid",
      "amount",
      "unitPrice",
      "lineTotal",
    ];
    for (const line of lines) {
      for (const col of moneyColumnNames) {
        if (line.includes(`"${col}"`) && (line.includes("FLOAT") || line.includes("REAL"))) {
          throw new Error(
            `Money column "${col}" must not use FLOAT or REAL — found: ${line.trim()}`
          );
        }
      }
    }
    expect(true).toBe(true);
  });

  it("baseline migration SQL defines native enums for OrderStatus, PaymentStatus, StaffRole", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    const sql = readFileSync(baselinePath, "utf-8");
    expect(sql).toContain('CREATE TYPE "OrderStatus"');
    expect(sql).toContain('CREATE TYPE "PaymentStatus"');
    expect(sql).toContain('CREATE TYPE "StaffRole"');
    expect(sql).toContain('CREATE TYPE "PaymentMethod"');
    expect(sql).toContain('CREATE TYPE "TableStatus"');
  });

  it("baseline migration SQL uses JSONB for JSON columns (not TEXT)", () => {
    const baselinePath = path.join(
      MIGRATION_DIR,
      "0001_baseline_postgres",
      "migration.sql"
    );
    const sql = readFileSync(baselinePath, "utf-8");
    expect(sql).toContain('"supportedLangs" JSONB');
    expect(sql).toContain('"tipPresets" JSONB');
    expect(sql).toContain('"tags" JSONB');
    expect(sql).toContain('"modifiers" JSONB');
    expect(sql).toContain('"availability" JSONB');
  });
});

describe("Build script — prisma migrate deploy wired in", () => {
  it("build script includes prisma generate before next build", () => {
    const pkg = readPackageJson();
    const build = (pkg as { scripts: Record<string, string> }).scripts.build;
    expect(build).toContain("prisma generate");
  });

  it("build script includes prisma migrate deploy before next build", () => {
    const pkg = readPackageJson();
    const build = (pkg as { scripts: Record<string, string> }).scripts.build;
    expect(build).toContain("prisma migrate deploy");
    const generatePos = build.indexOf("prisma generate");
    const deployPos = build.indexOf("prisma migrate deploy");
    const buildPos = build.indexOf("next build");
    expect(generatePos).toBeLessThan(deployPos);
    expect(deployPos).toBeLessThan(buildPos);
  });
});

describe(".env.example — Postgres placeholders", () => {
  it(".env.example contains DATABASE_URL placeholder for pooled Postgres", () => {
    const env = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
    expect(env).toContain("DATABASE_URL=");
    expect(env).toContain("postgresql://");
  });

  it(".env.example contains DIRECT_URL placeholder for unpooled Postgres migrations", () => {
    const env = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
    expect(env).toContain("DIRECT_URL=");
    expect(env).toContain("postgresql://");
  });

  it(".env.example does not reference SQLite file: URL", () => {
    const env = readFileSync(ENV_EXAMPLE_PATH, "utf-8");
    expect(env).not.toContain("file:./dev.db");
    expect(env).not.toContain("file:./");
  });
});
