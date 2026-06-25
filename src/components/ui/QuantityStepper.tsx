"use client";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  size?: "sm" | "md";
}) {
  const btn =
    size === "sm"
      ? "h-7 w-7"
      : "h-9 w-9";
  return (
    <div className="inline-flex items-center gap-1 rounded-full bg-surface-2 p-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className={cn(
          "grid place-items-center rounded-full bg-surface text-ink shadow-card disabled:opacity-40",
          btn
        )}
        aria-label="Decrease"
      >
        <Minus size={size === "sm" ? 14 : 16} />
      </button>
      <span
        className={cn(
          "min-w-7 text-center font-bold tabular-nums",
          size === "sm" ? "text-sm" : "text-base"
        )}
      >
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className={cn(
          "grid place-items-center rounded-full bg-brand text-brand-fg shadow-card disabled:opacity-40",
          btn
        )}
        aria-label="Increase"
      >
        <Plus size={size === "sm" ? 14 : 16} />
      </button>
    </div>
  );
}
