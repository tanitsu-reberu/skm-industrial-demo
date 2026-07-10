import { CatalogSkeleton } from "@/components/catalog-skeleton";
import { Badge } from "@/components/ui/badge";

export default function ServicesLoading() {
  return (
    <main className="section-shell py-12 md:py-16">
      <div className="mb-10 max-w-3xl">
        <Badge>Каталог услуг</Badge>
        <div className="mt-4 h-12 w-full max-w-xl animate-pulse rounded-lg bg-card md:h-14" />
        <div className="mt-5 h-20 w-full animate-pulse rounded-lg bg-card/70" />
      </div>
      <CatalogSkeleton />
    </main>
  );
}