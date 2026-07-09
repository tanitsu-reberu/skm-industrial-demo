import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { Header } from "@/components/header";
import { SiteFooter } from "@/components/site-footer";
import { JivoChat } from "@/components/jivo-chat";
import { getJivoConfig } from "@/lib/jivo";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-skm",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://service-skm.ru"),
  title: {
    default: "СКМ | Вентиляция и холодоснабжение",
    template: "%s",
  },
  description:
    "Монтаж, ремонт и обслуживание вентиляции, чиллеров и фанкойлов для коммерческих и промышленных объектов.",
  applicationName: "СКМ",
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
        {jivo ? <JivoChat widgetId={jivo.widgetId} authOnly={jivo.authOnly} /> : null}
      </body>
    </html>
  );
}
