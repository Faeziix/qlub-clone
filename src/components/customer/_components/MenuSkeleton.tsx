import { cn } from "@/lib/utils";

function SkeletonBlock({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-lg", className)} />;
}

function ItemRowSkeleton() {
  return (
    <div className="flex w-full gap-3 rounded-2xl bg-surface p-3 shadow-card">
      <div className="min-w-0 flex-1 space-y-2 py-1">
        <SkeletonBlock className="h-4 w-2/3" />
        <SkeletonBlock className="h-3 w-full" />
        <SkeletonBlock className="h-3 w-4/5" />
        <SkeletonBlock className="mt-1 h-4 w-1/4" />
      </div>
      <SkeletonBlock className="h-24 w-24 shrink-0 rounded-xl" />
    </div>
  );
}

function CategorySectionSkeleton() {
  return (
    <section className="pt-5">
      <SkeletonBlock className="mb-3 h-6 w-1/3" />
      <div className="space-y-3">
        <ItemRowSkeleton />
        <ItemRowSkeleton />
        <ItemRowSkeleton />
      </div>
    </section>
  );
}

export function MenuSkeleton() {
  return (
    <div className="min-h-screen bg-bg md:bg-surface-2">
      <div className="mx-auto max-w-app min-h-screen bg-bg md:shadow-float">
        {/* Header skeleton */}
        <div className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex items-center gap-2 px-4 py-3">
            <SkeletonBlock className="h-9 w-9 rounded-full" />
            <SkeletonBlock className="h-5 w-40 flex-1" />
            <SkeletonBlock className="h-9 w-9 rounded-full" />
          </div>
          <div className="px-4 pb-3">
            <SkeletonBlock className="h-10 w-full rounded-xl" />
          </div>
          {/* Tab row skeleton */}
          <div className="flex gap-1 px-3 pb-1">
            <SkeletonBlock className="h-8 w-20 shrink-0 rounded" />
            <SkeletonBlock className="h-8 w-20 shrink-0 rounded" />
          </div>
          {/* Category chips skeleton */}
          <div className="flex gap-2 px-4 py-3">
            <SkeletonBlock className="h-9 w-20 shrink-0 rounded-full" />
            <SkeletonBlock className="h-9 w-24 shrink-0 rounded-full" />
            <SkeletonBlock className="h-9 w-18 shrink-0 rounded-full" />
            <SkeletonBlock className="h-9 w-22 shrink-0 rounded-full" />
          </div>
        </div>

        {/* Item sections skeleton */}
        <main className="px-4">
          <CategorySectionSkeleton />
          <CategorySectionSkeleton />
        </main>
      </div>
    </div>
  );
}

export function LandingSkeleton() {
  return (
    <div className="min-h-screen bg-bg md:bg-surface-2">
      <div className="mx-auto max-w-app min-h-screen bg-bg md:shadow-float">
        {/* Cover image skeleton */}
        <SkeletonBlock className="h-60 w-full rounded-none" />
        {/* Vendor info card skeleton */}
        <div className="relative -mt-12 rounded-t-3xl bg-surface px-5 pb-6 pt-14 text-center shadow-float">
          <SkeletonBlock className="absolute inset-x-0 -top-12 mx-auto h-24 w-24 rounded-2xl" />
          <SkeletonBlock className="mx-auto h-7 w-48" />
          <SkeletonBlock className="mx-auto mt-2 h-4 w-64" />
        </div>
        {/* Menu cards skeleton */}
        <div className="px-5 pt-4">
          <SkeletonBlock className="mb-3 h-4 w-28" />
          <div className="grid grid-cols-2 gap-4">
            <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
            <SkeletonBlock className="aspect-[4/3] w-full rounded-2xl" />
          </div>
        </div>
      </div>
    </div>
  );
}
