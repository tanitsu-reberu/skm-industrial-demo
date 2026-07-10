import type { Metadata } from "next";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { privacyPolicyMeta, privacyPolicySections } from "@/lib/privacy-policy";

export const dynamic = "force-static";
export const revalidate = 3600;

export const metadata: Metadata = {
  title: privacyPolicyMeta.title,
  description: privacyPolicyMeta.description,
  alternates: {
    canonical: "/politika",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function PrivacyPolicyPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <Badge>Документы</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-5xl">
            Политика обработки персональных данных
          </h1>
          <p className="mt-4 text-base leading-8 text-muted">
            Настоящая Политика определяет порядок обработки персональных данных пользователей сайта service-skm.ru.
          </p>

          <div className="mt-10 space-y-10">
            {privacyPolicySections.map((section) => (
              <section key={section.title}>
                <h2 className="font-display text-xl font-semibold text-white sm:text-2xl">{section.title}</h2>
                <div className="mt-4 space-y-4">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph} className="text-base leading-8 text-muted">
                      {paragraph}
                    </p>
                  ))}
                  {section.bullets ? (
                    <ul className="list-disc space-y-2 pl-5 text-base leading-8 text-muted">
                      {section.bullets.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </PageTransition>
  );
}