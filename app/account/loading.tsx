export default function AccountLoading() {
  return (
    <main className="section-shell animate-pulse py-10 md:py-14">
      <div className="h-10 w-56 rounded bg-card" />
      <div className="mt-8 grid gap-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="h-36 rounded-lg border border-border bg-card" />
        ))}
      </div>
    </main>
  );
}