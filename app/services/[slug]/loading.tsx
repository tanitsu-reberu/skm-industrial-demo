export default function ServiceDetailLoading() {
  return (
    <main className="section-shell animate-pulse py-10 md:py-14">
      <div className="mb-6 h-10 w-40 rounded bg-card" />
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="aspect-[16/11] rounded-lg bg-card" />
        <div className="space-y-4">
          <div className="h-8 w-32 rounded bg-card" />
          <div className="h-12 rounded bg-card" />
          <div className="h-24 rounded bg-card/80" />
          <div className="h-14 w-full rounded-md bg-card" />
        </div>
      </div>
    </main>
  );
}