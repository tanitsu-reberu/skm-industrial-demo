import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Header } from "@/components/header";
import { JivoChatLazy } from "@/components/jivo-chat-lazy";
import { SiteFooter } from "@/components/site-footer";
import { getJivoConfig } from "@/lib/jivo";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-skm",
  display: "swap",
});

const assetRecoveryScript = `
(function () {
  var retryParam = "__skm_assets";

  function retryWithFreshHtml() {
    var url = new URL(window.location.href);
    if (url.searchParams.has(retryParam)) return;
    url.searchParams.set(retryParam, Date.now().toString());
    window.location.replace(url.toString());
  }

  window.addEventListener("error", function (event) {
    var target = event.target;
    if (!target || !target.tagName) return;

    var tagName = target.tagName.toUpperCase();
    var failedStylesheet = tagName === "LINK" && target.rel === "stylesheet";
    var failedNextScript = tagName === "SCRIPT" && target.src && target.src.indexOf("/_next/static/") !== -1;
    if (failedStylesheet || failedNextScript) retryWithFreshHtml();
  }, true);

  window.addEventListener("load", function () {
    var url = new URL(window.location.href);
    if (!url.searchParams.has(retryParam)) return;
    url.searchParams.delete(retryParam);
    window.history.replaceState(null, "", url.pathname + url.search + url.hash);
  }, { once: true });
})();`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark",
  themeColor: "#0A0A0A",
};

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru"),
  title: {
    default: "СКМ | Вентиляция и холодоснабжение",
    template: "%s",
  },
  description:
    "Монтаж, ремонт и обслуживание вентиляции, чиллеров и фанкойлов для коммерческих и промышленных объектов.",
  applicationName: "СКМ",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48", type: "image/x-icon" },
      { url: "/icon.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  keywords: [
    "вентиляция",
    "чиллеры",
    "фанкойлы",
    "монтаж вентиляции",
    "обслуживание чиллеров",
    "ремонт фанкойлов",
    "холодоснабжение",
  ],
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "СКМ",
    title: "СКМ | Вентиляция и холодоснабжение",
    description:
      "Монтаж, ремонт и обслуживание вентиляции, чиллеров и фанкойлов для коммерческих и промышленных объектов.",
    url: "/",
    images: [
      {
        url: "/logo.png",
        width: 1200,
        height: 630,
        alt: "СКМ - сервис систем вентиляции и холодоснабжения",
      },
    ],
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const jivo = getJivoConfig();

  return (
    <html lang="ru" className="dark">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html:
              "html,body{background:#0a0a0a;color:#fff;margin:0;min-height:100%}body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}",
          }}
        />
        <script dangerouslySetInnerHTML={{ __html: assetRecoveryScript }} />
      </head>
      <body
        className={`${manrope.variable} font-sans antialiased`}
        style={{ backgroundColor: "#0a0a0a", color: "#ffffff" }}
      >
        <div className="flex min-h-screen flex-col">
          <Header />
          {children}
          <SiteFooter />
        </div>
        {jivo ? <JivoChatLazy widgetId={jivo.widgetId} authOnly={jivo.authOnly} /> : null}
      </body>
    </html>
  );
}
