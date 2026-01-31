"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const isDev = process.env.NODE_ENV === "development";

export default function DevLoginButton() {
  const router = useRouter();
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");

  if (!isDev) {
    return null;
  }

  const handleClick = async () => {
    if (status === "loading") {
      return;
    }

    setStatus("loading");
    try {
      const response = await fetch("/api/dev/login", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("dev login failed");
      }

      router.replace("/");
    } catch {
      setStatus("error");
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "loading"}
        className="bubble-btn w-full rounded-full px-5 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60 pressable"
      >
        {status === "loading" ? "Входим..." : "Войти как разработчик"}
      </button>
      {status === "error" ? (
        <p className="text-xs text-rose-500">
          Не удалось войти. Проверьте dev API.
        </p>
      ) : null}
    </div>
  );
}
