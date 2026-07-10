"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";

function ContactFormPlaceholder() {
  return (
    <div className="grid min-h-[320px] animate-pulse gap-3 rounded-lg border border-border bg-card/60 p-4 sm:p-6">
      <div className="h-12 rounded-md bg-surface" />
      <div className="h-12 rounded-md bg-surface" />
      <div className="h-28 rounded-md bg-surface" />
      <div className="h-14 rounded-md bg-surface" />
    </div>
  );
}

export function ContactRequestLazy() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [Form, setForm] = useState<ComponentType | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    let active = true;
    const loadForm = () => {
      void import("@/components/contact-request-form").then((module) => {
        if (active) setForm(() => module.ContactRequestForm);
      });
    };

    if (!("IntersectionObserver" in window)) {
      loadForm();
      return () => {
        active = false;
      };
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        loadForm();
      },
      { rootMargin: "500px 0px" },
    );
    observer.observe(root);

    return () => {
      active = false;
      observer.disconnect();
    };
  }, []);

  return <div ref={rootRef}>{Form ? <Form /> : <ContactFormPlaceholder />}</div>;
}
