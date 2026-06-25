import { Star, Utensils, ConciergeBell, Sparkles } from "lucide-react";
import { requireSession } from "@/app/[locale]/admin/actions";
import { db } from "@/lib/db";
import { PageHeader, Card, StatCard } from "@/components/admin/ui";
import { StarRating } from "@/components/ui/StarRating";
import { cn } from "@/lib/utils";
import { ReviewsList, type ReviewRow } from "@/components/admin/reviews/ReviewsList";

export const dynamic = "force-dynamic";

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100;
}

export default async function ReviewsPage() {
  const session = await requireSession();

  const reviews = await db.review.findMany({
    where: session.vendorId ? { vendorId: session.vendorId } : undefined,
    orderBy: { createdAt: "desc" },
  });

  const total = reviews.length;
  const overallAvg = avg(reviews.map((r) => r.rating));

  const foodVals = reviews.map((r) => r.foodRating).filter((v): v is number => !!v);
  const serviceVals = reviews
    .map((r) => r.serviceRating)
    .filter((v): v is number => !!v);
  const ambienceVals = reviews
    .map((r) => r.ambienceRating)
    .filter((v): v is number => !!v);

  const distribution = [5, 4, 3, 2, 1].map((star) => {
    const count = reviews.filter((r) => Math.round(r.rating) === star).length;
    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
    return { star, count, pct };
  });

  const rows: ReviewRow[] = reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    foodRating: r.foodRating,
    serviceRating: r.serviceRating,
    ambienceRating: r.ambienceRating,
    comment: r.comment,
    guestName: r.guestName,
    createdAt: r.createdAt.toISOString(),
    orderNumber: null,
  }));

  return (
    <div>
      <PageHeader
        title="Reviews"
        subtitle="Guest feedback and satisfaction across visits."
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="flex flex-col items-center justify-center gap-2 text-center">
          <div className="text-5xl font-extrabold tabular-nums">
            {overallAvg.toFixed(1)}
          </div>
          <StarRating value={Math.round(overallAvg)} readOnly size={22} />
          <p className="text-sm text-muted">
            {total} {total === 1 ? "review" : "reviews"}
          </p>
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-3 text-sm font-bold">Rating distribution</h3>
          <div className="space-y-2">
            {distribution.map(({ star, count, pct }) => (
              <div key={star} className="flex items-center gap-3">
                <div className="flex w-12 shrink-0 items-center gap-1 text-sm font-semibold tabular-nums">
                  <span>{star}</span>
                  <Star size={13} className="fill-amber-400 text-amber-400" />
                </div>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                  <div
                    className={cn(
                      "h-full rounded-full bg-brand transition-all",
                      pct === 0 && "bg-transparent"
                    )}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-5 grid gap-5 sm:grid-cols-3">
        <StatCard
          label="Food"
          value={foodVals.length ? avg(foodVals).toFixed(1) : "—"}
          icon={<Utensils size={18} />}
          hint={`${foodVals.length} rated`}
        />
        <StatCard
          label="Service"
          value={serviceVals.length ? avg(serviceVals).toFixed(1) : "—"}
          icon={<ConciergeBell size={18} />}
          hint={`${serviceVals.length} rated`}
        />
        <StatCard
          label="Ambience"
          value={ambienceVals.length ? avg(ambienceVals).toFixed(1) : "—"}
          icon={<Sparkles size={18} />}
          hint={`${ambienceVals.length} rated`}
        />
      </div>

      <div className="mt-8">
        <ReviewsList reviews={rows} />
      </div>
    </div>
  );
}
