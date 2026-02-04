"use client";

import { SessionProvider } from "next-auth/react";

import ThemeProvider from "@/components/ThemeProvider";

type ProvidersProps = {
  children: React.ReactNode;
};

export default function Providers({ children }: ProvidersProps) {
  return (
    <SessionProvider>
      <ThemeProvider />
      {children}
    </SessionProvider>
  );
}
