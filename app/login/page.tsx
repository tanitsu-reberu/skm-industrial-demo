import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { PageTransition } from "@/components/page-transition";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Вход | СКМ",
};

export default function LoginPage() {
  return (
    <PageTransition>
      <main className="section-shell grid min-h-[calc(100vh-4rem)] place-items-center py-12">
        <div className="w-full max-w-xl">
          <Badge>Пароль не нужен</Badge>
          <h1 className="mt-4 font-display text-4xl font-semibold text-white sm:text-5xl">Вход по email-коду</h1>
          <p className="mt-4 leading-7 text-muted">
            Введите email, получите 6-значный одноразовый код и продолжите оформление заказа или работу в кабинете.
          </p>
          <div className="mt-8">
            <Suspense>
              <AuthForm />
            </Suspense>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
