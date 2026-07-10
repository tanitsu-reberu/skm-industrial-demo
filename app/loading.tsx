export default function RootLoading() {
  return (
    <main className="section-shell animate-pulse py-12 md:py-16">
      <div className="h-10 w-48 rounded bg-card md:h-12 md:w-64" />
      <div className="mt-6 h-24 max-w-3xl rounded-lg bg-card/70 md:h-28" />
      <div className="mt-10 grid gap-5 md:grid-cols-2 md:gap-6 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-72 rounded-lg border border-border bg-card md:h-80" />
        ))}
      </div>
    </main>
  );
}