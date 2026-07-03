import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import { Header } from "@/components/header";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "СКМ | Вентиляция и холодоснабжение",
  description: "Монтаж, ремонт и обслуживание систем вентиляции, чиллеров, фанкойлов, чистых помещений и холодоснабжения.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
        className={`${inter.variable} ${manrope.variable} font-sans antialiased`}
        style={{ backgroundColor: "#0a0a0a", color: "#ffffff" }}
      >
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  );
}
