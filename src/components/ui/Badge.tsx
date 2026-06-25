import { cn } from "@/lib/utils";

const tagStyles: Record<string, string> = {
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

const tagLabels: Record<string, string> = {
  vegetarian: "Vegetarian",
  vegan: "Vegan",
  "gluten-free": "Gluten-free",
  spicy: "Spicy",
  new: "New",
  popular: "Popular",
  "chef-special": "Chef's special",
  "contains-nuts": "Contains nuts",
  halal: "Halal",
};

export function DietBadge({ tag }: { tag: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        tagStyles[tag] ?? "bg-surface-2 text-muted"
      )}
    >
      {tagLabels[tag] ?? tag}
    </span>
  );
}

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}
