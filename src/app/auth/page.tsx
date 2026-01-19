import { Suspense } from "react";

import AuthClient from "@/app/auth/AuthClient";

export default function AuthLandingPage() {
  return (
    <Suspense fallback={<div className="p-6">Загрузка…</div>}>
      <AuthClient />
    </Suspense>
  );
}
