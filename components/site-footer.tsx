import Link from "next/link";
import { privacyPolicyPath } from "@/lib/privacy-policy";
import { siteConfig } from "@/lib/site-config";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/40">
      <div className="section-shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm text-muted">
          <p className="font-medium text-white">{siteConfig.companyName}</p>
          <p>
            <a href={siteConfig.phoneHref} className="hover:text-white">
              {siteConfig.phone}
            </a>
            {" · "}
            <a href={siteConfig.emailHref} className="hover:text-white">
              {siteConfig.email}
            </a>
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm sm:items-end">
          <Link href={privacyPolicyPath} className="text-muted transition hover:text-white">
            Политика обработки персональных данных
          </Link>
          <p className="text-muted">© {new Date().getFullYear()} {siteConfig.shortName}</p>
        </div>
      </div>
    </footer>
  );
}