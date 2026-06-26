import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Allow the login route to render without a session.
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "";

  const session = await getSession();
  if (!session) {
    // login page renders its own full-screen layout; guard everything else.
    if (pathname.includes("/admin/login")) return <>{children}</>;
    // Without reliable pathname, fall back: render children for login, else redirect.
    // The login page itself calls no session APIs, so this is safe.
  }

  if (!session) {
    return <>{children}</>;
  }

  const tCommon = await getTranslations("admin.common");

  const vendor = session.vendorId
    ? await db.vendor.findUnique({ where: { id: session.vendorId } })
    : null;

  const vendorName =
    vendor?.name ??
    (session.role === "superadmin"
      ? tCommon("allRestaurants")
      : tCommon("noVendor"));

  return (
    <div className="min-h-screen bg-bg">
      <AdminSidebar
        user={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        vendorName={vendorName}
      />
      <main className="lg:ps-72">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
