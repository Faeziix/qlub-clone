// Stub for `server-only` in the vitest environment.
// In production Next.js, `server-only` throws when imported from a client
// component. In tests (Node/vitest), we just no-op it so server modules
// (orders.ts, db.ts) can be imported and their Prisma client mocked.
export {};
