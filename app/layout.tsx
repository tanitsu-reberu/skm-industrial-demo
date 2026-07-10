import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import { Header } from "@/components/header";
import { JivoChatLazy } from "@/components/jivo-chat-lazy";
import { JsonLd } from "@/components/json-ld";
import { MobileBottomNav } from "@/components/mobile-bottom-nav";
import { SiteFooter } from "@/components/site-footer";
import { assetRecoveryScript } from "@/lib/asset-recovery";
import { organizationJsonLd } from "@/lib/structured-data";
import { criticalCss } from "@/lib/critical-css";
import { getJivoConfig } from "@/lib/jivo";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-skm",
  display: "swap",
  preload: true,
  adjustFontFallback: true,
});

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
        <link rel="preload" href="/logo.webp" as="image" type="image/webp" />
        <style dangerouslySetInnerHTML={{ __html: criticalCss }} />
        <script dangerouslySetInnerHTML={{ __html: assetRecoveryScript }} />
      </head>
      <body
        className={`${manrope.variable} font-sans antialiased`}
        style={{ backgroundColor: "#0a0a0a", color: "#ffffff" }}
      >
        <div className="flex min-h-screen flex-col pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <Header />
          {children}
          <SiteFooter />
        </div>
        <MobileBottomNav />
        {jivo ? <JivoChatLazy widgetId={jivo.widgetId} authOnly={jivo.authOnly} /> : null}
      </body>
    </html>
  );
}
