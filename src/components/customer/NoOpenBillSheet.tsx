"use client";

import * as React from "react";
import { BellOff } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { Button } from "@/components/ui/Button";
import { makeT, dirFor } from "@/lib/i18n";

interface NoOpenBillSheetProps {
  open: boolean;
  onClose: () => void;
  lang: string;
  onBrowseMenu: () => void;
}

export function NoOpenBillSheet({
  open,
  onClose,
  lang,
  onBrowseMenu,
}: NoOpenBillSheetProps) {
  const t = makeT(lang);
  const dir = dirFor(lang);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("payBill")}
      dir={dir}
      closeLabel={t("back")}
    >
      <div className="px-5 pb-8 pt-4" dir={dir}>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-2 text-muted">
            <BellOff size={28} aria-hidden />
          </div>
          <p className="max-w-xs text-sm text-muted leading-relaxed">
            {t("noOpenBillWaiter")}
          </p>
        </div>
        <div className="mt-6 space-y-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              onClose();
              onBrowseMenu();
            }}
          >
            {t("viewMenu")}
          </Button>
        </div>
      </div>
    </Sheet>
  );
}
