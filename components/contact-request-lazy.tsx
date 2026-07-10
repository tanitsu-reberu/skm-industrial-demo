"use client";

import nextDynamic from "next/dynamic";

const ContactRequestForm = nextDynamic(
  () => import("@/components/contact-request-form").then((mod) => mod.ContactRequestForm),
  {
    ssr: false,
    loading: () => (
      <div className="grid min-h-[320px] animate-pulse gap-3 rounded-lg border border-border bg-card/60 p-4 sm:p-6">
        <div className="h-12 rounded-md bg-surface" />
        <div className="h-12 rounded-md bg-surface" />
        <div className="h-28 rounded-md bg-surface" />
        <div className="h-14 rounded-md bg-surface" />
      </div>
    ),
  },
);

export function ContactRequestLazy() {
  return <ContactRequestForm />;
}