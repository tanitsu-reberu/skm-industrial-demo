import Link from "next/link";
import { privacyPolicyPath } from "@/lib/privacy-policy";
import { siteConfig } from "@/lib/site-config";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-surface/40">
      <div className="section-shell flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1 text-sm text-muted">
          <p className="font-medium text-white">ООО «Сервис Компрессорных Машин»</p>
          <p>ИНН 9717171905 · ОГРН 1247700722840</p>
          <p>129164, г. Москва, Ракетный бульвар, д. 16</p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <a href={siteConfig.phoneHref} className="inline-flex min-h-11 items-center hover:text-white">
              {siteConfig.phone}
            </a>
            {" · "}
            <a href={siteConfig.emailHref} className="inline-flex min-h-11 items-center hover:text-white">
              {siteConfig.email}
            </a>
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm sm:items-end">
          <Link href={privacyPolicyPath} className="inline-flex min-h-11 items-center text-muted transition hover:text-white">
            Политика обработки персональных данных
          </Link>
          <Link href="/soglasie" className="inline-flex min-h-11 items-center text-muted transition hover:text-white">
            Согласие на обработку данных
          </Link>
          <p className="text-muted">© {new Date().getFullYear()} {siteConfig.shortName}</p>
        </div>
      </div>
    </footer>
  );
}
