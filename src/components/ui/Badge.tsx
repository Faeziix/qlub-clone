import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full font-semibold",
  {
    variants: {
      variant: {
        default: "bg-surface-2 text-muted px-2.5 py-1 text-xs",
        brand: "bg-brand-soft text-brand px-2.5 py-1 text-xs",
        success: "bg-green-100 text-green-700 px-2.5 py-1 text-xs",
        danger: "bg-red-100 text-red-700 px-2.5 py-1 text-xs",
        warning: "bg-amber-100 text-amber-700 px-2.5 py-1 text-xs",
        cta: "bg-cta-soft text-cta px-2.5 py-1 text-xs",
      },
      size: {
        sm: "px-2 py-0.5 text-[11px]",
        md: "px-2.5 py-1 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props} />
  );
}

const DIET_BADGE_STYLES: Record<string, string> = {
  vegetarian: "bg-green-100 text-green-700",
  vegan: "bg-emerald-100 text-emerald-700",
  "gluten-free": "bg-amber-100 text-amber-700",
  spicy: "bg-red-100 text-red-700",
  new: "bg-blue-100 text-blue-700",
  popular: "bg-brand-soft text-brand",
  "chef-special": "bg-purple-100 text-purple-700",
  "contains-nuts": "bg-orange-100 text-orange-700",
  halal: "bg-teal-100 text-teal-700",
};

const DIET_BADGE_LABELS: Record<string, string> = {
  vegetarian: "گیاهی",
  vegan: "وگان",
  "gluten-free": "بدون گلوتن",
  spicy: "تند",
  new: "جدید",
  popular: "پرطرفدار",
  "chef-special": "پیشنهاد سرآشپز",
  "contains-nuts": "حاوی آجیل",
  halal: "حلال",
};

function DietBadge({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        DIET_BADGE_STYLES[tag] ?? "bg-surface-2 text-muted"
      )}
    >
      {DIET_BADGE_LABELS[tag] ?? tag}
    </span>
  );
}

export { Badge, DietBadge, badgeVariants };
export type { BadgeProps };
