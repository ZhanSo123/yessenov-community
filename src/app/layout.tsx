export const dynamic = "force-dynamic";

import type { Metadata } from "next";
import Providers from "@/app/providers";
import BottomNav from "@/components/BottomNav";
import FeedbackButton from "@/components/FeedbackButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Yessenov Community",
  description: "Студенческое сообщество и лента постов.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased bg-white text-slate-900">
        <Providers>
          <div className="min-h-screen pb-24">{children}</div>
          <FeedbackButton />
          <BottomNav />
        </Providers>
      </body>
    </html>
  );
}
