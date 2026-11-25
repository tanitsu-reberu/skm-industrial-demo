import type { Metadata } from "next";
import paragraphs from "./consent.json";

export const metadata: Metadata = {
  title: "Согласие на обработку персональных данных | СКМ",
  alternates: { canonical: "/soglasie" },
};

export default function ContactConsentPage() {
  return (
    <main className="section-shell py-12 sm:py-16">
      <article className="mx-auto max-w-3xl space-y-5 text-base leading-7 text-muted">
        <h1 className="font-display text-3xl font-semibold leading-tight text-white">
          {paragraphs.slice(0, 2).join(" ")}
        </h1>
        <a
          href="/documents/soglasie-na-obrabotku-personalnyh-dannyh.docx"
          download
          className="focus-ring inline-block font-medium text-primary underline underline-offset-4"
        >
          Скачать согласие (.docx)
        </a>
        {paragraphs.slice(2).map((paragraph, index) => (
          <p key={index} className="whitespace-pre-line break-words">{paragraph}</p>
        ))}
      </article>
    </main>
  );
}
