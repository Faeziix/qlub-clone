"use client";
import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
  className?: string;
  /** full = near full-height (item detail), auto = content height (drawers) */
  height?: "auto" | "full" | "tall";
}

/** Bottom sheet / drawer used everywhere in the customer app (qlub pattern). */
export function Sheet({
  open,
  onClose,
  children,
  title,
  className,
  height = "auto",
}: SheetProps) {
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div
        className="absolute inset-0 bg-black/40 animate-fade-in"
        onClick={onClose}
        aria-hidden
      />
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          "relative w-full max-w-app bg-surface rounded-t-3xl shadow-sheet animate-slide-up flex flex-col",
          height === "full" && "h-[92vh]",
          height === "tall" && "max-h-[85vh]",
          height === "auto" && "max-h-[85vh]",
          className
        )}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div className="absolute left-1/2 -translate-x-1/2 top-2 h-1.5 w-10 rounded-full bg-line" />
          {title ? (
            <h2 className="text-lg font-bold pt-2">{title}</h2>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className="ml-auto mt-1 grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-muted hover:text-ink"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {children}
        </div>
      </div>
    </div>
  );
}
