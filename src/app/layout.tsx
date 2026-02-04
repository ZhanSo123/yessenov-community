export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import Providers from "@/app/providers";
import BottomNav from "@/components/BottomNav";
import FeedbackButton from "@/components/FeedbackButton";
import { getServerTranslator } from "@/lib/i18n/server";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-manrope",
  weight: ["400", "500", "600", "700"],
});

export const generateMetadata = async (): Promise<Metadata> => {
  const { t } = await getServerTranslator();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
  };
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { locale } = await getServerTranslator();

  return (
    <html lang={locale} className={manrope.variable}>
      <body className="antialiased">
        <div className="app-bg" aria-hidden="true">
          <div className="app-orb app-orb-1" />
          <div className="app-orb app-orb-2" />
          <div className="app-orb app-orb-3" />
        </div>
        <Providers>
          <div className="min-h-screen pb-24">{children}</div>
          <FeedbackButton />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
