"use client";
import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { X } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const sheetContentVariants = cva(
  "relative w-full max-w-app bg-surface rounded-t-3xl shadow-sheet flex flex-col animate-slide-up",
  {
    variants: {
      height: {
        auto: "max-h-[85vh]",
        tall: "max-h-[85vh]",
        full: "h-[92vh]",
      },
    },
    defaultVariants: {
      height: "auto",
    },
  }
);

interface SheetProps extends VariantProps<typeof sheetContentVariants> {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
  dir?: "rtl" | "ltr";
}

function Sheet({
  open,
  onClose,
  children,
  title,
  description,
  className,
  height,
  dir,
}: SheetProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[200] bg-black/40 animate-fade-in data-[state=closed]:animate-fade-out"
          dir={dir}
        />
        <div
          className="fixed inset-0 z-[300] flex items-end justify-center"
          dir={dir}
        >
          <Dialog.Content
            className={cn(
              sheetContentVariants({ height }),
              className
            )}
            aria-describedby={description ? undefined : "sheet-no-desc"}
          >
            <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
              <div className="absolute inset-x-0 mx-auto top-2 h-1.5 w-10 rounded-full bg-line" />
              {title ? (
                <Dialog.Title className="text-lg font-bold pt-2">
                  {title}
                </Dialog.Title>
              ) : (
                <VisuallyHidden.Root asChild>
                  <Dialog.Title>Sheet</Dialog.Title>
                </VisuallyHidden.Root>
              )}
              {description && (
                <VisuallyHidden.Root asChild>
                  <Dialog.Description>{description}</Dialog.Description>
                </VisuallyHidden.Root>
              )}
              {!description && (
                <VisuallyHidden.Root>
                  <span id="sheet-no-desc" />
                </VisuallyHidden.Root>
              )}
              <Dialog.Close
                className="ms-auto mt-1 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
                aria-label="بستن"
              >
                <X size={18} aria-hidden />
              </Dialog.Close>
            </div>
            <div className="flex-1 overflow-y-auto overscroll-contain">
              {children}
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export { Sheet };
export type { SheetProps };
