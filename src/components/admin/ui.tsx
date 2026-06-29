import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3 sm:items-end sm:gap-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function Card({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-surface p-5 shadow-card",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  delta,
  icon,
  hint,
}: {
  label: string;
  value: string;
  delta?: { value: string; positive?: boolean };
  icon?: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-muted">{label}</span>
        {icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand">
            {icon}
          </span>
        )}
      </div>
      <div className="truncate text-xl font-extrabold tabular-nums sm:text-2xl">{value}</div>
      <div className="flex min-h-[20px] items-center gap-2 text-xs">
        {delta && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 font-semibold",
              delta.positive
                ? "bg-success/10 text-success"
                : "bg-danger/10 text-danger"
            )}
          >
            {delta.value}
          </span>
        )}
        {hint && <span className="truncate text-muted">{hint}</span>}
      </div>
    </Card>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    paid: "bg-success/10 text-success",
    placed: "bg-blue-100 text-blue-700",
    preparing: "bg-amber-100 text-amber-700",
    ready: "bg-purple-100 text-purple-700",
    served: "bg-teal-100 text-teal-700",
    open: "bg-surface-2 text-muted",
    cancelled: "bg-danger/10 text-danger",
    available: "bg-success/10 text-success",
    occupied: "bg-amber-100 text-amber-700",
    bill_requested: "bg-purple-100 text-purple-700",
    succeeded: "bg-success/10 text-success",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        map[status] ?? "bg-surface-2 text-muted"
      )}
    >
      {status.replace("_", " ")}
    </span>
  );
}

export function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-4 py-12 text-center text-sm leading-relaxed text-muted">
      {children}
    </div>
  );
}
