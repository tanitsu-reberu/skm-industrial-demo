export function CatalogSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="h-11 w-28 rounded-md bg-card md:h-12 md:w-32" />
        ))}
      </div>
      <div className="grid auto-rows-fr gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex h-full flex-col overflow-hidden rounded-lg border border-border bg-card">
            <div className="aspect-[16/10] bg-surface" />
            <div className="space-y-3 p-5 md:p-6">
              <div className="h-7 rounded bg-surface md:h-8" />
              <div className="h-4 rounded bg-surface" />
              <div className="h-4 w-5/6 rounded bg-surface" />
              <div className="h-4 w-2/3 rounded bg-surface" />
              <div className="grid gap-2 pt-2 md:grid-cols-2">
                <div className="h-12 rounded-md bg-surface" />
                <div className="h-12 rounded-md bg-surface" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}