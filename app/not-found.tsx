import Link from "next/link";

export default function NotFound() {
  return (
    <main className="section-shell grid min-h-[60vh] place-items-center py-12 sm:py-16">
      <section className="max-w-xl text-center" aria-labelledby="not-found-heading">
        <p className="text-sm font-semibold text-primary">Ошибка 404</p>
        <h1 id="not-found-heading" className="mt-3 font-display text-3xl font-semibold text-white sm:text-4xl">
          Страница не найдена
        </h1>
        <p className="mt-4 text-base leading-7 text-muted">Проверьте адрес или вернитесь на главную страницу.</p>
        <Link href="/" className="focus-ring mt-6 inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-card px-5 text-sm font-semibold text-white hover:border-primary">
          На главную
        </Link>
      </section>
    </main>
  );
}
