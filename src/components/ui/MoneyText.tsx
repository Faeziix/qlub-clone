import * as React from "react";
import { cn } from "@/lib/utils";
import { formatRialAsTomanPersian } from "@/lib/toman-formatter";

interface MoneyTextProps extends React.HTMLAttributes<HTMLSpanElement> {
  rial: bigint;
  muted?: boolean;
  size?: "sm" | "md" | "lg";
}

const sizeClasses: Record<string, string> = {
  sm: "text-sm",
  md: "text-base",
  lg: "text-xl",
};

function MoneyText({ rial, muted = false, size = "md", className, ...props }: MoneyTextProps) {
  const formatted = formatRialAsTomanPersian(rial);

  return (
    <span
      data-money
      dir="rtl"
      className={cn(
        "font-semibold tabular-nums",
        sizeClasses[size],
        muted && "text-muted",
        className
      )}
      {...props}
    >
      {formatted}
    </span>
  );
}

export { MoneyText };
export type { MoneyTextProps };
