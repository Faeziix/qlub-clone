import { SignJWT } from "jose";
import { db } from "../src/lib/db";

async function main() {
  const secret = new TextEncoder().encode(
    process.env.AUTH_SECRET ?? "dev-secret-change-me-in-production-please-32chars"
  );
  const email = process.argv[2] ?? "owner@paul.ae";
  const u = await db.staffUser.findUnique({ where: { email } });
  if (!u) throw new Error("no user");
  const token = await new SignJWT({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    vendorId: u.vendorId,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
  process.stdout.write(token);
}

main().then(() => process.exit(0));
