import { getTranslations, getLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/rbac";
import { PageHeader } from "@/components/admin/ui";
import { getWaiterPageData } from "./actions";
import { OrderEntryClient } from "./_components/OrderEntryClient";

export const dynamic = "force-dynamic";

export default async function OrderEntryPage() {
  const session = await requireRole("staff");

  if (session.role === "superadmin") redirect("/admin/superadmin");
  if (!session.vendorId) redirect("/admin/login");

  const t = await getTranslations("admin.orderEntry");
  const locale = await getLocale();

  const { tables, menuCategories, vendorRates } = await getWaiterPageData();

  return (
    <div>
      <PageHeader title={t("pageTitle")} subtitle={t("pageSubtitle")} />
      <OrderEntryClient
        tables={tables}
        menuCategories={menuCategories}
        locale={locale}
        vendorRates={vendorRates}
        t={{
          selectTable: t("selectTable"),
          noTables: t("noTables"),
          openOrder: t("openOrder"),
          noOpenOrder: t("noOpenOrder"),
          searchMenu: t("searchMenu"),
          runningBill: t("runningBill"),
          subtotal: t("subtotal"),
          serviceCharge: t("serviceCharge"),
          tax: t("tax"),
          total: t("total"),
          emptyCart: t("emptyCart"),
          emptyCartHint: t("emptyCartHint"),
          addItem: t("addItem"),
          qty: t("qty"),
          notes: t("notes"),
          orderCreated: t("orderCreated"),
          itemsAppended: t("itemsAppended"),
          errorGeneral: t("errorGeneral"),
          table: t("table"),
          cancel: t("cancel"),
          items: t("items"),
          modifiers: t("modifiers"),
          required: t("required"),
          optional: t("optional"),
          chooseUpTo: t("chooseUpTo"),
          submitOrder: t("submitOrder"),
          appendOrder: t("appendOrder"),
          selectModifiers: t("selectModifiers"),
          tableStatus_available: t("tableStatus_available"),
          tableStatus_occupied: t("tableStatus_occupied"),
          tableStatus_bill_requested: t("tableStatus_bill_requested"),
          orderNumber: t("orderNumber"),
          changeTable: t("changeTable"),
          walkIn: t("walkIn"),
          removeItem: t("removeItem"),
          decreaseQty: t("decreaseQty"),
        }}
      />
    </div>
  );
}
