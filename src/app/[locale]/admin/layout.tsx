import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { SuperadminSidebar } from "@/components/admin/SuperadminSidebar";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const VENDOR_ROUTES = [
  "/admin/orders",
  "/admin/menu",
  "/admin/tables",
  "/admin/reviews",
  "/admin/settings",
];

function isVendorRoute(pathname: string): boolean {
  return VENDOR_ROUTES.some((r) => pathname === r || pathname.startsWith(r + "/"));
}

function isDashboardRoot(pathname: string): boolean {
  return pathname === "/admin" || pathname === "/fa/admin" || pathname === "/en/admin";
}

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const pathname = h.get("x-invoke-path") ?? h.get("x-pathname") ?? "";

  const session = await getSession();

  if (!session) {
    if (pathname.includes("/admin/login")) return <>{children}</>;
    return <>{children}</>;
  }

  if (session.role === "superadmin") {
    if (isVendorRoute(pathname) || isDashboardRoot(pathname)) {
      redirect("/admin/superadmin");
    }

    return (
      <div className="min-h-screen bg-bg lg:flex">
        <SuperadminSidebar
          user={{
            name: session.name,
            email: session.email,
            role: session.role,
          }}
        />
        <main className="min-w-0 flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
            {children}
          </div>
        </main>
      </div>
    );
  }

  const tCommon = await getTranslations("admin.common");

  const vendor = session.vendorId
    ? await db.vendor.findUnique({ where: { id: session.vendorId } })
    : null;

  const vendorName = vendor?.name ?? tCommon("noVendor");

  return (
    <div className="min-h-screen bg-bg lg:flex">
      <AdminSidebar
        user={{
          name: session.name,
          email: session.email,
          role: session.role,
        }}
        vendorName={vendorName}
      />
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
