import { Suspense } from "react";
import { AuthenticatorForm } from "@/components/auth-form";
import { PageTransition } from "@/components/page-transition";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Вход | СКМ",
  robots: {
    index: false,
    follow: false,
  },
};

export default function LoginPage() {
  const geoEnabled = Boolean(process.env.ADMIN_GEO_PROXY_TOKEN);
  return (
    <PageTransition>
      <main className="section-shell grid min-h-[calc(100vh-4rem)] place-items-center py-12">
        <div className="w-full max-w-xl min-w-0">
          <h1 className="font-display text-4xl font-semibold leading-tight text-white sm:text-5xl">Вход администратора</h1>
          <p className="mt-4 max-w-prose leading-7 text-muted">
            Введите текущий код из приложения «Пароли».
          </p>
          <div className="mt-8">
            <Suspense>
              <AuthenticatorForm />
            </Suspense>
          </div>
          {geoEnabled ? (
            <p className="mt-4 text-xs text-muted">
              <a href="https://db-ip.com" className="underline underline-offset-2">Геолокация по IP от DB-IP</a>
            </p>
          ) : null}
        </div>
      </main>
    </PageTransition>
  );
}
