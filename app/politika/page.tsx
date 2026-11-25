import type { Metadata } from "next";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";
import { contactConsentPath, privacyPolicyFilePath, privacyPolicyMeta } from "@/lib/privacy-policy";
import policy from "./policy.json";

export const metadata: Metadata = {
  title: privacyPolicyMeta.title,
  description: privacyPolicyMeta.description,
  alternates: { canonical: "/politika" },
};

type PolicyBlock =
  | { kind: "heading" | "paragraph"; text: string }
  | { kind: "table"; headers: "rows" | "columns"; rows: string[][][] };

function PolicyTable({ headers, rows }: Extract<PolicyBlock, { kind: "table" }>) {
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full border-collapse text-left text-sm leading-6">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-border align-top last:border-b-0">
              {row.map((cell, columnIndex) => {
                const isColumnHeader = headers === "columns" && rowIndex === 0;
                const isRowHeader = headers === "rows" && columnIndex === 0;
                const Tag = isColumnHeader || isRowHeader ? "th" : "td";
                return (
                  <Tag
                    key={columnIndex}
                    scope={isColumnHeader ? "col" : isRowHeader ? "row" : undefined}
                    className="whitespace-pre-line break-words border-r border-border px-3 py-2 last:border-r-0"
                  >
                    {cell.join("\n")}
                  </Tag>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <PageTransition>
      <main className="section-shell py-12 sm:py-16">
        <article className="mx-auto max-w-3xl">
          <Badge>Документы</Badge>
          <h1 className="mt-4 font-display text-3xl font-semibold leading-tight text-white sm:text-4xl">
            {policy.title.join(" ")}
          </h1>
          <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
            <a className="focus-ring font-medium text-primary underline underline-offset-4" href={privacyPolicyFilePath} download>
              Скачать политику (.docx)
            </a>
            <a className="focus-ring font-medium text-primary underline underline-offset-4" href={contactConsentPath}>
              Согласие для формы «Связаться»
            </a>
          </div>
          <div className="mt-8 space-y-4 text-base leading-7 text-muted">
            {(policy.blocks as PolicyBlock[]).map((block, index) => {
              if (block.kind === "heading") {
                return <h2 key={index} className="pt-3 text-xl font-semibold text-white">{block.text}</h2>;
              }
              if (block.kind === "table") return <PolicyTable key={index} {...block} />;
              return <p key={index} className="whitespace-pre-line break-words">{block.text}</p>;
            })}
          </div>
        </article>
      </main>
    </PageTransition>
  );
}
