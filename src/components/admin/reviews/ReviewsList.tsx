"use client";

import { useMemo, useState } from "react";
import { Star } from "lucide-react";
import { StarRating } from "@/components/ui/StarRating";
import { EmptyRow } from "@/components/admin/ui";
import { cn, initials, timeAgo } from "@/lib/utils";

export type ReviewRow = {
  id: string;
  rating: number;
  foodRating: number | null;
  serviceRating: number | null;
  ambienceRating: number | null;
  comment: string | null;
  guestName: string | null;
  createdAt: string;
  orderNumber: string | null;
};

const FILTERS = [
  { key: "all", label: "All" },
  { key: "5", label: "5" },
  { key: "4", label: "4" },
  { key: "3", label: "3" },
  { key: "2", label: "2" },
  { key: "1", label: "1" },
] as const;

function SubRating({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-xs font-medium text-muted">{label}</span>
      <div className="inline-flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <Star
            key={n}
            size={14}
            className={cn(
              n <= value ? "fill-amber-400 text-amber-400" : "text-line"
            )}
          />
        ))}
      </div>
    </div>
  );
}

export function ReviewsList({ reviews }: { reviews: ReviewRow[] }) {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: reviews.length };
    for (let r = 1; r <= 5; r++) {
      c[String(r)] = reviews.filter((rv) => Math.round(rv.rating) === r).length;
    }
    return c;
  }, [reviews]);

  const filtered = useMemo(() => {
    if (filter === "all") return reviews;
    return reviews.filter((r) => Math.round(r.rating) === Number(filter));
  }, [reviews, filter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition-colors",
                active
                  ? "border-brand bg-brand text-brand-fg"
                  : "border-line bg-surface text-muted hover:bg-surface-2"
              )}
            >
              {f.key !== "all" && (
                <Star
                  size={13}
                  className={cn(
                    active ? "fill-brand-fg text-brand-fg" : "fill-amber-400 text-amber-400"
                  )}
                />
              )}
              <span>{f.label}</span>
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs font-bold tabular-nums",
                  active ? "bg-brand-fg/20 text-brand-fg" : "bg-surface-2 text-muted"
                )}
              >
                {counts[f.key] ?? 0}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <EmptyRow>
          {reviews.length === 0
            ? "No reviews yet. Guest feedback will appear here after diners rate their visit."
            : `No ${filter}-star reviews yet.`}
        </EmptyRow>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((r) => {
            const name = r.guestName?.trim() || "Anonymous";
            return (
              <div
                key={r.id}
                className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-soft text-sm font-bold text-brand">
                      {r.guestName?.trim() ? initials(name) : "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold">{name}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <StarRating value={Math.round(r.rating)} readOnly size={16} />
                        <span className="text-xs font-semibold tabular-nums text-muted">
                          {r.rating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <span className="shrink-0 text-xs text-muted">
                    {timeAgo(r.createdAt)}
                  </span>
                </div>

                {r.comment?.trim() && (
                  <p className="text-sm leading-relaxed text-ink">
                    &ldquo;{r.comment.trim()}&rdquo;
                  </p>
                )}

                {(r.foodRating || r.serviceRating || r.ambienceRating) && (
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5 rounded-xl bg-surface-2 px-3 py-2.5">
                    {r.foodRating ? (
                      <SubRating label="Food" value={r.foodRating} />
                    ) : null}
                    {r.serviceRating ? (
                      <SubRating label="Service" value={r.serviceRating} />
                    ) : null}
                    {r.ambienceRating ? (
                      <SubRating label="Ambience" value={r.ambienceRating} />
                    ) : null}
                  </div>
                )}

                {r.orderNumber && (
                  <div className="flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-muted">Order</span>
                    <span className="rounded-lg bg-surface-2 px-2 py-1 text-xs font-bold tabular-nums text-ink">
                      #{r.orderNumber}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
