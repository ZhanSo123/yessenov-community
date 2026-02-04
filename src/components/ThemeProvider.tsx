"use client";

import { useEffect } from "react";

import { applyTheme, getStoredTheme } from "@/lib/theme/theme";

export default function ThemeProvider() {
  useEffect(() => {
    const stored = getStoredTheme();
    applyTheme(stored ?? "light");
  }, []);

  return null;
}
