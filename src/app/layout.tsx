import type { Metadata } from "next";
import Link from "next/link";
import Providers from "@/app/providers";
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
      <body className="antialiased">
        <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
            <Link href="/" className="text-sm font-semibold text-slate-900">
              Yessenov Community
            </Link>
            <nav className="flex items-center gap-4 text-sm text-slate-600">
              <Link href="/" className="transition hover:text-slate-900">
                For you
              </Link>
              <Link
                href="/?tab=following"
                className="transition hover:text-slate-900"
              >
                Following
              </Link>
            </nav>
          </div>
        </header>
        <Providers>
          {children}
          <FeedbackButton />
        </Providers>
      </body>
    </html>
  );
}
