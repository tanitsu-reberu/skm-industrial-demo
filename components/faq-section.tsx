import { Badge } from "@/components/ui/badge";
import { faqItems } from "@/lib/faq";

export function FaqSection() {
  return (
    <div className="section-shell">
      <div className="mx-auto max-w-3xl">
        <div className="text-center">
          <Badge>Частые вопросы</Badge>
          <h2 className="mt-4 text-balance font-display text-3xl font-semibold text-white sm:text-4xl">
            Отвечаем на вопросы клиентов
          </h2>
        </div>
        <div className="mt-8 grid gap-3">
          {faqItems.map((item) => (
            <details
              key={item.question}
              className="group rounded-lg border border-border bg-card open:border-primary/60"
            >
              <summary className="focus-ring flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 rounded-lg px-5 py-4 text-base font-semibold text-white [&::-webkit-details-marker]:hidden">
                {item.question}
                <span
                  aria-hidden="true"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-muted transition-transform group-open:rotate-45 group-open:border-primary/60 group-open:text-primary"
                >
                  +
                </span>
              </summary>
              <p className="px-5 pb-5 text-base leading-7 text-muted">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
